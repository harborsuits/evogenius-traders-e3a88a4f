import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Strategy decision types
type Decision = 'buy' | 'sell' | 'hold';
type StrategyTemplate = 'trend_pullback' | 'mean_reversion' | 'breakout';

interface MarketData {
  symbol: string;
  price: number;
  change_24h: number;
  volume_24h: number;
  ema_50_slope: number;
  atr_ratio: number;
  regime: string;
  updated_at: string;
}

type AgentRole = 'core' | 'explorer';

interface Agent {
  id: string;
  generation_id: string;
  strategy_template: StrategyTemplate;
  genes: Record<string, number>;
  capital_allocation: number;
  status: string;
  role: AgentRole;
}

interface TradeTags {
  strategy_template: string;
  regime_at_entry: string;
  entry_reason: string[];
  exit_reason?: string;
  confidence: number;
  pattern_id: string;
  test_mode?: boolean;
  drought_mode?: boolean;
  explorer_mode?: boolean;
  market_snapshot: {
    price: number;
    change_24h: number;
    ema_50_slope: number;
    atr_ratio: number;
    age_seconds: number;
  };
  // Phase 5: Transaction cost awareness (DATA ONLY)
  cost_context?: {
    estimated_fee_pct: number;      // Expected fee %
    estimated_slippage_bps: number; // Expected slippage basis points
    spread_bps?: number;            // Bid-ask spread if available
  };
  // Phase 5: Market regime context (READ-ONLY)
  regime_context?: MarketRegimeContext;
}

// Gate failure telemetry for learning
interface GateFailure {
  gate: string;
  actual: number;
  threshold: number;
  margin: number; // How far from passing (negative = failed by this much)
}

// ===========================================================================
// PHASE 5: MARKET REGIME CLASSIFIER (READ-ONLY, NO BEHAVIOR CHANGE)
// ===========================================================================
type MarketRegimeLabel = 'trend' | 'chop' | 'volatile' | 'dead';

interface MarketRegimeContext {
  regime: MarketRegimeLabel;
  trend_strength: number;      // -1 to 1 (direction + magnitude)
  volatility_level: number;    // 0 to 2+ (relative to baseline)
  htf_trend_bias: 'bullish' | 'bearish' | 'neutral';
  htf_volatility_state: 'expanding' | 'contracting' | 'stable';
}

// Determine enhanced market regime with context flags
function classifyMarketRegime(market: MarketData): MarketRegimeContext {
  const slope = market.ema_50_slope;
  const atr = market.atr_ratio;
  const change = Math.abs(market.change_24h);
  
  // Trend strength: normalized slope (-1 to 1)
  const trendStrength = Math.max(-1, Math.min(1, slope / 0.05));
  
  // Volatility level: ATR ratio (baseline = 1.0)
  const volatilityLevel = atr;
  
  // Classify regime
  let regime: MarketRegimeLabel;
  if (atr > 1.5 || change > 8) {
    regime = 'volatile';
  } else if (atr < 0.6 && Math.abs(slope) < 0.003) {
    regime = 'dead';
  } else if (Math.abs(slope) > 0.015) {
    regime = 'trend';
  } else {
    regime = 'chop';
  }
  
  // HTF context flags (simple heuristics for now - no gating logic)
  const htfTrendBias: 'bullish' | 'bearish' | 'neutral' = 
    slope > 0.01 ? 'bullish' : slope < -0.01 ? 'bearish' : 'neutral';
  
  const htfVolatilityState: 'expanding' | 'contracting' | 'stable' = 
    atr > 1.3 ? 'expanding' : atr < 0.8 ? 'contracting' : 'stable';
  
  return {
    regime,
    trend_strength: trendStrength,
    volatility_level: volatilityLevel,
    htf_trend_bias: htfTrendBias,
    htf_volatility_state: htfVolatilityState,
  };
}

// Legacy regime function (for backward compat)
function getRegime(market: MarketData): string {
  const slope = market.ema_50_slope;
  const atr = market.atr_ratio;
  
  if (atr > 1.5) return 'high_volatility';
  if (atr < 0.75) return 'low_volatility';
  if (Math.abs(slope) > 0.02) return 'trending';
  if (Math.abs(slope) < 0.01) return 'ranging';
  return 'unknown';
}

// Calculate data age in seconds
function getDataAge(updatedAt: string): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000);
}

// ===========================================================================
// THRESHOLD CONFIGURATION
// ===========================================================================

// BASELINE THRESHOLDS - Conservative default (normal mode)
const BASELINE_THRESHOLDS = {
  trend_threshold: 0.005,      // 0.5% EMA slope
  pullback_pct: 5.0,           // 5% pullback tolerance
  rsi_threshold: 0.6,          // 0.6% move in 24h
  vol_contraction: 1.3,        // ATR ratio < 1.3
  vol_expansion_exit: 1.2,
  min_confidence: 0.5,
  max_confidence: 0.85,
};

// DROUGHT MODE THRESHOLDS - Relaxed to generate trades for learning
// Only ONE gate is relaxed at a time to maintain quality
const DROUGHT_THRESHOLDS = {
  trend_threshold: 0.0035,     // 30% looser
  pullback_pct: 3.0,           // 40% looser  
  rsi_threshold: 0.4,          // 33% looser
  vol_contraction: 1.4,        // 8% looser
  vol_expansion_exit: 1.3,
  min_confidence: 0.5,
  max_confidence: 0.85,
};

// DROUGHT MODE SAFETY CAPS
const DROUGHT_SAFETY = {
  max_trades_per_hour: 2,
  size_multiplier: 0.5,        // 50% normal size
  max_drawdown_pct: 2.0,       // Kill drought if drawdown > 2%
  min_cash_pct: 50,            // Must have 50%+ cash to trade in drought
  vol_spike_atr: 1.8,          // Exit drought if ATR ratio > 1.8
  kill_cooldown_hours: 4,      // Cooldown after a kill
};

// EXPLORER AGENT CONSTRAINTS (stricter than general drought)
const EXPLORER_CONSTRAINTS = {
  size_multiplier: 0.25,       // 25% normal size (half of drought)
  max_trades_per_hour: 1,      // Stricter cap
  min_confidence: 0.55,        // Higher quality floor
};

// TEST MODE THRESHOLDS - VERY loose for pipeline validation only
// These must be MORE permissive than baseline to force trades
const TEST_MODE_THRESHOLDS = {
  trend_threshold: 0.001,        // Much looser than 0.005 - almost any slope
  pullback_pct: 15.0,            // Much looser than 5.0 - large pullbacks OK
  rsi_threshold: 0.2,            // Much looser than 0.6 - tiny moves trigger
  vol_contraction: 2.0,          // Much looser than 1.3 - even high vol OK
  vol_expansion_exit: 2.5,       // Looser exit trigger
  min_confidence: 0.3,           // Lower confidence floor
  max_confidence: 0.85,
};

// Drought detection thresholds
const DROUGHT_DETECTION = {
  min_holds_short_window: 20,   // Min holds in 6h window to trigger
  min_holds_long_window: 80,    // Min holds in 48h window to trigger
  max_orders_short_window: 3,   // Max orders in 6h to be considered drought
  max_orders_long_window: 10,   // Max orders in 48h to be considered drought
  short_window_hours: 6,
  long_window_hours: 48,
};

// ===========================================================================
// ADAPTIVE TUNING - Gate classification for offset direction
// ===========================================================================
type GateKind = 'min' | 'max';

// Gate classification: 'min' = relax by lowering, 'max' = relax by raising
const GATE_KINDS: Record<string, GateKind> = {
  trend: 'min',          // min_confidence-like: lower = easier to pass
  rsi: 'min',            // min threshold: lower = easier to pass  
  pullback: 'max',       // max pullback tolerance: higher = easier to pass
  vol_contraction: 'max', // max ATR ratio: higher = easier to pass
};

interface AdaptiveTuningConfig {
  enabled: boolean;
  mode: 'drought_only' | 'always';
  window_decisions: number;
  cooldown_minutes: number;
  step_pct: number;
  max_relax_pct: number;
  decay_step_pct: number;
  last_adjusted_at: string | null;
  offsets: Record<string, number>; // gate_name: fractional offset (negative = relax)
  // Phase 4A Guardrails
  frozen_until?: string | null;
  frozen_reason?: string | null;
  freeze_after_kill_hours?: number;  // e.g. 6
  freeze_peak_dd_pct?: number;       // e.g. 3.0
  max_total_relax_pct?: number;      // e.g. 0.25 - global cap on sum(|offsets|)
  // Phase 4B Quality Filter
  min_conf_for_tuning?: number;      // e.g. 0.50 - min confidence to count as quality signal
  min_quality_pct?: number;          // e.g. 0.40 - min % of window with quality decisions
  max_single_gate_pct?: number;      // e.g. 0.80 - prevent over-tuning one gate
}

// Apply adaptive offsets to thresholds
function applyAdaptiveOffsets(
  thresholds: typeof BASELINE_THRESHOLDS,
  offsets: Record<string, number> | undefined
): typeof BASELINE_THRESHOLDS {
  if (!offsets || Object.keys(offsets).length === 0) {
    return thresholds;
  }
  
  const out = { ...thresholds };
  
  // Map gate names to threshold keys
  const gateToThreshold: Record<string, keyof typeof BASELINE_THRESHOLDS> = {
    trend: 'trend_threshold',
    rsi: 'rsi_threshold',
    pullback: 'pullback_pct',
    vol_contraction: 'vol_contraction',
  };
  
  for (const [gate, offset] of Object.entries(offsets)) {
    const thresholdKey = gateToThreshold[gate];
    if (!thresholdKey || !(thresholdKey in out)) continue;
    
    const kind = GATE_KINDS[gate];
    if (!kind) continue;
    
    const base = out[thresholdKey] as number;
    const delta = Math.abs(base * offset);
    
    // offset < 0 relaxes the gate
    // - 'min' gates: relax by subtracting (lower threshold = easier)
    // - 'max' gates: relax by adding (higher threshold = easier)
    if (kind === 'min') {
      (out as Record<string, number>)[thresholdKey] = offset < 0 ? base - delta : base + delta;
    } else {
      (out as Record<string, number>)[thresholdKey] = offset < 0 ? base + delta : base - delta;
    }
  }
  
  return out;
}

// Decay offsets back toward 0 when not in drought
function decayOffsets(
  offsets: Record<string, number>,
  decayStep: number,
  maxRelax: number
): Record<string, number> {
  const out: Record<string, number> = { ...offsets };
  
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v < 0) out[k] = Math.min(0, v + decayStep);  // Move toward 0
    if (v > 0) out[k] = Math.max(0, v - decayStep);
    // Clamp
    out[k] = Math.max(-maxRelax, Math.min(maxRelax, out[k]));
    // Remove negligible offsets
    if (Math.abs(out[k]) < 0.001) delete out[k];
  }
  
  return out;
}

// ===========================================================================
// PHASE 4C: RE-TIGHTEN LOGIC
// Moves offsets back toward 0 faster when conditions improve:
// - Trades are flowing (not just holds)
// - Drought cleared and stayed cleared
// - Performance is stable (no recent kills)
// ===========================================================================
interface RetightenConfig {
  enabled: boolean;
  min_cycles_clear: number;      // Min cycles with drought cleared before aggressive retighten
  retighten_step_pct: number;    // Step size for retighten (typically 2-3x decay)
  min_trades_flowing: number;    // Min trades in window to consider "flowing"
  flow_window_hours: number;     // Window to check trade flow
  cooldown_after_kill_hours: number; // Don't retighten if recent kill
}

const DEFAULT_RETIGHTEN_CONFIG: RetightenConfig = {
  enabled: true,
  min_cycles_clear: 5,           // 5 cycles (~25 min at 5min interval)
  retighten_step_pct: 0.03,      // 3% per cycle (3x normal decay)
  min_trades_flowing: 2,         // At least 2 trades in window
  flow_window_hours: 6,          // 6h lookback for trade flow
  cooldown_after_kill_hours: 6,  // Wait 6h after kill before retightening
};

// Re-tighten: move offsets toward 0 faster than decay
function retightenOffsets(
  offsets: Record<string, number>,
  retightenStep: number,
  maxRelax: number
): { next: Record<string, number>; changes: Record<string, { from: number; to: number }> } {
  const out: Record<string, number> = { ...offsets };
  const changes: Record<string, { from: number; to: number }> = {};
  
  for (const k of Object.keys(out)) {
    const v = out[k];
    const prev = v;
    
    // Move toward 0 with larger step
    if (v < 0) out[k] = Math.min(0, v + retightenStep);
    if (v > 0) out[k] = Math.max(0, v - retightenStep);
    
    // Clamp
    out[k] = Math.max(-maxRelax, Math.min(maxRelax, out[k]));
    
    // Track changes for logging
    if (Math.abs(out[k] - prev) > 0.0001) {
      changes[k] = { from: prev, to: out[k] };
    }
    
    // Remove negligible offsets
    if (Math.abs(out[k]) < 0.001) delete out[k];
  }
  
  return { next: out, changes };
}

// Check if retighten conditions are met
async function shouldRetighten(
  supabase: any,
  droughtResolved: ResolvedDroughtState,
  config: RetightenConfig
): Promise<{ should: boolean; reason?: string; tradeCount?: number; cyclesClear?: number }> {
  // Must have drought cleared
  if (droughtResolved.detected || droughtResolved.active) {
    return { should: false, reason: 'drought_still_active' };
  }
  
  const now = new Date();
  
  // Check for recent kill (don't retighten during recovery)
  const killCooldownStart = new Date(now.getTime() - config.cooldown_after_kill_hours * 60 * 60 * 1000);
  const { count: recentKillCount } = await supabase
    .from('control_events')
    .select('*', { count: 'exact', head: true })
    .eq('action', 'drought_kill')
    .gte('triggered_at', killCooldownStart.toISOString());
  
  if ((recentKillCount ?? 0) > 0) {
    return { should: false, reason: 'recent_kill_cooldown' };
  }
  
  // Check trade flow (are trades actually happening?)
  const flowWindowStart = new Date(now.getTime() - config.flow_window_hours * 60 * 60 * 1000);
  const { count: tradeCount } = await supabase
    .from('paper_orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', flowWindowStart.toISOString())
    .eq('status', 'filled');
  
  const tradesFlowing = (tradeCount ?? 0) >= config.min_trades_flowing;
  
  // Count cycles since last drought detection
  const { data: recentDecisions } = await supabase
    .from('control_events')
    .select('metadata')
    .eq('action', 'trade_decision')
    .order('triggered_at', { ascending: false })
    .limit(config.min_cycles_clear + 5);
  
  let cyclesClear = 0;
  for (const d of recentDecisions ?? []) {
    const m = (d.metadata ?? {}) as Record<string, unknown>;
    const droughtState = m.drought_state as { detected?: boolean } | undefined;
    if (droughtState?.detected === false) {
      cyclesClear++;
    } else {
      break; // Stop counting when we hit a drought detection
    }
  }
  
  const droughtClearEnough = cyclesClear >= config.min_cycles_clear;
  
  if (tradesFlowing && droughtClearEnough) {
    return { 
      should: true, 
      reason: 'conditions_improved',
      tradeCount: tradeCount ?? 0,
      cyclesClear,
    };
  }
  
  // Partial success: trades flowing but drought just cleared
  if (tradesFlowing && !droughtClearEnough) {
    return { 
      should: false, 
      reason: `waiting_cycles_clear_${cyclesClear}/${config.min_cycles_clear}`,
      tradeCount: tradeCount ?? 0,
      cyclesClear,
    };
  }
  
  return { 
    should: false, 
    reason: 'trades_not_flowing',
    tradeCount: tradeCount ?? 0,
    cyclesClear,
  };
}

// Pick the best gate to relax: prioritize nearest_pass counts, then failure counts
function pickCandidateGate(
  nearestCounts: Record<string, number>,
  failCounts: Record<string, number>
): string | undefined {
  // Sort by nearest_pass frequency (most blocked gate that almost passes)
  const nearestSorted = Object.entries(nearestCounts)
    .filter(([gate]) => gate in GATE_KINDS)
    .sort((a, b) => b[1] - a[1]);
  
  if (nearestSorted.length > 0) {
    return nearestSorted[0][0];
  }
  
  // Fallback: most frequently failing gate
  const failSorted = Object.entries(failCounts)
    .filter(([gate]) => gate in GATE_KINDS)
    .sort((a, b) => b[1] - a[1]);
  
  return failSorted.length > 0 ? failSorted[0][0] : undefined;
}

// Check if tuning is frozen and should stay frozen
async function checkTuningFreeze(
  supabase: any,
  tuning: AdaptiveTuningConfig,
  droughtResolved: ResolvedDroughtState,
  cfg: Record<string, unknown>,
  configId: string
): Promise<{ frozen: boolean; reason?: string; capped?: boolean }> {
  const now = new Date();
  const alreadyFrozenUntil = tuning.frozen_until ? new Date(tuning.frozen_until) : null;
  const alreadyFrozen = alreadyFrozenUntil && alreadyFrozenUntil > now;
  const currentReason = tuning.frozen_reason ?? null;
  
  // Check existing freeze - still valid?
  if (alreadyFrozen) {
    return { frozen: true, reason: currentReason ?? 'frozen' };
  }
  
  // Freeze expired - clear it (only if there was one)
  if (tuning.frozen_until && !alreadyFrozen) {
    await supabase.from('system_config').update({
      config: {
        ...cfg,
        adaptive_tuning: { ...tuning, frozen_until: null, frozen_reason: null },
      },
      updated_at: now.toISOString(),
    }).eq('id', configId);
  }
  
  const freezeAfterKillHours = tuning.freeze_after_kill_hours ?? 6;
  const freezePeakDdPct = tuning.freeze_peak_dd_pct ?? 3.0;
  const maxTotalRelaxPct = tuning.max_total_relax_pct ?? 0.25;
  
  // Helper to persist freeze and log event (only when transitioning)
  const applyFreeze = async (freezeUntil: string, freezeReason: string, trigger: string, extraMeta: Record<string, unknown> = {}) => {
    const isNewFreeze = !alreadyFrozen || currentReason !== freezeReason;
    
    await supabase.from('system_config').update({
      config: {
        ...cfg,
        adaptive_tuning: { ...tuning, frozen_until: freezeUntil, frozen_reason: freezeReason },
      },
      updated_at: now.toISOString(),
    }).eq('id', configId);
    
    // Only log event on transition (not every cycle)
    if (isNewFreeze) {
      await supabase.from('control_events').insert({
        action: 'adaptive_tuning_frozen',
        metadata: {
          reason: freezeReason,
          frozen_until: freezeUntil,
          trigger,
          offsets_snapshot: tuning.offsets,
          ...extraMeta,
        },
      });
      console.log(`[adaptive-tuning] FROZEN: ${freezeReason} until ${freezeUntil}`);
    }
  };
  
  // Check 1: Recent kill event - freeze until (kill_time + freezeAfterKillHours)
  const { data: lastKill } = await supabase
    .from('control_events')
    .select('triggered_at, metadata')
    .eq('action', 'drought_kill')
    .order('triggered_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (lastKill?.triggered_at) {
    const killAt = new Date(lastKill.triggered_at);
    const freezeUntilFromKill = new Date(killAt.getTime() + freezeAfterKillHours * 60 * 60 * 1000);
    
    if (freezeUntilFromKill > now) {
      const freezeReason = `kill_event_${freezeAfterKillHours}h`;
      await applyFreeze(freezeUntilFromKill.toISOString(), freezeReason, 'kill_event', {
        kill_at: lastKill.triggered_at,
      });
      return { frozen: true, reason: freezeReason };
    }
  }
  
  // Check 2: Peak equity drawdown
  if (droughtResolved.peakEquityDrawdownPct !== undefined && 
      droughtResolved.peakEquityDrawdownPct > freezePeakDdPct) {
    const freezeReason = `peak_dd_${droughtResolved.peakEquityDrawdownPct.toFixed(1)}pct`;
    const freezeUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(); // 2h freeze
    
    await applyFreeze(freezeUntil, freezeReason, 'peak_drawdown', {
      peak_dd_pct: droughtResolved.peakEquityDrawdownPct,
      threshold: freezePeakDdPct,
      equity: droughtResolved.equity,
      peak_equity: droughtResolved.peakEquity,
    });
    
    return { frozen: true, reason: freezeReason };
  }
  
  // Check 3: Global max relaxation cap - treat as CAPPED (short 15m freeze, decays naturally)
  const totalRelax = Object.values(tuning.offsets ?? {}).reduce((sum, v) => sum + Math.abs(v), 0);
  if (totalRelax >= maxTotalRelaxPct) {
    const freezeReason = `capped_${(totalRelax * 100).toFixed(0)}pct`;
    const freezeUntil = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15m cap-freeze
    
    await applyFreeze(freezeUntil, freezeReason, 'global_cap', {
      total_relax_pct: totalRelax,
      threshold: maxTotalRelaxPct,
    });
    
    console.log(`[adaptive-tuning] CAPPED: ${freezeReason} (15m pause, offsets will decay)`);
    return { frozen: true, reason: freezeReason, capped: true };
  }
  
  return { frozen: false };
}

// Main adaptive tuning logic - run at end of each cycle
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function maybeTuneThresholds(
  supabase: any,
  droughtResolved: ResolvedDroughtState
): Promise<void> {
  // Fetch config with id
  const { data: cfgRow } = await supabase
    .from('system_config')
    .select('id, config')
    .limit(1)
    .single();
  
  if (!cfgRow) return;
  
  const configId = cfgRow.id as string;
  const cfg = (cfgRow.config ?? {}) as Record<string, unknown>;
  const tuning = cfg.adaptive_tuning as AdaptiveTuningConfig | undefined;
  
  if (!tuning?.enabled) return;
  
  const now = new Date();
  
  // drought_only mode: decay OR retighten if not in drought
  if (tuning.mode === 'drought_only' && !droughtResolved.detected) {
    const currentOffsets = tuning.offsets ?? {};
    if (Object.keys(currentOffsets).length === 0) return;
    
    // *** PHASE 4C: Check if we should RETIGHTEN (faster return to baseline) ***
    const retightenConfig: RetightenConfig = {
      enabled: true,
      min_cycles_clear: 5,
      retighten_step_pct: tuning.decay_step_pct * 3, // 3x decay speed
      min_trades_flowing: 2,
      flow_window_hours: 6,
      cooldown_after_kill_hours: 6,
    };
    
    const retightenCheck = await shouldRetighten(supabase, droughtResolved, retightenConfig);
    
    if (retightenCheck.should) {
      // Aggressive retighten: conditions are good, move offsets toward 0 faster
      const { next: nextOffsets, changes } = retightenOffsets(
        currentOffsets, 
        retightenConfig.retighten_step_pct, 
        tuning.max_relax_pct
      );
      
      if (Object.keys(changes).length > 0) {
        await supabase.from('system_config').update({
          config: { 
            ...cfg, 
            adaptive_tuning: { ...tuning, offsets: nextOffsets } 
          },
          updated_at: now.toISOString(),
        }).eq('id', configId);
        
        // Log retighten event for auditability
        await supabase.from('control_events').insert({
          action: 'adaptive_tuning_retighten',
          metadata: {
            reason: retightenCheck.reason,
            changes,
            offsets_before: currentOffsets,
            offsets_after: nextOffsets,
            cycles_clear: retightenCheck.cyclesClear,
            trades_in_window: retightenCheck.tradeCount,
            retighten_step: retightenConfig.retighten_step_pct,
            baseline_thresholds: BASELINE_THRESHOLDS,
            effective_thresholds: applyAdaptiveOffsets(BASELINE_THRESHOLDS, nextOffsets),
          },
        });
        
        console.log(`[adaptive-tuning] RETIGHTEN: ${JSON.stringify(changes)} (cycles_clear: ${retightenCheck.cyclesClear})`);
      }
    } else {
      // Normal decay: drought cleared but conditions not yet ideal for retighten
      const nextOffsets = decayOffsets(currentOffsets, tuning.decay_step_pct, tuning.max_relax_pct);
      
      if (JSON.stringify(nextOffsets) !== JSON.stringify(currentOffsets)) {
        await supabase.from('system_config').update({
          config: { 
            ...cfg, 
            adaptive_tuning: { ...tuning, offsets: nextOffsets } 
          },
          updated_at: now.toISOString(),
        }).eq('id', configId);
        
        console.log(`[adaptive-tuning] Decay offsets (retighten blocked: ${retightenCheck.reason}):`, nextOffsets);
      }
    }
    return;
  }
  
  // Check if override is force_off (don't tune during force_off)
  if (droughtResolved.override === 'force_off') return;
  
  // *** PHASE 4A: Check freeze conditions ***
  const freezeCheck = await checkTuningFreeze(supabase, tuning, droughtResolved, cfg, configId);
  if (freezeCheck.frozen) {
    console.log(`[adaptive-tuning] Frozen: ${freezeCheck.reason}`);
    return;
  }
  
  // Check cooldown
  if (tuning.last_adjusted_at) {
    const msSinceAdjust = now.getTime() - new Date(tuning.last_adjusted_at).getTime();
    if (msSinceAdjust < tuning.cooldown_minutes * 60 * 1000) {
      console.log(`[adaptive-tuning] In cooldown (${Math.round(msSinceAdjust / 60000)}m of ${tuning.cooldown_minutes}m)`);
      return;
    }
  }
  
  // Read last N decisions
  const { data: decisions } = await supabase
    .from('control_events')
    .select('metadata')
    .eq('action', 'trade_decision')
    .order('triggered_at', { ascending: false })
    .limit(tuning.window_decisions);
  
  const rows = (decisions ?? []) as Array<{ metadata: Record<string, unknown> | null }>;
  const minRequired = Math.floor(tuning.window_decisions * 0.6);
  
  if (rows.length < minRequired) {
    console.log(`[adaptive-tuning] Not enough decisions (${rows.length}/${minRequired})`);
    return;
  }
  
  // *** PHASE 4B: Quality Filter ***
  const minConfForTuning = tuning.min_conf_for_tuning ?? 0.50;
  const minQualityPct = tuning.min_quality_pct ?? 0.30; // Lowered default to 30%
  const maxSingleGatePct = tuning.max_single_gate_pct ?? 0.80;
  
  // Helper: extract confidence from metadata (handles multiple paths)
  const getConfidence = (m: Record<string, unknown>): number | undefined => {
    // 1. Root level confidence (for buy/sell decisions)
    if (typeof m.confidence === 'number') return m.confidence;
    
    // 2. Check evaluations array for hold decisions (use max confidence from evaluated candidates)
    const evaluations = m.evaluations as Array<{ confidence?: number }> | undefined;
    if (evaluations && evaluations.length > 0) {
      const maxEvalConf = Math.max(...evaluations.map(e => e.confidence ?? 0));
      if (maxEvalConf > 0) return maxEvalConf;
    }
    
    // 3. Check nearest_pass - if it exists, it means a decision was close (implies some confidence)
    const nearestPass = m.nearest_pass as { gate?: string } | undefined;
    if (nearestPass?.gate) return minConfForTuning; // Treat near-pass as meeting min threshold
    
    return undefined;
  };
  
  // Filter to quality decisions (high-confidence holds/near-misses)
  const qualityRows = rows.filter(r => {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    const conf = getConfidence(m);
    return conf !== undefined && conf >= minConfForTuning;
  });
  
  const qualityRatio = rows.length > 0 ? qualityRows.length / rows.length : 0;
  
  // Fallback: if quality filter fails, allow tuning with reduced step (half power)
  let useReducedStep = false;
  if (qualityRatio < minQualityPct) {
    // Only allow reduced-step tuning if drought is active (more permissive during drought)
    if (droughtResolved.detected) {
      useReducedStep = true;
      console.log(`[adaptive-tuning] Quality filter soft-fail: ${(qualityRatio * 100).toFixed(0)}% < ${(minQualityPct * 100).toFixed(0)}%, using half step (drought active)`);
    } else {
      console.log(`[adaptive-tuning] Quality filter failed: ${(qualityRatio * 100).toFixed(0)}% < ${(minQualityPct * 100).toFixed(0)}% quality decisions`);
      return;
    }
  }
  
  // Aggregate gate telemetry from QUALITY decisions only
  const failCounts: Record<string, number> = {};
  const nearestCounts: Record<string, number> = {};
  
  for (const r of qualityRows) {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    
    // Count nearest_pass occurrences (high-confidence near-misses)
    const nearestPass = m.nearest_pass as { gate?: string; margin?: number } | undefined;
    if (nearestPass?.gate) {
      nearestCounts[nearestPass.gate] = (nearestCounts[nearestPass.gate] ?? 0) + 1;
    }
    
    // Count gate failures
    const gateFailures = (m.gate_failures ?? {}) as Record<string, { count?: number }>;
    for (const [gate, stats] of Object.entries(gateFailures)) {
      const c = stats?.count ?? 1;
      failCounts[gate] = (failCounts[gate] ?? 0) + c;
    }
  }
  
  // Pick candidate gate to relax
  const candidate = pickCandidateGate(nearestCounts, failCounts);
  if (!candidate) {
    console.log('[adaptive-tuning] No candidate gate found in quality decisions');
    return;
  }
  
  // Check single-gate dominance (prevent over-tuning one gate)
  const totalNearestPasses = Object.values(nearestCounts).reduce((a, b) => a + b, 0);
  if (totalNearestPasses > 0) {
    const candidateDominance = (nearestCounts[candidate] ?? 0) / totalNearestPasses;
    if (candidateDominance > maxSingleGatePct) {
      console.log(`[adaptive-tuning] Single-gate dominance: ${candidate} at ${(candidateDominance * 100).toFixed(0)}% > ${(maxSingleGatePct * 100).toFixed(0)}% (suspicious)`);
      // Still allow but log warning - could make this a hard block if desired
    }
  }
  
  const offsets = { ...(tuning.offsets ?? {}) };
  const currentOffset = offsets[candidate] ?? 0;
  
  // Apply step reduction if quality filter soft-failed
  const effectiveStep = useReducedStep ? tuning.step_pct * 0.5 : tuning.step_pct;
  
  // Relax = make more negative, bounded by max_relax_pct
  const nextOffset = Math.max(currentOffset - effectiveStep, -tuning.max_relax_pct);
  
  // Only update if there's a change
  if (Math.abs(nextOffset - currentOffset) < 0.001) {
    console.log(`[adaptive-tuning] Gate ${candidate} already at max relax (${currentOffset})`);
    return;
  }
  
  offsets[candidate] = nextOffset;
  
  const nextConfig = {
    ...cfg,
    adaptive_tuning: {
      ...tuning,
      offsets,
      last_adjusted_at: now.toISOString(),
    },
  };
  
  await supabase.from('system_config').update({
    config: nextConfig,
    updated_at: now.toISOString(),
  }).eq('id', configId);
  
  // Log the tuning event with enhanced audit payload including quality filter metrics
  await supabase.from('control_events').insert({
    action: 'adaptive_tuning_update',
    metadata: {
      gate: candidate,
      previous_offset: currentOffset,
      new_offset: nextOffset,
      step_used: effectiveStep,
      reduced_step: useReducedStep,
      nearest_counts: nearestCounts,
      fail_counts: failCounts,
      window_size: rows.length,
      quality_window_size: qualityRows.length,
      quality_ratio: qualityRatio,
      min_conf_for_tuning: minConfForTuning,
      mode_active: droughtResolved.detected ? 'drought' : 'normal',
      baseline_thresholds: BASELINE_THRESHOLDS,
      effective_thresholds: applyAdaptiveOffsets(BASELINE_THRESHOLDS, offsets),
    },
  });
  
  console.log(`[adaptive-tuning] Relaxed gate '${candidate}': ${currentOffset.toFixed(3)} → ${nextOffset.toFixed(3)}`);
}

// ===========================================================================
// LEARNABLE TRADE FILTER
// ===========================================================================
interface TradeTagsForLearning {
  test_mode?: boolean;
  drought_mode?: boolean;
  entry_reason?: string[];
}

function isLearnableTrade(tags: TradeTagsForLearning): boolean {
  if (tags.test_mode === true) return false;
  if (tags.entry_reason?.includes('test_mode')) return false;
  // Drought mode trades ARE learnable - they just use relaxed thresholds
  return true;
}

// Confidence calibration - returns split components for observability
interface ConfidenceComponents {
  signal_confidence: number;      // Raw setup/signal quality (0-1)
  maturity_multiplier: number;    // Agent experience factor (0.1-1.0)  
  final_confidence: number;       // Combined final confidence
}

function calibrateConfidence(rawConfidence: number, tradeCount: number): ConfidenceComponents {
  const MIN_TRADES_FOR_FULL_CONFIDENCE = 30;
  const MIN_MATURITY = 0.1; // Floor so new agents aren't completely crushed
  const maturityMultiplier = Math.max(MIN_MATURITY, Math.min(1, tradeCount / MIN_TRADES_FOR_FULL_CONFIDENCE));
  return {
    signal_confidence: rawConfidence,
    maturity_multiplier: maturityMultiplier,
    final_confidence: rawConfidence * maturityMultiplier,
  };
}

// ===========================================================================
// DROUGHT DETECTION
// ===========================================================================
interface DroughtState {
  isActive: boolean;
  shortWindowHolds: number;
  shortWindowOrders: number;
  longWindowHolds: number;
  longWindowOrders: number;
  triggeredAt?: string;
  reason?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function detectDrought(supabase: any): Promise<DroughtState> {
  const now = new Date();
  const shortWindowStart = new Date(now.getTime() - DROUGHT_DETECTION.short_window_hours * 60 * 60 * 1000).toISOString();
  const longWindowStart = new Date(now.getTime() - DROUGHT_DETECTION.long_window_hours * 60 * 60 * 1000).toISOString();
  
  // Use count-only queries (head: true) to avoid dragging rows over network
  const { count: shortHoldsCount } = await supabase
    .from('control_events')
    .select('*', { count: 'exact', head: true })
    .eq('action', 'trade_decision')
    .gte('triggered_at', shortWindowStart)
    .eq('metadata->>decision', 'hold');
  
  const { count: shortOrdersCount } = await supabase
    .from('paper_orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', shortWindowStart)
    .eq('status', 'filled');
  
  const { count: longHoldsCount } = await supabase
    .from('control_events')
    .select('*', { count: 'exact', head: true })
    .eq('action', 'trade_decision')
    .gte('triggered_at', longWindowStart)
    .eq('metadata->>decision', 'hold');
  
  const { count: longOrdersCount } = await supabase
    .from('paper_orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', longWindowStart)
    .eq('status', 'filled');
  
  const shortWindowHolds = shortHoldsCount ?? 0;
  const shortWindowOrders = shortOrdersCount ?? 0;
  const longWindowHolds = longHoldsCount ?? 0;
  const longWindowOrders = longOrdersCount ?? 0;
  
  // Determine if drought is active
  const shortDrought = shortWindowHolds >= DROUGHT_DETECTION.min_holds_short_window && 
                       shortWindowOrders <= DROUGHT_DETECTION.max_orders_short_window;
  const longDrought = longWindowHolds >= DROUGHT_DETECTION.min_holds_long_window && 
                      longWindowOrders <= DROUGHT_DETECTION.max_orders_long_window;
  
  const isActive = shortDrought || longDrought;
  
  let reason: string | undefined;
  if (shortDrought && longDrought) {
    reason = `sustained_drought_${DROUGHT_DETECTION.long_window_hours}h`;
  } else if (shortDrought) {
    reason = `short_drought_${DROUGHT_DETECTION.short_window_hours}h`;
  } else if (longDrought) {
    reason = `long_drought_${DROUGHT_DETECTION.long_window_hours}h`;
  }
  
  return {
    isActive,
    shortWindowHolds,
    shortWindowOrders,
    longWindowHolds,
    longWindowOrders,
    triggeredAt: isActive ? now.toISOString() : undefined,
    reason,
  };
}

// ===========================================================================
// DROUGHT MODE RESOLVER - Single source of truth for drought state
// ===========================================================================
interface ResolvedDroughtState {
  detected: boolean;
  active: boolean;
  blocked: boolean;
  blockReason?: string;
  killed: boolean;
  killReason?: string;
  cooldownUntil?: string;
  override: 'auto' | 'force_off' | 'force_on';
  detection: DroughtState;
  equityDrawdownPct?: number;
  peakEquityDrawdownPct?: number;
  equity?: number;
  peakEquity?: number;
}

// Compute true equity = cash + sum(position_qty * current_price)
async function computeEquity(
  supabase: any,
  accountId: string,
  marketBySymbol: Map<string, MarketData>
): Promise<{ cash: number; positionsValue: number; equity: number; peakEquity: number }> {
  const { data: account } = await supabase
    .from('paper_accounts')
    .select('cash, peak_equity')
    .eq('id', accountId)
    .single();
  
  const cash = account?.cash ?? 0;
  const peakEquity = account?.peak_equity ?? 1000;
  
  const { data: positions } = await supabase
    .from('paper_positions')
    .select('symbol, qty')
    .eq('account_id', accountId);
  
  let positionsValue = 0;
  for (const pos of positions ?? []) {
    const market = marketBySymbol.get(pos.symbol);
    if (market && pos.qty > 0) {
      positionsValue += pos.qty * market.price;
    }
  }
  
  const equity = cash + positionsValue;
  
  // Update peak equity if current equity is higher
  if (equity > peakEquity) {
    await supabase
      .from('paper_accounts')
      .update({ 
        peak_equity: equity, 
        peak_equity_updated_at: new Date().toISOString() 
      })
      .eq('id', accountId);
    
    return { cash, positionsValue, equity, peakEquity: equity };
  }
  
  return { cash, positionsValue, equity, peakEquity };
}

async function resolveDroughtMode(
  supabase: any,
  accountId: string,
  startingCash: number,
  marketData: MarketData[],
  marketBySymbol: Map<string, MarketData>,
  evaluatedSymbols: string[] = []
): Promise<ResolvedDroughtState> {
  // 1. Get detection state
  const detection = await detectDrought(supabase);
  
  // 2. Get system config for override + cooldown state - MUST select id
  const { data: configData } = await supabase
    .from('system_config')
    .select('id, config')
    .limit(1)
    .single();
  
  const configId = configData?.id;
  const config = configData?.config ?? {};
  const override = (config.drought_override ?? 'auto') as 'auto' | 'force_off' | 'force_on';
  const cooldownUntil = config.drought_cooldown_until as string | undefined;
  
  // 3. Check cooldown
  const now = new Date();
  const inCooldown = cooldownUntil && new Date(cooldownUntil) > now;
  
  // 4. Check if force_off
  if (override === 'force_off') {
    return {
      detected: detection.isActive,
      active: false,
      blocked: true,
      blockReason: 'force_off_override',
      killed: false,
      override,
      detection,
    };
  }
  
  // 5. Check cooldown
  if (inCooldown) {
    return {
      detected: detection.isActive,
      active: false,
      blocked: true,
      blockReason: 'cooldown_active',
      killed: false,
      cooldownUntil,
      override,
      detection,
    };
  }
  
  // 6. Determine if should be active (auto or force_on)
  const shouldBeActive = override === 'force_on' || detection.isActive;
  
  // 7. Compute TRUE equity (not just cash) and get peak equity
  const { cash, positionsValue, equity, peakEquity } = await computeEquity(supabase, accountId, marketBySymbol);
  
  // Calculate both metrics:
  // - equityDrawdownPct: vs starting cash (legacy/informational)
  // - peakEquityDrawdownPct: vs peak equity (true max drawdown - used for kill)
  const equityDrawdownPct = ((startingCash - equity) / startingCash) * 100;
  const peakEquityDrawdownPct = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
  const cashPct = (cash / startingCash) * 100;
  
  // 8. Kill check: drawdown FROM PEAK (true max drawdown)
  if (shouldBeActive && configId && peakEquityDrawdownPct > DROUGHT_SAFETY.max_drawdown_pct) {
    const cooldownEnd = new Date(now.getTime() + DROUGHT_SAFETY.kill_cooldown_hours * 60 * 60 * 1000).toISOString();
    
    await supabase
      .from('system_config')
      .update({ 
        config: { ...config, drought_cooldown_until: cooldownEnd },
        updated_at: now.toISOString(),
      })
      .eq('id', configId);
    
    await supabase.from('control_events').insert({
      action: 'drought_kill',
      metadata: {
        reason: 'peak_equity_drawdown',
        equity,
        peak_equity: peakEquity,
        starting_cash: startingCash,
        drawdown_from_peak_pct: peakEquityDrawdownPct,
        drawdown_from_start_pct: equityDrawdownPct,
        threshold: DROUGHT_SAFETY.max_drawdown_pct,
        cooldown_until: cooldownEnd,
      },
    });
    
    return {
      detected: detection.isActive,
      active: false,
      blocked: false,
      killed: true,
      killReason: `peak_drawdown_${peakEquityDrawdownPct.toFixed(1)}pct`,
      cooldownUntil: cooldownEnd,
      override,
      detection,
      equityDrawdownPct,
      peakEquityDrawdownPct,
      equity,
      peakEquity,
    };
  }
  
  // 9. Kill check: volatility spike on ANY evaluated symbol (not avg)
  const symbolsToCheck = evaluatedSymbols.length > 0 
    ? evaluatedSymbols 
    : marketData.slice(0, 3).map(m => m.symbol);
  
  for (const sym of symbolsToCheck) {
    const market = marketBySymbol.get(sym);
    if (market && market.atr_ratio > DROUGHT_SAFETY.vol_spike_atr) {
      return {
        detected: detection.isActive,
        active: false,
        blocked: false,
        killed: true,
        killReason: `vol_spike_${sym}_${market.atr_ratio.toFixed(2)}`,
        override,
        detection,
        equityDrawdownPct,
        peakEquityDrawdownPct,
        equity,
        peakEquity,
      };
    }
  }
  
  // 10. Block check: low cash (legitimate - can't buy with no cash)
  if (shouldBeActive && cashPct < DROUGHT_SAFETY.min_cash_pct) {
    return {
      detected: detection.isActive,
      active: false,
      blocked: true,
      blockReason: `low_cash_${cashPct.toFixed(0)}pct`,
      killed: false,
      override,
      detection,
      equityDrawdownPct,
      peakEquityDrawdownPct,
      equity,
      peakEquity,
    };
  }
  
  // 11. Block check: hourly cap for DROUGHT TRADES only
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentOrders } = await supabase
    .from('paper_orders')
    .select('tags')
    .gte('created_at', oneHourAgo)
    .eq('status', 'filled');
  
  const droughtOrderCount = (recentOrders ?? []).filter(
    (o: { tags: { drought_mode?: boolean } }) => o.tags?.drought_mode === true
  ).length;
  
  if (shouldBeActive && droughtOrderCount >= DROUGHT_SAFETY.max_trades_per_hour) {
    return {
      detected: detection.isActive,
      active: shouldBeActive,
      blocked: true,
      blockReason: `hourly_cap_${droughtOrderCount}`,
      killed: false,
      override,
      detection,
      equityDrawdownPct,
      peakEquityDrawdownPct,
      equity,
      peakEquity,
    };
  }
  
  return {
    detected: detection.isActive,
    active: shouldBeActive,
    blocked: false,
    killed: false,
    override,
    detection,
    equityDrawdownPct,
    peakEquityDrawdownPct,
    equity,
    peakEquity,
  };
}

// ===========================================================================
// GATE FAILURE ANALYSIS
// ===========================================================================
function analyzeGateFailures(
  agent: Agent,
  market: MarketData,
  thresholds: typeof BASELINE_THRESHOLDS
): GateFailure[] {
  const failures: GateFailure[] = [];
  const strategy = agent.strategy_template;
  
  if (strategy === 'trend_pullback') {
    // Check trend gate
    const slopeAbs = Math.abs(market.ema_50_slope);
    if (slopeAbs < thresholds.trend_threshold) {
      failures.push({
        gate: 'trend',
        actual: slopeAbs,
        threshold: thresholds.trend_threshold,
        margin: slopeAbs - thresholds.trend_threshold,
      });
    }
    
    // Check pullback gate
    const changeAbs = Math.abs(market.change_24h);
    if (changeAbs > thresholds.pullback_pct) {
      failures.push({
        gate: 'pullback',
        actual: changeAbs,
        threshold: thresholds.pullback_pct,
        margin: thresholds.pullback_pct - changeAbs,
      });
    }
  }
  
  if (strategy === 'mean_reversion') {
    // Check RSI-like gate (using 24h change)
    const changeAbs = Math.abs(market.change_24h);
    if (changeAbs < thresholds.rsi_threshold) {
      failures.push({
        gate: 'rsi',
        actual: changeAbs,
        threshold: thresholds.rsi_threshold,
        margin: changeAbs - thresholds.rsi_threshold,
      });
    }
  }
  
  if (strategy === 'breakout') {
    // Check volatility contraction gate
    if (market.atr_ratio >= thresholds.vol_contraction) {
      failures.push({
        gate: 'vol_contraction',
        actual: market.atr_ratio,
        threshold: thresholds.vol_contraction,
        margin: thresholds.vol_contraction - market.atr_ratio,
      });
    }
  }
  
  return failures;
}

// Find nearest passing gate (closest to threshold)
function findNearestPass(failures: GateFailure[]): GateFailure | undefined {
  if (failures.length === 0) return undefined;
  
  // Sort by margin (closest to 0 = closest to passing)
  return failures.sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))[0];
}

// ===========================================================================
// STRATEGY DECISION LOGIC
// ===========================================================================
function makeDecision(
  agent: Agent,
  market: MarketData,
  hasPosition: boolean,
  positionQty: number,
  testMode: boolean,
  droughtMode: boolean,
  agentTradeCount: number = 0
): { 
  decision: Decision; 
  reasons: string[]; 
  confidence: number;
  confidence_components: ConfidenceComponents;
  exitReason?: string;
  gateFailures: GateFailure[];
  nearestPass?: GateFailure;
} {
  const reasons: string[] = [];
  let confidenceComponents: ConfidenceComponents = { signal_confidence: 0.5, maturity_multiplier: 1, final_confidence: 0.5 };
  let exitReason: string | undefined;
  
  const regime = getRegime(market);
  const strategy = agent.strategy_template;
  const genes = agent.genes;
  
  // Threshold selection priority:
  // 1. Test mode: use TEST_MODE_THRESHOLDS
  // 2. Drought mode: use DROUGHT_THRESHOLDS (with adaptive offsets applied)
  // 3. Normal mode: use agent genes or BASELINE_THRESHOLDS
  let thresholds: typeof BASELINE_THRESHOLDS;
  if (testMode) {
    thresholds = TEST_MODE_THRESHOLDS;
  } else if (droughtMode) {
    thresholds = DROUGHT_THRESHOLDS;
    // Note: adaptive offsets are applied in the main handler where we have config access
  } else {
    thresholds = {
      trend_threshold: genes.trend_threshold ?? BASELINE_THRESHOLDS.trend_threshold,
      pullback_pct: genes.pullback_pct ?? BASELINE_THRESHOLDS.pullback_pct,
      rsi_threshold: genes.rsi_threshold ?? BASELINE_THRESHOLDS.rsi_threshold,
      vol_contraction: genes.vol_contraction ?? BASELINE_THRESHOLDS.vol_contraction,
      vol_expansion_exit: genes.vol_expansion_exit ?? BASELINE_THRESHOLDS.vol_expansion_exit,
      min_confidence: BASELINE_THRESHOLDS.min_confidence,
      max_confidence: BASELINE_THRESHOLDS.max_confidence,
    };
  }
  
  // Analyze gate failures for telemetry
  const gateFailures = analyzeGateFailures(agent, market, thresholds);
  const nearestPass = findNearestPass(gateFailures);
  
  // Trend Pullback Strategy
  if (strategy === 'trend_pullback') {
    const emaTrending = Math.abs(market.ema_50_slope) >= thresholds.trend_threshold;
    const pullback = Math.abs(market.change_24h) <= thresholds.pullback_pct;
    
    if (emaTrending && market.ema_50_slope > 0 && pullback && !hasPosition) {
      reasons.push('ema_trending_up', 'pullback_detected');
      if (testMode) reasons.push('test_mode');
      if (droughtMode) reasons.push('drought_mode');
      const rawConfidence = 0.6 + Math.min(0.2, Math.abs(market.ema_50_slope) * 5);
      confidenceComponents = calibrateConfidence(rawConfidence, agentTradeCount);
      return { decision: 'buy', reasons, confidence: confidenceComponents.final_confidence, confidence_components: confidenceComponents, gateFailures, nearestPass };
    }
    
    if (hasPosition && market.ema_50_slope < 0) {
      reasons.push('trend_reversal');
      exitReason = 'trend_reversal';
      confidenceComponents = calibrateConfidence(0.65, agentTradeCount);
      return { decision: 'sell', reasons, confidence: confidenceComponents.final_confidence, confidence_components: confidenceComponents, exitReason, gateFailures, nearestPass };
    }
  }
  
  // Mean Reversion Strategy
  if (strategy === 'mean_reversion') {
    const oversold = market.change_24h < -thresholds.rsi_threshold;
    const overbought = market.change_24h > thresholds.rsi_threshold;
    
    if (oversold && !hasPosition && regime === 'ranging') {
      reasons.push('oversold', 'ranging_regime');
      if (testMode) reasons.push('test_mode');
      if (droughtMode) reasons.push('drought_mode');
      const rawConfidence = 0.55 + Math.min(0.2, Math.abs(market.change_24h) / 20);
      confidenceComponents = calibrateConfidence(rawConfidence, agentTradeCount);
      return { decision: 'buy', reasons, confidence: confidenceComponents.final_confidence, confidence_components: confidenceComponents, gateFailures, nearestPass };
    }
    
    if (overbought && hasPosition) {
      reasons.push('overbought', 'take_profit');
      exitReason = 'take_profit';
      confidenceComponents = calibrateConfidence(0.6, agentTradeCount);
      return { decision: 'sell', reasons, confidence: confidenceComponents.final_confidence, confidence_components: confidenceComponents, exitReason, gateFailures, nearestPass };
    }
  }
  
  // Breakout Strategy
  if (strategy === 'breakout') {
    const volatilityContraction = market.atr_ratio < thresholds.vol_contraction;
    
    if (volatilityContraction && market.ema_50_slope > 0 && !hasPosition) {
      reasons.push('volatility_contraction', 'upward_bias');
      if (testMode) reasons.push('test_mode');
      if (droughtMode) reasons.push('drought_mode');
      const rawConfidence = 0.5 + Math.min(0.15, (1 - market.atr_ratio) * 0.5);
      confidenceComponents = calibrateConfidence(rawConfidence, agentTradeCount);
      return { decision: 'buy', reasons, confidence: confidenceComponents.final_confidence, confidence_components: confidenceComponents, gateFailures, nearestPass };
    }
    
    if (hasPosition && market.atr_ratio > (thresholds.vol_expansion_exit ?? 1.4)) {
      reasons.push('volatility_spike', 'exit_breakout');
      exitReason = 'exit_breakout';
      confidenceComponents = calibrateConfidence(0.55, agentTradeCount);
      return { decision: 'sell', reasons, confidence: confidenceComponents.final_confidence, confidence_components: confidenceComponents, exitReason, gateFailures, nearestPass };
    }
  }
  
  reasons.push('no_signal');
  const holdConfidence = { signal_confidence: 0.5, maturity_multiplier: 1, final_confidence: 0.5 };
  return { decision: 'hold', reasons, confidence: 0.5, confidence_components: holdConfidence, gateFailures, nearestPass };
}

// Generate pattern ID from decision context
function generatePatternId(
  strategy: string,
  symbol: string,
  regime: string,
  reasons: string[]
): string {
  const reasonStr = reasons.slice(0, 2).join('_');
  return `${strategy}_${symbol.replace('-', '_').toLowerCase()}_${regime}_${reasonStr}`.substring(0, 50);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const startTime = Date.now();
  const cycleId = crypto.randomUUID();
  
  console.log(`[trade-cycle] Starting cycle ${cycleId}`);

  try {
    // 1. Check system state
    const { data: systemState, error: stateError } = await supabase
      .from('system_state')
      .select('status, trade_mode, current_generation_id')
      .limit(1)
      .single();

    if (stateError || !systemState) {
      console.error('[trade-cycle] Failed to get system state:', stateError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to get system state' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (systemState.status !== 'running') {
      console.log(`[trade-cycle] System not running (${systemState.status}), skipping`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'system_not_running' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (systemState.trade_mode !== 'paper') {
      console.log(`[trade-cycle] Not in paper mode (${systemState.trade_mode}), skipping`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'not_paper_mode' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get market data first (needed for drought resolution)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: marketDataList, error: marketError } = await supabase
      .from('market_data')
      .select('*')
      .gte('updated_at', fiveMinutesAgo)
      .order('volume_24h', { ascending: false });

    if (marketError || !marketDataList || marketDataList.length === 0) {
      console.log('[trade-cycle] No fresh market data available');
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_market_data' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[trade-cycle] ${marketDataList.length} symbols with fresh market data`);

    const marketBySymbol = new Map<string, MarketData>();
    for (const m of marketDataList) {
      marketBySymbol.set(m.symbol, m as MarketData);
    }
    
    const availableSymbols = marketDataList.map(m => m.symbol);

    // 3. Get paper account
    const { data: paperAccount } = await supabase
      .from('paper_accounts')
      .select('id, cash, starting_cash')
      .limit(1)
      .single();

    if (!paperAccount) {
      console.log('[trade-cycle] No paper account found');
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_account' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Resolve drought mode (includes detection, safety checks, kill logic)
    // Note: Pass marketBySymbol and evaluatedSymbols will be added after symbol selection
    const droughtResolved = await resolveDroughtMode(
      supabase, 
      paperAccount.id, 
      paperAccount.starting_cash,
      marketDataList as MarketData[],
      marketBySymbol
    );
    
    const droughtModeActive = droughtResolved.active && !droughtResolved.blocked;
    const droughtBlocked = droughtResolved.blocked;
    const droughtBlockReason = droughtResolved.blockReason;
    const droughtKilled = droughtResolved.killed;
    const droughtKillReason = droughtResolved.killReason;
    
    if (droughtResolved.detection.isActive) {
      console.log(`[trade-cycle] DROUGHT DETECTED: ${droughtResolved.detection.reason}`);
    }
    if (droughtModeActive) {
      console.log(`[trade-cycle] DROUGHT MODE ACTIVE (override=${droughtResolved.override})`);
    }
    if (droughtBlocked) {
      console.log(`[trade-cycle] DROUGHT MODE BLOCKED: ${droughtBlockReason}`);
    }
    if (droughtKilled) {
      console.log(`[trade-cycle] DROUGHT MODE KILLED: ${droughtKillReason}`);
    }

    // 5. Get active agents - fetch all, then filter by role based on drought state
    const { data: allAgents, error: agentsError } = await supabase
      .from('agents')
      .select('*')
      .eq('status', 'active')
      .limit(100);

    if (agentsError || !allAgents || allAgents.length === 0) {
      console.log('[trade-cycle] No active agents found');
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_agents' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Filter agents by role based on drought state
    // - Drought active: prefer explorer agents (they can use relaxed thresholds)
    // - Normal mode: use core agents only
    const explorerAgents = allAgents.filter((a: Agent) => a.role === 'explorer');
    const coreAgents = allAgents.filter((a: Agent) => a.role === 'core' || !a.role);
    
    let agents: Agent[];
    let usingExplorerAgent = false;
    
    if (droughtModeActive && explorerAgents.length > 0) {
      agents = explorerAgents as Agent[];
      usingExplorerAgent = true;
      console.log(`[trade-cycle] DROUGHT MODE: Using ${explorerAgents.length} explorer agents`);
    } else {
      agents = coreAgents as Agent[];
      if (droughtModeActive && explorerAgents.length === 0) {
        console.log('[trade-cycle] DROUGHT MODE: No explorer agents available, using core agents conservatively');
      }
    }

    // 6. Get current positions
    const { data: positions } = await supabase
      .from('paper_positions')
      .select('symbol, qty')
      .eq('account_id', paperAccount.id);

    const positionBySymbol = new Map<string, number>();
    for (const p of positions ?? []) {
      positionBySymbol.set(p.symbol, p.qty);
    }

    // 8. Pick one agent for this cycle
    const agentIndex = Math.floor(Date.now() / 60000) % agents.length;
    const agent = agents[agentIndex] as Agent;
    const isExplorerTrade = usingExplorerAgent && agent.role === 'explorer';
    
    // 9. Pick symbols using deterministic rotation
    const SYMBOLS_PER_AGENT = 3;
    const TIME_BUCKET_MINS = 5;
    
    const agentHash = agent.id.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
    const timeBucket = Math.floor(Date.now() / (TIME_BUCKET_MINS * 60000));
    
    const symbolsToEvaluate: string[] = [];
    for (let i = 0; i < SYMBOLS_PER_AGENT && i < availableSymbols.length; i++) {
      const offset = Math.floor(availableSymbols.length / SYMBOLS_PER_AGENT) * i;
      const symbolIndex = (agentHash + timeBucket + offset) % availableSymbols.length;
      const sym = availableSymbols[symbolIndex];
      if (!symbolsToEvaluate.includes(sym)) {
        symbolsToEvaluate.push(sym);
      }
    }
    
    console.log(`[trade-cycle] Agent ${agent.id.substring(0, 8)} evaluating ${symbolsToEvaluate.length} symbols: ${symbolsToEvaluate.join(', ')}`);
    
    // Get test mode flag and adaptive tuning config
    const { data: configData } = await supabase
      .from('system_config')
      .select('config')
      .limit(1)
      .single();
    
    const systemConfig = (configData?.config ?? {}) as Record<string, unknown>;
    const testMode = systemConfig.strategy_test_mode === true;
    const tuning = systemConfig.adaptive_tuning as AdaptiveTuningConfig | undefined;
    const offsets = tuning?.offsets ?? {};
    
    // Calculate effective thresholds with adaptive tuning
    const baselineThresholds = testMode ? TEST_MODE_THRESHOLDS : (droughtModeActive ? DROUGHT_THRESHOLDS : BASELINE_THRESHOLDS);
    const effectiveThresholds = tuning?.enabled ? applyAdaptiveOffsets(baselineThresholds, offsets) : baselineThresholds;
    
    const thresholdsUsed = testMode 
      ? 'test_mode' 
      : droughtModeActive 
        ? 'drought_mode' 
        : 'baseline';
    
    console.log(`[trade-cycle] Mode: ${thresholdsUsed} | Adaptive: ${tuning?.enabled ? 'ON' : 'OFF'} | Offsets: ${JSON.stringify(offsets)}`);
    
    // Get agent's trade count
    const { data: agentTradeData } = await supabase
      .from('paper_orders')
      .select('id')
      .eq('agent_id', agent.id)
      .eq('status', 'filled');
    const agentTradeCount = agentTradeData?.length ?? 0;
    
    const MAX_MARKET_AGE_SECONDS = 120;
    
    interface DecisionCandidate {
      symbol: string;
      market: MarketData;
      decision: Decision;
      reasons: string[];
      confidence: number;
      confidence_components: ConfidenceComponents;
      exitReason?: string;
      positionQty: number;
      gateFailures: GateFailure[];
      nearestPass?: GateFailure;
    }
    
    const candidates: DecisionCandidate[] = [];
    
    // Evaluate each symbol
    for (const sym of symbolsToEvaluate) {
      const mkt = marketBySymbol.get(sym);
      if (!mkt) continue;
      
      const age = getDataAge(mkt.updated_at);
      
      if (age > MAX_MARKET_AGE_SECONDS) {
        console.log(`[trade-cycle] ${sym} data stale (${age}s), skipping`);
        continue;
      }
      
      const regime = getRegime(mkt);
      const posQty = positionBySymbol.get(sym) ?? 0;
      const hasPos = posQty > 0;
      
      const result = makeDecision(agent, mkt, hasPos, posQty, testMode, droughtModeActive, agentTradeCount);
      
      candidates.push({
        symbol: sym,
        market: mkt,
        decision: result.decision,
        reasons: result.reasons,
        confidence: result.confidence,
        confidence_components: result.confidence_components,
        exitReason: result.exitReason,
        positionQty: posQty,
        gateFailures: result.gateFailures,
        nearestPass: result.nearestPass,
      });
      
      console.log(`[trade-cycle] ${sym}: ${result.decision} (signal=${result.confidence_components.signal_confidence.toFixed(2)}, maturity=${result.confidence_components.maturity_multiplier.toFixed(2)}, final=${result.confidence.toFixed(2)}, reasons=${result.reasons.join(',')})`);
    }
    
    // Pick best actionable candidate
    const actionableCandidates = candidates.filter(c => c.decision !== 'hold');
    const bestCandidate = actionableCandidates.sort((a, b) => b.confidence - a.confidence)[0];
    
    // Aggregate gate failure telemetry
    const allGateFailures: Record<string, { count: number; avgMargin: number }> = {};
    let nearestPassGlobal: GateFailure | undefined = undefined;
    
    for (const c of candidates) {
      for (const f of c.gateFailures) {
        if (!allGateFailures[f.gate]) {
          allGateFailures[f.gate] = { count: 0, avgMargin: 0 };
        }
        allGateFailures[f.gate].count++;
        allGateFailures[f.gate].avgMargin = 
          (allGateFailures[f.gate].avgMargin * (allGateFailures[f.gate].count - 1) + f.margin) / 
          allGateFailures[f.gate].count;
      }
      
      if (c.nearestPass && (!nearestPassGlobal || Math.abs(c.nearestPass.margin) < Math.abs(nearestPassGlobal.margin))) {
        nearestPassGlobal = c.nearestPass;
      }
    }
    
    // If no actionable candidates, log HOLD with telemetry
    if (!bestCandidate) {
      console.log(`[trade-cycle] All ${symbolsToEvaluate.length} symbols HOLD`);
      
      const holdReasons: Record<string, number> = {};
      for (const c of candidates) {
        for (const r of c.reasons) {
          holdReasons[r] = (holdReasons[r] || 0) + 1;
        }
      }
      const topHoldReasons = Object.entries(holdReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => `${reason}:${count}`);
      
      // Phase 5: Add full context for each candidate (HOLD case) - matches BUY/SELL structure
      // Populate evaluations array with same schema as buy/sell for consistent UI
      const evaluations = candidates
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5)
        .map(c => {
          const regimeCtx = classifyMarketRegime(c.market);
          // Use null for split fields if components not available (avoids misleading values)
          const hasComponents = c.confidence_components?.signal_confidence !== undefined;
          return {
            symbol: c.symbol,
            decision: c.decision,
            reasons: c.reasons,
            confidence: c.confidence,
            // Split confidence for observability - null if not available (don't fake it)
            signal_confidence: hasComponents ? c.confidence_components.signal_confidence : null,
            maturity_multiplier: hasComponents ? c.confidence_components.maturity_multiplier : null,
            gate_failures: c.gateFailures,
            market: {
              price: c.market.price,
              change_24h: c.market.change_24h,
              ema_slope: c.market.ema_50_slope,
              atr: c.market.atr_ratio,
              regime: getRegime(c.market),
            },
            // Phase 5: Regime context for each candidate
            regime_context: regimeCtx,
            // Phase 5b: Transaction cost context (estimates with model labels)
            cost_context: {
              estimated_fee_rate: 0.006,  // 0.6% as fraction (0.006 = 0.6%)
              fee_assumption: 'base_tier_taker',
              estimated_slippage_bps: Math.round(c.market.atr_ratio * 5),
              slippage_model: 'atr_ratio_x5',
              is_estimate: true,
            },
          };
        });
      
      await supabase.from('control_events').insert({
        action: 'trade_decision',
        metadata: {
          cycle_id: cycleId,
          agent_id: agent.id,
          generation_id: systemState.current_generation_id,
          strategy_template: agent.strategy_template,
          symbols_evaluated: symbolsToEvaluate.length,
          decision: 'hold',
          all_hold: true,
          top_hold_reasons: topHoldReasons,
          mode: 'paper',
          thresholds_used: thresholdsUsed,
          // Evaluations array with confidence split (same schema as buy/sell)
          evaluations,
          drought_state: {
            detected: droughtResolved.detected,
            active: droughtModeActive,
            blocked: droughtBlocked,
            block_reason: droughtBlockReason,
            killed: droughtKilled,
            kill_reason: droughtKillReason,
            cooldown_until: droughtResolved.cooldownUntil,
            override: droughtResolved.override,
            reason: droughtResolved.detection.reason,
            holds_6h: droughtResolved.detection.shortWindowHolds,
            orders_6h: droughtResolved.detection.shortWindowOrders,
            holds_48h: droughtResolved.detection.longWindowHolds,
            orders_48h: droughtResolved.detection.longWindowOrders,
            equity_drawdown_pct: droughtResolved.equityDrawdownPct,
            peak_equity_drawdown_pct: droughtResolved.peakEquityDrawdownPct,
            equity: droughtResolved.equity,
            peak_equity: droughtResolved.peakEquity,
          },
          adaptive_tuning: {
            enabled: !!tuning?.enabled,
            mode: tuning?.mode ?? 'drought_only',
            offsets,
            last_adjusted_at: tuning?.last_adjusted_at ?? null,
            cooldown_minutes: tuning?.cooldown_minutes ?? null,
            baseline_thresholds: baselineThresholds,
            effective_thresholds: effectiveThresholds,
            // Active state: tuning is enabled, has offsets, and mode allows application
            applied: !!tuning?.enabled && Object.keys(offsets).length > 0 && 
              (tuning?.mode === 'always' || droughtResolved.detected),
            // Cooldown remaining (if in cooldown)
            cooldown_remaining_sec: tuning?.last_adjusted_at && tuning?.cooldown_minutes
              ? Math.max(0, Math.round(
                  (new Date(tuning.last_adjusted_at).getTime() + tuning.cooldown_minutes * 60 * 1000 - Date.now()) / 1000
                ))
              : null,
            // Phase 4A Guardrails
            frozen_until: tuning?.frozen_until ?? null,
            frozen_reason: tuning?.frozen_reason ?? null,
          },
          gate_failures: allGateFailures,
          nearest_pass: nearestPassGlobal ? {
            gate: nearestPassGlobal.gate,
            actual: nearestPassGlobal.actual,
            threshold: nearestPassGlobal.threshold,
            margin: nearestPassGlobal.margin,
          } : null,
        },
      });
      
      // Run adaptive tuning check at end of cycle
      await maybeTuneThresholds(supabase, droughtResolved);
      
      return new Response(
        JSON.stringify({
          ok: true,
          decision: 'hold',
          agent_id: agent.id,
          symbols_evaluated: symbolsToEvaluate,
          drought_mode: droughtModeActive,
          duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Use the best candidate
    const { symbol, market, decision, reasons, confidence, confidence_components, exitReason, positionQty, gateFailures } = bestCandidate;
    const dataAge = getDataAge(market.updated_at);
    const regime = getRegime(market);
    
    // Explorer agent: enforce stricter hourly cap
    if (isExplorerTrade) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: explorerOrders } = await supabase
        .from('paper_orders')
        .select('tags')
        .gte('created_at', oneHourAgo)
        .eq('status', 'filled')
        .eq('agent_id', agent.id);
      
      const explorerOrderCount = (explorerOrders ?? []).filter(
        (o: { tags: { explorer_mode?: boolean } }) => o.tags?.explorer_mode === true
      ).length;
      
      if (explorerOrderCount >= EXPLORER_CONSTRAINTS.max_trades_per_hour) {
        console.log(`[trade-cycle] Explorer agent ${agent.id.substring(0, 8)} hit hourly cap (${explorerOrderCount})`);
        await supabase.from('control_events').insert({
          action: 'trade_decision',
          metadata: {
            cycle_id: cycleId,
            agent_id: agent.id,
            decision: 'hold',
            reason: 'explorer_hourly_cap',
            explorer_orders_1h: explorerOrderCount,
          },
        });
        return new Response(
          JSON.stringify({ ok: true, decision: 'hold', reason: 'explorer_hourly_cap' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Explorer agent: enforce stricter confidence floor
      if (confidence < EXPLORER_CONSTRAINTS.min_confidence) {
        console.log(`[trade-cycle] Explorer confidence ${confidence.toFixed(2)} < ${EXPLORER_CONSTRAINTS.min_confidence}, skipping`);
        await supabase.from('control_events').insert({
          action: 'trade_decision',
          metadata: {
            cycle_id: cycleId,
            agent_id: agent.id,
            decision: 'hold',
            reason: 'explorer_low_confidence',
            confidence,
            min_required: EXPLORER_CONSTRAINTS.min_confidence,
          },
        });
        return new Response(
          JSON.stringify({ ok: true, decision: 'hold', reason: 'explorer_low_confidence' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Calculate qty with drought/explorer mode adjustment
    const baseQty = symbol === 'BTC-USD' ? 0.0001 : 0.001;
    const sizeMultiplier = isExplorerTrade 
      ? EXPLORER_CONSTRAINTS.size_multiplier 
      : (droughtModeActive ? DROUGHT_SAFETY.size_multiplier : 1.0);
    const plannedQty = decision === 'sell' 
      ? Math.min(baseQty * sizeMultiplier, positionQty) 
      : baseQty * sizeMultiplier;
    
    const patternId = generatePatternId(agent.strategy_template, symbol, regime, reasons);
    
    // Phase 5: Classify regime context (READ-ONLY, no behavior change)
    const regimeContext = classifyMarketRegime(market);
    
    // Phase 5: Estimate transaction costs (DATA ONLY, no behavior change)
    // These are paper trading estimates - real costs will come from fills
    const estimatedFeePct = 0.005; // 0.5% paper trading fee
    const estimatedSlippageBps = Math.round(market.atr_ratio * 5); // Slippage scales with volatility
    
    const tags: TradeTags = {
      strategy_template: agent.strategy_template,
      regime_at_entry: regime,
      entry_reason: reasons,
      exit_reason: exitReason,
      confidence,
      pattern_id: patternId,
      test_mode: testMode,
      drought_mode: droughtModeActive,
      market_snapshot: {
        price: market.price,
        change_24h: market.change_24h,
        ema_50_slope: market.ema_50_slope,
        atr_ratio: market.atr_ratio,
        age_seconds: dataAge,
      },
      // Phase 5: Cost context (DATA ONLY)
      cost_context: {
        estimated_fee_pct: estimatedFeePct,
        estimated_slippage_bps: estimatedSlippageBps,
      },
      // Phase 5: Regime context (READ-ONLY)
      regime_context: regimeContext,
    };
    
    // Add explorer_mode tag for tracking
    if (isExplorerTrade) {
      (tags as TradeTags & { explorer_mode?: boolean }).explorer_mode = true;
    }

    const evaluations = candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(c => {
        const candRegimeContext = classifyMarketRegime(c.market);
        return {
          symbol: c.symbol,
          decision: c.decision,
          reasons: c.reasons,
          confidence: c.confidence,
          // Split confidence for observability
          signal_confidence: c.confidence_components?.signal_confidence ?? c.confidence,
          maturity_multiplier: c.confidence_components?.maturity_multiplier ?? 1,
          gate_failures: c.gateFailures,
          market: {
            price: c.market.price,
            change_24h: c.market.change_24h,
            ema_slope: c.market.ema_50_slope,
            atr: c.market.atr_ratio,
            regime: getRegime(c.market),
          },
          // Phase 5: Regime context for each candidate
          regime_context: candRegimeContext,
        };
      });

    await supabase.from('control_events').insert({
      action: 'trade_decision',
      metadata: {
        cycle_id: cycleId,
        agent_id: agent.id,
        generation_id: systemState.current_generation_id,
        symbol,
        decision,
        qty: plannedQty,
        symbols_evaluated: symbolsToEvaluate.length,
        evaluations,
        ...tags,
        // Confidence breakdown at root level for UI (override tags.confidence with split values)
        signal_confidence: confidence_components.signal_confidence,
        maturity_multiplier: confidence_components.maturity_multiplier,
        confidence_components,
        reasons,
        mode: 'paper',
        thresholds_used: thresholdsUsed,
        drought_state: {
          detected: droughtResolved.detected,
          active: droughtModeActive,
          blocked: droughtBlocked,
          block_reason: droughtBlockReason,
          killed: droughtKilled,
          kill_reason: droughtKillReason,
          cooldown_until: droughtResolved.cooldownUntil,
          override: droughtResolved.override,
          reason: droughtResolved.detection.reason,
          equity_drawdown_pct: droughtResolved.equityDrawdownPct,
          peak_equity_drawdown_pct: droughtResolved.peakEquityDrawdownPct,
          equity: droughtResolved.equity,
          peak_equity: droughtResolved.peakEquity,
        },
        adaptive_tuning: {
          enabled: !!tuning?.enabled,
          mode: tuning?.mode ?? 'drought_only',
          offsets,
          last_adjusted_at: tuning?.last_adjusted_at ?? null,
          cooldown_minutes: tuning?.cooldown_minutes ?? null,
          baseline_thresholds: baselineThresholds,
          effective_thresholds: effectiveThresholds,
          // Active state: tuning is enabled, has offsets, and mode allows application
          applied: !!tuning?.enabled && Object.keys(offsets).length > 0 && 
            (tuning?.mode === 'always' || droughtResolved.detected),
          // Cooldown remaining (if in cooldown)
          cooldown_remaining_sec: tuning?.last_adjusted_at && tuning?.cooldown_minutes
            ? Math.max(0, Math.round(
                (new Date(tuning.last_adjusted_at).getTime() + tuning.cooldown_minutes * 60 * 1000 - Date.now()) / 1000
              ))
            : null,
          // Phase 4A Guardrails
          frozen_until: tuning?.frozen_until ?? null,
          frozen_reason: tuning?.frozen_reason ?? null,
        },
        gate_failures: gateFailures,
      },
    });

    const finalQty = plannedQty;
    
    if (finalQty <= 0) {
      console.log(`[trade-cycle] Decision: ${decision.toUpperCase()} but qty=0, skipping`);
      return new Response(
        JSON.stringify({
          ok: true,
          decision,
          skipped: true,
          reason: 'zero_qty',
          agent_id: agent.id,
          symbol,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[trade-cycle] BEST: ${decision.toUpperCase()} ${finalQty} ${symbol} | conf=${confidence.toFixed(2)} | drought=${droughtModeActive} | explorer=${isExplorerTrade} | reasons=${reasons.join(',')}`);

    // Submit to trade-execute
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const executeResponse = await fetch(`${supabaseUrl}/functions/v1/trade-execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        symbol,
        side: decision,
        qty: finalQty,
        agentId: agent.id,
        generationId: agent.generation_id,
        tags,
      }),
    });

    const executeResult = await executeResponse.json();
    
    console.log(`[trade-cycle] Execute result:`, executeResult);

    // Run adaptive tuning check at end of cycle
    await maybeTuneThresholds(supabase, droughtResolved);

    return new Response(
      JSON.stringify({
        ok: true,
        decision,
        agent_id: agent.id,
        agent_role: agent.role,
        symbol,
        qty: finalQty,
        symbols_evaluated: symbolsToEvaluate,
        drought_mode: droughtModeActive,
        explorer_mode: isExplorerTrade,
        execute_result: executeResult,
        duration_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[trade-cycle] Unexpected error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
