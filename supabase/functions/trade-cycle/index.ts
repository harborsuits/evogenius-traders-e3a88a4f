import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function for auth check
async function checkAuth(req: Request): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, error: 'Unauthorized' };
  }

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getUser(token);

  if (claimsError || !claimsData?.user) {
    return { ok: false, error: 'Unauthorized' };
  }

  return { ok: true };
}

// Strategy decision types
type Decision = 'buy' | 'sell' | 'hold';
type StrategyTemplate = 'trend_pullback' | 'mean_reversion' | 'breakout' | 'bollinger_range';

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

// Preferred regime for regime gating
type PreferredRegime = 'trend' | 'range' | 'dead' | 'any';

interface Agent {
  id: string;
  generation_id: string;
  strategy_template: StrategyTemplate;
  genes: Record<string, number>;
  capital_allocation: number;
  status: string;
  role: AgentRole;
  preferred_regime?: PreferredRegime;
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
    estimated_fee_rate: number;      // Fee as fraction (0.006 = 0.6%)
    fee_assumption?: string;         // e.g., 'base_tier_taker'
    estimated_slippage_bps: number;  // Expected slippage basis points
    slippage_model?: string;         // e.g., 'atr_ratio_x5'
    is_estimate?: boolean;           // Always true for estimates
    spread_bps?: number;             // Bid-ask spread if available
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
// PHASE 5: MARKET REGIME CLASSIFIER (NOW WITH GATING)
// ===========================================================================
type MarketRegimeLabel = 'trend' | 'chop' | 'volatile' | 'dead';

// Map regime labels to preferred_regime values for gating
type GatingRegime = 'trend' | 'range' | 'dead';

interface MarketRegimeContext {
  regime: MarketRegimeLabel;
  gating_regime: GatingRegime;  // Simplified regime for agent gating
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
  
  // Classify detailed regime
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
  
  // Map to gating regime (simpler: trend, range, dead)
  // - trend/volatile -> trend (momentum strategies)
  // - chop -> range (mean reversion strategies)
  // - dead -> dead (capital protection)
  let gatingRegime: GatingRegime;
  if (regime === 'trend' || regime === 'volatile') {
    gatingRegime = 'trend';
  } else if (regime === 'dead') {
    gatingRegime = 'dead';
  } else {
    gatingRegime = 'range';
  }
  
  // HTF context flags (simple heuristics for now)
  const htfTrendBias: 'bullish' | 'bearish' | 'neutral' = 
    slope > 0.01 ? 'bullish' : slope < -0.01 ? 'bearish' : 'neutral';
  
  const htfVolatilityState: 'expanding' | 'contracting' | 'stable' = 
    atr > 1.3 ? 'expanding' : atr < 0.8 ? 'contracting' : 'stable';
  
  return {
    regime,
    gating_regime: gatingRegime,
    trend_strength: trendStrength,
    volatility_level: volatilityLevel,
    htf_trend_bias: htfTrendBias,
    htf_volatility_state: htfVolatilityState,
  };
}

// Check if agent's preferred regime matches the current market regime
function isRegimeMatch(agentPreference: PreferredRegime | undefined, marketRegime: GatingRegime): boolean {
  // 'any' matches all regimes
  if (!agentPreference || agentPreference === 'any') return true;
  
  // Direct match
  return agentPreference === marketRegime;
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
  min_confidence: 0.45,        // Lowered from 0.5 to allow more signals
  max_confidence: 0.85,
};

// DROUGHT MODE THRESHOLDS - Relaxed to generate trades for learning
// Only ONE gate is relaxed at a time to maintain quality
const DROUGHT_THRESHOLDS = {
  trend_threshold: 0.002,      // 60% looser (was 0.0035) - allow flatter trends
  pullback_pct: 8.0,           // Allow up to 8% moves as "pullbacks" (was 3.0)
  rsi_threshold: 0.3,          // 50% looser (was 0.4)
  vol_contraction: 1.6,        // 23% looser (was 1.4)
  vol_expansion_exit: 1.5,
  min_confidence: 0.40,        // Lowered from 0.5
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
  min_confidence: 0.45,        // Lowered from 0.55 to allow more explorer signals
};

// SHADOW TRADING CONFIGURATION (defaults - overridden by system_config.shadow_trading)
const SHADOW_TRADING_DEFAULTS = {
  enabled: true,
  shadow_threshold: 0.45,        // Lower threshold than live to capture learning signals
  max_per_cycle: 3,              // Max shadow trades to log per cycle
  // Estimated targets/stops for outcome tracking
  default_target_pct: 2.0,       // 2% take profit
  default_stop_pct: 1.5,         // 1.5% stop loss
  default_trailing_pct: 1.0,     // 1% trailing stop
};

// Runtime shadow trading config (populated from system_config)
interface ShadowTradingConfig {
  enabled: boolean;
  shadow_threshold: number;
  max_per_cycle: number;
  default_target_pct: number;
  default_stop_pct: number;
  default_trailing_pct: number;
}

// RANGE STRATEGY CONFIGURATION (for Bollinger Mean Reversion)
interface RangeStrategyConfig {
  enabled: boolean;
  paper_enabled: boolean;
  live_enabled: boolean;
  rsi_buy_threshold: number;
  rsi_sell_threshold: number;
  bb_period: number;
  bb_stddev: number;
  max_ema_slope: number;
  max_atr_ratio: number;
  min_atr_ratio: number;
  cooldown_minutes: number;
  paper_cooldown_minutes: number;
  force_entry_for_test?: boolean; // Force entry on any move > 0.5% (paper only, for testing plumbing)
  // Starter Position Logic (Phase 6)
  starter_enabled?: boolean;            // Enable starter position seeding
  starter_flat_hours?: number;          // Hours flat before triggering (default: 6)
  starter_size_pct?: number;            // Position size as % of equity (default: 0.25%)
  starter_max_symbols?: number;         // Max symbols to seed at once (default: 2)
  starter_mid_band_tolerance?: number;  // Max % from "mid" to trigger (default: 2.0%)
}

const DEFAULT_RANGE_STRATEGY: RangeStrategyConfig = {
  enabled: true,
  paper_enabled: true,
  live_enabled: false,
  rsi_buy_threshold: 45,   // More permissive: triggers on -1.5% drop (was 35 = -3.5%)
  rsi_sell_threshold: 55,  // More permissive: triggers on +1.5% rise (was 65 = +6.5%)
  bb_period: 20,
  bb_stddev: 2.0,
  max_ema_slope: 0.005,    // More permissive: allow 0.5% slope (was 0.0015)
  max_atr_ratio: 1.8,      // More permissive: allow higher vol (was 1.5)
  min_atr_ratio: 0.3,      // More permissive: allow quieter markets (was 0.5)
  cooldown_minutes: 15,
  paper_cooldown_minutes: 5, // Faster for testing (was 30)
  force_entry_for_test: false,
  // Starter defaults
  starter_enabled: true,
  starter_flat_hours: 6,
  starter_size_pct: 0.25,
  starter_max_symbols: 2,
  starter_mid_band_tolerance: 2.0,
};

// TRADE FLOW WATCHDOG CONFIGURATION
interface TradeFlowWatchdogConfig {
  enabled: boolean;
  shadow_threshold_6h: number;
  paper_zero_window_hours: number;
  auto_enable_drought: boolean;
  auto_enable_range_strategy: boolean;
}

const DEFAULT_WATCHDOG: TradeFlowWatchdogConfig = {
  enabled: true,
  shadow_threshold_6h: 500,
  paper_zero_window_hours: 24,
  auto_enable_drought: true,
  auto_enable_range_strategy: true,
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
  // NEW AGENTS CAN TRADE FIX:
  // Old: MIN_MATURITY = 0.1 crushed 0.7 signal to 0.07 (below 0.55 threshold = never trade)
  // New: MIN_MATURITY = 0.55 ensures new agents can still trade if signal is strong (0.7 * 0.55 = 0.385 -> still low, but with threshold adjustment this works)
  // Actually: floor at 0.65 so that a 0.85 signal * 0.65 = 0.55 (meets threshold)
  const MIN_TRADES_FOR_FULL_CONFIDENCE = 20;  // Faster ramp-up (was 30)
  const MIN_MATURITY = 0.65; // Floor: ensures strong signals (0.85+) can still meet 0.55 threshold
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

// ===========================================================================
// BOLLINGER RANGE STRATEGY - Fires in sideways/chop markets
// This is evaluated SEPARATELY from agent strategies to ensure coverage
// ===========================================================================
interface RangeDecisionResult {
  decision: Decision;
  reasons: string[];
  confidence: number;
  confidence_components: ConfidenceComponents;
  exitReason?: string;
}

function makeRangeDecision(
  market: MarketData,
  hasPosition: boolean,
  positionQty: number,
  config: RangeStrategyConfig,
  agentTradeCount: number = 0
): RangeDecisionResult {
  const reasons: string[] = ['range_strategy'];
  let confidenceComponents: ConfidenceComponents;
  
  // Check regime gates - only trade in flat/chop markets
  const slopeAbs = Math.abs(market.ema_50_slope);
  const isFlat = slopeAbs < config.max_ema_slope;
  const volOk = market.atr_ratio <= config.max_atr_ratio && market.atr_ratio >= config.min_atr_ratio;
  
  if (!isFlat || !volOk) {
    return {
      decision: 'hold',
      reasons: ['range_regime_fail'],
      confidence: 0.3,
      confidence_components: { signal_confidence: 0.3, maturity_multiplier: 1, final_confidence: 0.3 },
    };
  }
  
  // Bollinger Band simulation using 24h change as oversold/overbought proxy
  // In real implementation, we'd use actual BB calculations
  // For now, using change_24h as a proxy for price relative to bands
  const change = market.change_24h;
  
  // RSI proxy using more intuitive scaling:
  // rsi_buy_threshold: 45 -> requires change < -1.5% to trigger BUY (45-50)/33 = -0.15 * 10 = -1.5%
  // rsi_sell_threshold: 55 -> requires change > +1.5% to trigger SELL (55-50)/33 = +0.15 * 10 = +1.5%
  // More extreme thresholds (35/65) require larger moves (-4.5%/+4.5%)
  const buyTriggerPct = (config.rsi_buy_threshold - 50) / 3.33; // 45 -> -1.5%, 35 -> -4.5%
  const sellTriggerPct = (config.rsi_sell_threshold - 50) / 3.33; // 55 -> +1.5%, 65 -> +4.5%
  
  const isOversold = change < buyTriggerPct;
  const isOverbought = change > sellTriggerPct;
  
  // Force entry mode: if enabled, any market move > threshold triggers entry (for testing plumbing)
  const forceEntryEnabled = config.force_entry_for_test === true;
  const forceEntryTriggered = forceEntryEnabled && Math.abs(change) > 0.5 && !hasPosition;
  
  console.log(`[range-decision] ${market.symbol}: change=${change.toFixed(2)}%, buyTrigger=${buyTriggerPct.toFixed(2)}%, sellTrigger=${sellTriggerPct.toFixed(2)}%, isFlat=${isFlat}, volOk=${volOk}, oversold=${isOversold}, overbought=${isOverbought}, forceEntry=${forceEntryTriggered}`);
  
  // Force entry for testing (paper only) - enables proving full execution chain works
  if (forceEntryTriggered) {
    const direction: Decision = change > 0 ? 'sell' : 'buy';
    // In force mode with no position, we BUY to open a position (can't sell what we don't have)
    reasons.push('force_test_entry', 'range_market');
    const rawConfidence = 0.55;
    confidenceComponents = calibrateConfidence(rawConfidence, agentTradeCount);
    console.log(`[range-decision] FORCE ENTRY: ${market.symbol} -> BUY (test mode)`);
    return {
      decision: 'buy',
      reasons,
      confidence: confidenceComponents.final_confidence,
      confidence_components: confidenceComponents,
    };
  }
  
  if (isOversold && !hasPosition) {
    reasons.push('bollinger_oversold', 'range_market');
    // Confidence: deeper oversold = higher confidence
    const depth = Math.abs(change) / 10; // Normalize
    const rawConfidence = 0.55 + Math.min(0.25, depth * 0.5);
    confidenceComponents = calibrateConfidence(rawConfidence, agentTradeCount);
    return {
      decision: 'buy',
      reasons,
      confidence: confidenceComponents.final_confidence,
      confidence_components: confidenceComponents,
    };
  }
  
  if (isOverbought && hasPosition) {
    reasons.push('bollinger_overbought', 'take_profit');
    const rawConfidence = 0.6;
    confidenceComponents = calibrateConfidence(rawConfidence, agentTradeCount);
    return {
      decision: 'sell',
      reasons,
      confidence: confidenceComponents.final_confidence,
      confidence_components: confidenceComponents,
      exitReason: 'range_take_profit',
    };
  }
  
  return {
    decision: 'hold',
    reasons: ['range_no_signal'],
    confidence: 0.4,
    confidence_components: { signal_confidence: 0.4, maturity_multiplier: 1, final_confidence: 0.4 },
  };
}

// ===========================================================================
// STARTER POSITION LOGIC - Seed inventory when flat for too long
// Prevents "perma-flat" state where range strategy can't SELL (nothing to sell)
// ===========================================================================
interface StarterCandidate {
  symbol: string;
  market: MarketData;
  reason: string;
  confidence: number;
}

interface StarterCheckResult {
  should_seed: boolean;
  candidates: StarterCandidate[];
  flat_symbols: string[];
  hours_flat: number;
}

async function checkStarterPositions(
  supabase: any,
  accountId: string,
  flatSymbols: string[],      // Symbols with qty = 0
  marketBySymbol: Map<string, MarketData>,
  config: RangeStrategyConfig,
  isPaperMode: boolean
): Promise<StarterCheckResult> {
  const result: StarterCheckResult = {
    should_seed: false,
    candidates: [],
    flat_symbols: flatSymbols,
    hours_flat: 0,
  };
  
  // Must be enabled and in paper mode
  if (!config.starter_enabled || !isPaperMode) {
    return result;
  }
  
  if (flatSymbols.length === 0) {
    return result; // Already have positions, no need for starter
  }
  
  const flatHoursThreshold = config.starter_flat_hours ?? 6;
  const midBandTolerance = config.starter_mid_band_tolerance ?? 2.0;
  const maxSymbols = config.starter_max_symbols ?? 2;
  
  // Check how long we've been completely flat (no trades)
  const { data: recentTrades } = await supabase
    .from('paper_orders')
    .select('created_at, symbol')
    .eq('account_id', accountId)
    .eq('status', 'filled')
    .order('created_at', { ascending: false })
    .limit(1);
  
  let hoursFlat = 999; // Default to very long if no trades ever
  if (recentTrades && recentTrades.length > 0) {
    const lastTradeTime = new Date(recentTrades[0].created_at);
    hoursFlat = (Date.now() - lastTradeTime.getTime()) / (1000 * 60 * 60);
  }
  
  result.hours_flat = hoursFlat;
  
  // Not flat long enough yet
  if (hoursFlat < flatHoursThreshold) {
    return result;
  }
  
  console.log(`[starter-position] Flat for ${hoursFlat.toFixed(1)}h (threshold: ${flatHoursThreshold}h), checking ${flatSymbols.length} symbols`);
  
  // Evaluate each flat symbol for starter eligibility
  const candidates: StarterCandidate[] = [];
  
  for (const sym of flatSymbols) {
    const market = marketBySymbol.get(sym);
    if (!market) continue;
    
    // Check regime gates (same as range strategy)
    const slopeAbs = Math.abs(market.ema_50_slope);
    const isFlat = slopeAbs < config.max_ema_slope;
    const volOk = market.atr_ratio <= config.max_atr_ratio && market.atr_ratio >= config.min_atr_ratio;
    
    if (!isFlat || !volOk) {
      console.log(`[starter-position] ${sym}: Regime fail (slope=${slopeAbs.toFixed(4)}, atr=${market.atr_ratio.toFixed(2)})`);
      continue;
    }
    
    // Check if price is near "mid-band" (small 24h change = near mean)
    const changeAbs = Math.abs(market.change_24h);
    const nearMid = changeAbs <= midBandTolerance;
    
    if (!nearMid) {
      console.log(`[starter-position] ${sym}: Too far from mid (change=${market.change_24h.toFixed(2)}%, tolerance=${midBandTolerance}%)`);
      continue;
    }
    
    // Good candidate!
    const confidence = 0.50 + (0.10 * (1 - changeAbs / midBandTolerance)); // Higher confidence when closer to mid
    candidates.push({
      symbol: sym,
      market,
      reason: `starter_seed_${hoursFlat.toFixed(0)}h_flat`,
      confidence,
    });
    
    console.log(`[starter-position] ${sym}: ELIGIBLE (change=${market.change_24h.toFixed(2)}%, conf=${confidence.toFixed(2)})`);
  }
  
  // Sort by liquidity (volume) and take top N
  const sortedCandidates = candidates
    .sort((a, b) => b.market.volume_24h - a.market.volume_24h)
    .slice(0, maxSymbols);
  
  result.should_seed = sortedCandidates.length > 0;
  result.candidates = sortedCandidates;
  
  if (result.should_seed) {
    console.log(`[starter-position] SEEDING ${sortedCandidates.length} starter positions: ${sortedCandidates.map(c => c.symbol).join(', ')}`);
  }
  
  return result;
}

// ===========================================================================
// TRADE FLOW WATCHDOG - Detect and auto-fix signal starvation
// ===========================================================================
interface WatchdogResult {
  is_starved: boolean;
  shadow_trades_6h: number;
  paper_orders_24h: number;
  auto_actions: string[];
}

async function checkTradeFlowWatchdog(
  supabase: any,
  config: TradeFlowWatchdogConfig,
  currentConfig: Record<string, unknown>,
  configId: string
): Promise<WatchdogResult> {
  if (!config.enabled) {
    return { is_starved: false, shadow_trades_6h: 0, paper_orders_24h: 0, auto_actions: [] };
  }
  
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const paperWindowStart = new Date(now.getTime() - config.paper_zero_window_hours * 60 * 60 * 1000);
  
  // Count shadow trades in 6h
  const { count: shadowCount } = await supabase
    .from('shadow_trades')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sixHoursAgo.toISOString());
  
  // Count paper orders in window
  const { count: paperCount } = await supabase
    .from('paper_orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', paperWindowStart.toISOString())
    .eq('status', 'filled');
  
  const shadowTrades = shadowCount ?? 0;
  const paperOrders = paperCount ?? 0;
  const isStarved = shadowTrades >= config.shadow_threshold_6h && paperOrders === 0;
  
  const autoActions: string[] = [];
  
  if (isStarved) {
    let needsUpdate = false;
    const updatedConfig = { ...currentConfig };
    
    // Auto-enable drought mode
    if (config.auto_enable_drought && currentConfig.drought_override !== 'force_on') {
      updatedConfig.drought_override = 'force_on';
      autoActions.push('enabled_drought_mode');
      needsUpdate = true;
    }
    
    // Auto-enable range strategy
    if (config.auto_enable_range_strategy) {
      const rangeConfig = (currentConfig.range_strategy ?? {}) as RangeStrategyConfig;
      if (!rangeConfig.enabled || !rangeConfig.paper_enabled) {
        updatedConfig.range_strategy = {
          ...DEFAULT_RANGE_STRATEGY,
          ...rangeConfig,
          enabled: true,
          paper_enabled: true,
        };
        autoActions.push('enabled_range_strategy');
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      await supabase.from('system_config').update({
        config: updatedConfig,
        updated_at: now.toISOString(),
      }).eq('id', configId);
      
      // Log starvation event
      await supabase.from('control_events').insert({
        action: 'signal_starvation',
        metadata: {
          shadow_trades_6h: shadowTrades,
          paper_orders_24h: paperOrders,
          threshold: config.shadow_threshold_6h,
          auto_actions: autoActions,
        },
      });
      
      console.log(`[trade-cycle] SIGNAL STARVATION: ${shadowTrades} shadow trades, ${paperOrders} paper orders. Auto-actions: ${autoActions.join(', ')}`);
    }
  }
  
  return {
    is_starved: isStarved,
    shadow_trades_6h: shadowTrades,
    paper_orders_24h: paperOrders,
    auto_actions: autoActions,
  };
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

// ===========================================================================
// SHADOW TRADING - Counterfactual learning without capital risk
// ===========================================================================
interface ShadowTradeCandidate {
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  intendedQty: number;
  confidence: number;
  stopPrice: number;
  targetPrice: number;
  trailingStopPct: number;
  regime: string;
  regimeMatch: boolean;
  decisionReason: string;
  marketData: Record<string, unknown>;
}

// Log shadow trades for counterfactual learning
async function logShadowTrades(
  supabase: any,
  agentId: string,
  generationId: string,
  candidates: ShadowTradeCandidate[]
): Promise<number> {
  if (candidates.length === 0) return 0;
  
  const shadowRecords = candidates.map(c => ({
    agent_id: agentId,
    generation_id: generationId,
    symbol: c.symbol,
    side: c.side,
    entry_price: c.entryPrice,
    intended_qty: c.intendedQty,
    confidence: c.confidence,
    stop_price: c.stopPrice,
    target_price: c.targetPrice,
    trailing_stop_pct: c.trailingStopPct,
    regime: c.regime,
    regime_match: c.regimeMatch,
    decision_reason: c.decisionReason,
    market_data: c.marketData,
    outcome_status: 'pending',
  }));
  
  const { data, error } = await supabase
    .from('shadow_trades')
    .insert(shadowRecords)
    .select('id');
  
  if (error) {
    console.error('[shadow-trade] Failed to log shadow trades:', error);
    return 0;
  }
  
  console.log(`[shadow-trade] Logged ${data?.length ?? 0} shadow trades for learning`);
  return data?.length ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // === AUTH CHECK ===
  const authResult = await checkAuth(req);
  if (!authResult.ok) {
    console.log('[trade-cycle] Auth failed');
    return new Response(
      JSON.stringify({ ok: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

    // Track mode for later execution gating (shadow trades always run)
    const isPaperMode = systemState.trade_mode === 'paper';
    const executionMode = systemState.trade_mode;
    console.log(`[trade-cycle] Mode: ${executionMode} (paper_orders=${isPaperMode ? 'enabled' : 'shadow_only'})`);


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
    // NOTE: Config is ALWAYS fetched fresh each cycle (no caching)
    const { data: configData } = await supabase
      .from('system_config')
      .select('config, updated_at')
      .limit(1)
      .single();
    
    const systemConfig = (configData?.config ?? {}) as Record<string, unknown>;
    const configUpdatedAt = configData?.updated_at ?? 'unknown';
    const testMode = systemConfig.strategy_test_mode === true;
    const tuning = systemConfig.adaptive_tuning as AdaptiveTuningConfig | undefined;
    const offsets = tuning?.offsets ?? {};
    
    // Log config version for debugging staleness issues
    console.log(`[trade-cycle] Config loaded (updated_at: ${configUpdatedAt}) | min_confidence: ${(systemConfig as any)?.strategy_thresholds?.baseline?.min_confidence ?? BASELINE_THRESHOLDS.min_confidence}`);
    
    // Load shadow trading config (with defaults)
    const shadowConfig = systemConfig.shadow_trading as Partial<ShadowTradingConfig> | undefined;
    const SHADOW_TRADING: ShadowTradingConfig = {
      enabled: shadowConfig?.enabled ?? SHADOW_TRADING_DEFAULTS.enabled,
      shadow_threshold: shadowConfig?.shadow_threshold ?? SHADOW_TRADING_DEFAULTS.shadow_threshold,
      max_per_cycle: shadowConfig?.max_per_cycle ?? SHADOW_TRADING_DEFAULTS.max_per_cycle,
      default_target_pct: shadowConfig?.default_target_pct ?? SHADOW_TRADING_DEFAULTS.default_target_pct,
      default_stop_pct: shadowConfig?.default_stop_pct ?? SHADOW_TRADING_DEFAULTS.default_stop_pct,
      default_trailing_pct: shadowConfig?.default_trailing_pct ?? SHADOW_TRADING_DEFAULTS.default_trailing_pct,
    };
    
    // Load range strategy config
    const rangeStrategyConfig = systemConfig.range_strategy as Partial<RangeStrategyConfig> | undefined;
    const RANGE_STRATEGY: RangeStrategyConfig = {
      ...DEFAULT_RANGE_STRATEGY,
      ...rangeStrategyConfig,
    };
    const rangeEnabled = RANGE_STRATEGY.enabled && (isPaperMode ? RANGE_STRATEGY.paper_enabled : RANGE_STRATEGY.live_enabled);
    
    // Load trade flow watchdog config
    const watchdogConfig = systemConfig.trade_flow_watchdog as Partial<TradeFlowWatchdogConfig> | undefined;
    const WATCHDOG: TradeFlowWatchdogConfig = {
      ...DEFAULT_WATCHDOG,
      ...watchdogConfig,
    };
    
    // Check trade flow watchdog (auto-enables drought/range if starved)
    const { data: configRow } = await supabase
      .from('system_config')
      .select('id')
      .limit(1)
      .single();
    const configId = configRow?.id;
    
    if (configId) {
      const watchdogResult = await checkTradeFlowWatchdog(supabase, WATCHDOG, systemConfig, configId);
      if (watchdogResult.is_starved) {
        console.log(`[trade-cycle] WATCHDOG: Starvation detected (${watchdogResult.shadow_trades_6h} shadows, ${watchdogResult.paper_orders_24h} papers)`);
      }
    }
    
    // Load UI-configured strategy thresholds if enabled
    const strategyThresholds = systemConfig.strategy_thresholds as {
      use_config_thresholds?: boolean;
      baseline?: Partial<typeof BASELINE_THRESHOLDS>;
      drought?: Partial<typeof DROUGHT_THRESHOLDS>;
    } | undefined;
    
    // Merge config thresholds with defaults if use_config_thresholds is true
    const configBaseline = strategyThresholds?.use_config_thresholds && strategyThresholds.baseline
      ? { ...BASELINE_THRESHOLDS, ...strategyThresholds.baseline }
      : BASELINE_THRESHOLDS;
    
    const configDrought = strategyThresholds?.use_config_thresholds && strategyThresholds.drought
      ? { ...DROUGHT_THRESHOLDS, ...strategyThresholds.drought }
      : DROUGHT_THRESHOLDS;
    
    // Calculate effective thresholds with adaptive tuning
    const baselineThresholds = testMode ? TEST_MODE_THRESHOLDS : (droughtModeActive ? configDrought : configBaseline);
    const effectiveThresholds = tuning?.enabled ? applyAdaptiveOffsets(baselineThresholds, offsets) : baselineThresholds;
    
    const thresholdsUsed = testMode 
      ? 'test_mode' 
      : droughtModeActive 
        ? (strategyThresholds?.use_config_thresholds ? 'drought_mode_config' : 'drought_mode')
        : (strategyThresholds?.use_config_thresholds ? 'baseline_config' : 'baseline');
    
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
      regimeContext: MarketRegimeContext;  // Added for regime gating
      regimeBlocked: boolean;              // True if agent blocked by regime mismatch
    }
    
    const candidates: DecisionCandidate[] = [];
    
    // Track regime stats for logging
    let regimeBlockedCount = 0;
    const regimeStats: Record<string, number> = {};
    
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
      const regimeContext = classifyMarketRegime(mkt);
      const posQty = positionBySymbol.get(sym) ?? 0;
      const hasPos = posQty > 0;
      
      // Track regime distribution
      regimeStats[regimeContext.gating_regime] = (regimeStats[regimeContext.gating_regime] ?? 0) + 1;
      
      // *** REGIME GATE: Check if agent's preferred regime matches market ***
      const agentPreferredRegime = (agent as Agent).preferred_regime as PreferredRegime | undefined;
      const regimeMatches = isRegimeMatch(agentPreferredRegime, regimeContext.gating_regime);
      
      // If regime doesn't match and agent has a preference, mark as blocked
      // Exception: always allow sell decisions (to exit positions)
      const regimeBlocked = !regimeMatches && !hasPos;
      
      if (regimeBlocked) {
        regimeBlockedCount++;
        
        // STILL RUN STRATEGY for shadow trade learning (but force hold for real trades)
        // This gives us real confidence scores for counterfactual learning
        const result = makeDecision(agent, mkt, hasPos, posQty, testMode, droughtModeActive, agentTradeCount);
        
        console.log(`[trade-cycle] ${sym}: REGIME BLOCKED (agent=${agentPreferredRegime}, market=${regimeContext.gating_regime}) | shadow_conf=${result.confidence_components.signal_confidence.toFixed(2)}`);
        
        // Add as blocked candidate with REAL signal confidence for shadow learning
        candidates.push({
          symbol: sym,
          market: mkt,
          decision: 'hold', // Force hold for real trading
          reasons: [`wrong_regime:${regimeContext.gating_regime}`, ...result.reasons],
          confidence: 0, // Zero for real trading gate
          confidence_components: result.confidence_components, // REAL values for shadow learning
          positionQty: posQty,
          gateFailures: result.gateFailures,
          nearestPass: result.nearestPass,
          regimeContext,
          regimeBlocked: true,
        });
        continue;
      }
      
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
        regimeContext,
        regimeBlocked: false,
      });
      
      console.log(`[trade-cycle] ${sym}: ${result.decision} (signal=${result.confidence_components.signal_confidence.toFixed(2)}, maturity=${result.confidence_components.maturity_multiplier.toFixed(2)}, final=${result.confidence.toFixed(2)}, regime=${regimeContext.gating_regime}, reasons=${result.reasons.join(',')})`);
    }
    
    // ===========================================================================
    // RANGE STRATEGY: Evaluate Bollinger Mean Reversion for all symbols
    // This runs INDEPENDENTLY of agent strategies to ensure range market coverage
    // ===========================================================================
    if (rangeEnabled) {
      console.log(`[trade-cycle] Range strategy enabled, evaluating ${symbolsToEvaluate.length} symbols`);
      
      // Check per-symbol cooldown for range trades
      const cooldownMinutes = isPaperMode ? RANGE_STRATEGY.paper_cooldown_minutes : RANGE_STRATEGY.cooldown_minutes;
      const cooldownStart = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
      
      for (const sym of symbolsToEvaluate) {
        const mkt = marketBySymbol.get(sym);
        if (!mkt) continue;
        
        const age = getDataAge(mkt.updated_at);
        if (age > MAX_MARKET_AGE_SECONDS) continue;
        
        // Check symbol cooldown - don't spam range trades
        const { count: recentRangeTrades } = await supabase
          .from('paper_orders')
          .select('*', { count: 'exact', head: true })
          .eq('symbol', sym)
          .gte('created_at', cooldownStart)
          .eq('status', 'filled');
        
        if ((recentRangeTrades ?? 0) > 0) {
          console.log(`[trade-cycle] ${sym}: Range cooldown active (${recentRangeTrades} trades in ${cooldownMinutes}m)`);
          continue;
        }
        
        const posQty = positionBySymbol.get(sym) ?? 0;
        const hasPos = posQty > 0;
        const regimeContext = classifyMarketRegime(mkt);
        
        const rangeResult = makeRangeDecision(mkt, hasPos, posQty, RANGE_STRATEGY, agentTradeCount);
        
        if (rangeResult.decision !== 'hold') {
          // Add as candidate - range strategy can produce trades even when agent strategies don't
          const existingCandidate = candidates.find(c => c.symbol === sym);
          
          // Only use range result if agent didn't already find a signal OR range confidence is higher
          if (!existingCandidate || existingCandidate.decision === 'hold' || rangeResult.confidence > existingCandidate.confidence) {
            console.log(`[trade-cycle] ${sym}: RANGE ${rangeResult.decision.toUpperCase()} (conf=${rangeResult.confidence.toFixed(2)}, reasons=${rangeResult.reasons.join(',')})`);
            
            // Replace or add candidate
            const newCandidate = {
              symbol: sym,
              market: mkt,
              decision: rangeResult.decision,
              reasons: rangeResult.reasons,
              confidence: rangeResult.confidence,
              confidence_components: rangeResult.confidence_components,
              exitReason: rangeResult.exitReason,
              positionQty: posQty,
              gateFailures: [],
              nearestPass: undefined,
              regimeContext,
              regimeBlocked: false,
            };
            
            if (existingCandidate) {
              const idx = candidates.indexOf(existingCandidate);
              candidates[idx] = newCandidate;
            } else {
              candidates.push(newCandidate);
            }
          }
        }
      }
    }
    
    // ===========================================================================
    // STARTER POSITION LOGIC: Seed inventory when flat for too long
    // Prevents "perma-flat" where range strategy can't exit (nothing to sell)
    // ===========================================================================
    if (rangeEnabled && isPaperMode) {
      // Find symbols where we're flat (no position)
      const flatSymbols = symbolsToEvaluate.filter(sym => {
        const posQty = positionBySymbol.get(sym) ?? 0;
        return posQty === 0;
      });
      
      // Only check starter if no actionable candidates from normal strategies
      const currentActionable = candidates.filter(c => c.decision !== 'hold');
      
      if (currentActionable.length === 0 && flatSymbols.length > 0) {
        const starterResult = await checkStarterPositions(
          supabase,
          paperAccount.id,
          flatSymbols,
          marketBySymbol,
          RANGE_STRATEGY,
          isPaperMode
        );
        
        if (starterResult.should_seed && starterResult.candidates.length > 0) {
          // Add starter candidates as BUY decisions
          for (const starter of starterResult.candidates) {
            const regimeContext = classifyMarketRegime(starter.market);
            
            // Log control event for starter seeding
            await supabase.from('control_events').insert({
              action: 'starter_position_triggered',
              metadata: {
                symbol: starter.symbol,
                reason: starter.reason,
                hours_flat: starterResult.hours_flat,
                confidence: starter.confidence,
                price: starter.market.price,
                change_24h: starter.market.change_24h,
              },
            });
            
            candidates.push({
              symbol: starter.symbol,
              market: starter.market,
              decision: 'buy' as Decision,
              reasons: ['starter_position', starter.reason],
              confidence: starter.confidence,
              confidence_components: {
                signal_confidence: starter.confidence,
                maturity_multiplier: 1,
                final_confidence: starter.confidence,
              },
              positionQty: 0,
              gateFailures: [],
              nearestPass: undefined,
              regimeContext,
              regimeBlocked: false,
            });
            
            console.log(`[trade-cycle] STARTER BUY added: ${starter.symbol} (conf=${starter.confidence.toFixed(2)}, reason=${starter.reason})`);
          }
        }
      }
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
    
    // ===========================================================================
    // SHADOW TRADING: Log counterfactual trades for learning
    // Even when we HOLD, log shadow trades for candidates with sufficient confidence
    // This enables evolution to learn from "what would have happened" signals
    // ===========================================================================
    if (SHADOW_TRADING.enabled && systemState.current_generation_id) {
      // Find candidates that meet shadow threshold but are held/blocked
      const shadowCandidates: ShadowTradeCandidate[] = [];
      
      for (const c of candidates) {
        // Skip if already actionable (will become real trade) or confidence too low
        if (c.decision !== 'hold' && !c.regimeBlocked) continue;
        
        // Check confidence threshold (use signal confidence, not calibrated)
        const signalConf = c.confidence_components?.signal_confidence ?? c.confidence;
        if (signalConf < SHADOW_TRADING.shadow_threshold) continue;
        
        // Determine intended side based on strategy and market conditions
        // For HOLD decisions, infer what the trade WOULD have been
        let intendedSide: 'BUY' | 'SELL' = 'BUY';
        if (c.reasons.some(r => r.includes('sell') || r.includes('exit') || r.includes('overbought'))) {
          intendedSide = 'SELL';
        }
        
        // Calculate stop/target based on entry price
        const entryPrice = c.market.price;
        const targetPct = SHADOW_TRADING.default_target_pct / 100;
        const stopPct = SHADOW_TRADING.default_stop_pct / 100;
        
        const targetPrice = intendedSide === 'BUY' 
          ? entryPrice * (1 + targetPct) 
          : entryPrice * (1 - targetPct);
        const stopPrice = intendedSide === 'BUY' 
          ? entryPrice * (1 - stopPct) 
          : entryPrice * (1 + stopPct);
        
        // Estimate qty (same logic as real trades but for shadow)
        const baseQty = c.symbol === 'BTC-USD' ? 0.0001 : 0.001;
        const intendedQty = baseQty * 0.5; // Shadow trades use 50% size for learning
        
        shadowCandidates.push({
          symbol: c.symbol,
          side: intendedSide,
          entryPrice,
          intendedQty,
          confidence: signalConf,
          stopPrice,
          targetPrice,
          trailingStopPct: SHADOW_TRADING.default_trailing_pct,
          regime: c.regimeContext.gating_regime,
          regimeMatch: !c.regimeBlocked,
          decisionReason: c.regimeBlocked 
            ? `regime_blocked:${c.regimeContext.gating_regime}` 
            : c.reasons.join(','),
          marketData: {
            price: c.market.price,
            change_24h: c.market.change_24h,
            ema_50_slope: c.market.ema_50_slope,
            atr_ratio: c.market.atr_ratio,
            regime: getRegime(c.market),
          },
        });
      }
      
      // Log shadow trades (capped per cycle)
      const shadowToLog = shadowCandidates
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, SHADOW_TRADING.max_per_cycle);
      
      if (shadowToLog.length > 0) {
        const shadowCount = await logShadowTrades(
          supabase, 
          agent.id, 
          systemState.current_generation_id, 
          shadowToLog
        );
        console.log(`[trade-cycle] Shadow trades logged: ${shadowCount} (candidates: ${shadowCandidates.length})`);
      }
    }
    
    // If no actionable candidates, log HOLD with telemetry
    if (!bestCandidate) {
      console.log(`[trade-cycle] All ${symbolsToEvaluate.length} symbols HOLD (regime_blocked=${regimeBlockedCount})`);
      
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
            regime_blocked: c.regimeBlocked,
            market: {
              price: c.market.price,
              change_24h: c.market.change_24h,
              ema_slope: c.market.ema_50_slope,
              atr: c.market.atr_ratio,
              regime: getRegime(c.market),
            },
            // Phase 5: Regime context for each candidate
            regime_context: c.regimeContext,
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
      
      // Compute consistent reason string from hold reasons - prioritize regime blocks
      let holdReason: string;
      if (evaluations.length === 0) {
        holdReason = 'hold:no_evaluations';
      } else if (regimeBlockedCount === candidates.length && regimeBlockedCount > 0) {
        // All candidates blocked by regime
        const dominantRegime = Object.entries(regimeStats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
        holdReason = `hold:wrong_regime:${dominantRegime}`;
      } else if (regimeBlockedCount > 0) {
        // Some candidates blocked by regime, others by signal
        const primaryHoldReason = topHoldReasons.length > 0 ? topHoldReasons[0].split(':')[0] : 'no_signal';
        holdReason = `hold:${primaryHoldReason}`;
      } else {
        const primaryHoldReason = topHoldReasons.length > 0 ? topHoldReasons[0].split(':')[0] : 'no_signal';
        holdReason = `hold:${primaryHoldReason}`;
      }
      
      // Get dominant market regime for display
      const dominantMarketRegime = Object.entries(regimeStats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
      
      await supabase.from('control_events').insert({
        action: 'trade_decision',
        metadata: {
          cycle_id: cycleId,
          agent_id: agent.id,
          agent_preferred_regime: (agent as Agent).preferred_regime ?? 'any',
          generation_id: systemState.current_generation_id,
          strategy_template: agent.strategy_template,
          symbols_evaluated: symbolsToEvaluate.length,
          decision: 'hold',
          reason: holdReason,  // CONSISTENT REASON FIELD - always non-empty
          reasons: topHoldReasons,  // Array for detail
          all_hold: true,
          top_hold_reasons: topHoldReasons,
          mode: 'paper',
          thresholds_used: thresholdsUsed,
          // Regime gating info
          regime_gating: {
            dominant_market_regime: dominantMarketRegime,
            agent_preferred_regime: (agent as Agent).preferred_regime ?? 'any',
            regime_blocked_count: regimeBlockedCount,
            regime_stats: regimeStats,
          },
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
      // BYPASS: If force_entry_for_test is enabled (for testing plumbing), skip confidence gate
      const forceEntryBypass = RANGE_STRATEGY.force_entry_for_test === true && isPaperMode;
      if (confidence < EXPLORER_CONSTRAINTS.min_confidence && !forceEntryBypass) {
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
      
      if (forceEntryBypass) {
        console.log(`[trade-cycle] FORCE ENTRY BYPASS: Skipping confidence check (${confidence.toFixed(2)} < ${EXPLORER_CONSTRAINTS.min_confidence})`);
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
      // Phase 5: Cost context (DATA ONLY) - consistent with HOLD schema
      cost_context: {
        estimated_fee_rate: estimatedFeePct,  // Already fraction (0.006 = 0.6%)
        fee_assumption: 'base_tier_taker',
        estimated_slippage_bps: estimatedSlippageBps,
        slippage_model: 'atr_ratio_x5',
        is_estimate: true,
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
        reason: `trade:${decision}`,  // CONSISTENT REASON FIELD
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

    console.log(`[trade-cycle] BEST: ${decision.toUpperCase()} ${finalQty} ${symbol} | conf=${confidence.toFixed(2)} | drought=${droughtModeActive} | explorer=${isExplorerTrade} | mode=${executionMode} | reasons=${reasons.join(',')}`);

    // Submit to trade-execute ONLY in paper mode
    // In live mode, shadow trades are logged but no paper orders are created
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    let executeResult: Record<string, unknown> = { skipped: true, reason: 'shadow_only_mode' };
    
    if (isPaperMode) {
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
      executeResult = await executeResponse.json();
      console.log(`[trade-cycle] Execute result:`, executeResult);
    } else {
      console.log(`[trade-cycle] Skipping paper order (mode=${executionMode}, shadow trades logged)`);
    }

    // Run adaptive tuning check at end of cycle
    await maybeTuneThresholds(supabase, droughtResolved);

    // Process pending shadow trades (piggyback on trade-cycle execution)
    const piggybackStart = Date.now();
    let piggybackResult: { ok: boolean; processed?: number; calculated?: number; skipped?: number; errors?: number; error_message?: string } = { ok: false };
    
    try {
      // Get pending shadow trade stats for logging
      const { count: pendingCount } = await supabase
        .from('shadow_trades')
        .select('*', { count: 'exact', head: true })
        .eq('outcome_status', 'pending');
      
      const { data: oldestPending } = await supabase
        .from('shadow_trades')
        .select('entry_time')
        .eq('outcome_status', 'pending')
        .order('entry_time', { ascending: true })
        .limit(1)
        .single();
      
      // Log piggyback start
      await supabase.from('control_events').insert({
        action: 'shadow_piggyback_start',
        metadata: {
          generation_id: agent.generation_id,
          agent_id: agent.id,
          pending_shadow_count: pendingCount ?? 0,
          oldest_pending_entry_time: oldestPending?.entry_time ?? null,
          trigger: 'trade_cycle_end',
        },
      });
      
      console.log(`[trade-cycle] Shadow piggyback start: ${pendingCount ?? 0} pending`);
      
      const shadowCalcResponse = await fetch(`${supabaseUrl}/functions/v1/shadow-outcome-calc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({}),
      });
      
      const shadowCalcJson = await shadowCalcResponse.json();
      console.log(`[trade-cycle] Shadow outcome calc result:`, shadowCalcJson);
      
      piggybackResult = {
        ok: shadowCalcJson.ok ?? shadowCalcResponse.ok,
        processed: shadowCalcJson.processed ?? 0,
        calculated: shadowCalcJson.calculated ?? 0,
        skipped: shadowCalcJson.skipped ?? 0,
        errors: shadowCalcJson.errors ?? 0,
      };
      
    } catch (shadowErr) {
      console.error('[trade-cycle] Shadow outcome calc failed:', shadowErr);
      piggybackResult = {
        ok: false,
        error_message: shadowErr instanceof Error ? shadowErr.message : 'Unknown error',
      };
    }
    
    // Log piggyback end (always, even on error)
    try {
      await supabase.from('control_events').insert({
        action: 'shadow_piggyback_end',
        metadata: {
          ok: piggybackResult.ok,
          processed: piggybackResult.processed ?? 0,
          calculated: piggybackResult.calculated ?? 0,
          skipped: piggybackResult.skipped ?? 0,
          errors: piggybackResult.errors ?? 0,
          error_message: piggybackResult.error_message ?? null,
          duration_ms: Date.now() - piggybackStart,
        },
      });
    } catch (logErr) {
      console.error('[trade-cycle] Failed to log piggyback end:', logErr);
    }

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
