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
}

// Gate failure telemetry for learning
interface GateFailure {
  gate: string;
  actual: number;
  threshold: number;
  margin: number; // How far from passing (negative = failed by this much)
}

// Determine market regime from market data
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
  
  // drought_only mode: decay if not in drought
  if (tuning.mode === 'drought_only' && !droughtResolved.detected) {
    const currentOffsets = tuning.offsets ?? {};
    if (Object.keys(currentOffsets).length === 0) return;
    
    const nextOffsets = decayOffsets(currentOffsets, tuning.decay_step_pct, tuning.max_relax_pct);
    
    if (JSON.stringify(nextOffsets) !== JSON.stringify(currentOffsets)) {
      await supabase.from('system_config').update({
        config: { 
          ...cfg, 
          adaptive_tuning: { ...tuning, offsets: nextOffsets } 
        },
        updated_at: now.toISOString(),
      }).eq('id', configId);
      
      console.log('[adaptive-tuning] Decayed offsets:', nextOffsets);
    }
    return;
  }
  
  // Check if override is force_off (don't tune during force_off)
  if (droughtResolved.override === 'force_off') return;
  
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
  
  // Aggregate gate telemetry
  const failCounts: Record<string, number> = {};
  const nearestCounts: Record<string, number> = {};
  
  for (const r of rows) {
    const m = (r.metadata ?? {}) as Record<string, unknown>;
    
    // Count nearest_pass occurrences
    const nearestPass = m.nearest_pass as { gate?: string } | undefined;
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
    console.log('[adaptive-tuning] No candidate gate found');
    return;
  }
  
  const offsets = { ...(tuning.offsets ?? {}) };
  const currentOffset = offsets[candidate] ?? 0;
  
  // Relax = make more negative, bounded by max_relax_pct
  const nextOffset = Math.max(currentOffset - tuning.step_pct, -tuning.max_relax_pct);
  
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
  
  // Log the tuning event
  await supabase.from('control_events').insert({
    action: 'adaptive_tuning_update',
    metadata: {
      gate: candidate,
      previous_offset: currentOffset,
      new_offset: nextOffset,
      nearest_counts: nearestCounts,
      fail_counts: failCounts,
      window_size: rows.length,
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

// Confidence calibration
function calibrateConfidence(rawConfidence: number, tradeCount: number): number {
  const MIN_TRADES_FOR_FULL_CONFIDENCE = 30;
  const scaleFactor = Math.min(1, tradeCount / MIN_TRADES_FOR_FULL_CONFIDENCE);
  return rawConfidence * scaleFactor;
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
  exitReason?: string;
  gateFailures: GateFailure[];
  nearestPass?: GateFailure;
} {
  const reasons: string[] = [];
  let confidence = 0.5;
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
      confidence = calibrateConfidence(rawConfidence, agentTradeCount);
      return { decision: 'buy', reasons, confidence, gateFailures, nearestPass };
    }
    
    if (hasPosition && market.ema_50_slope < 0) {
      reasons.push('trend_reversal');
      exitReason = 'trend_reversal';
      confidence = calibrateConfidence(0.65, agentTradeCount);
      return { decision: 'sell', reasons, confidence, exitReason, gateFailures, nearestPass };
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
      confidence = calibrateConfidence(rawConfidence, agentTradeCount);
      return { decision: 'buy', reasons, confidence, gateFailures, nearestPass };
    }
    
    if (overbought && hasPosition) {
      reasons.push('overbought', 'take_profit');
      exitReason = 'take_profit';
      confidence = calibrateConfidence(0.6, agentTradeCount);
      return { decision: 'sell', reasons, confidence, exitReason, gateFailures, nearestPass };
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
      confidence = calibrateConfidence(rawConfidence, agentTradeCount);
      return { decision: 'buy', reasons, confidence, gateFailures, nearestPass };
    }
    
    if (hasPosition && market.atr_ratio > (thresholds.vol_expansion_exit ?? 1.4)) {
      reasons.push('volatility_spike', 'exit_breakout');
      exitReason = 'exit_breakout';
      confidence = calibrateConfidence(0.55, agentTradeCount);
      return { decision: 'sell', reasons, confidence, exitReason, gateFailures, nearestPass };
    }
  }
  
  reasons.push('no_signal');
  return { decision: 'hold', reasons, confidence: 0.5, gateFailures, nearestPass };
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
    
    // Get test mode flag
    const { data: configData } = await supabase
      .from('system_config')
      .select('config')
      .limit(1)
      .single();
    
    const testMode = configData?.config?.strategy_test_mode === true;
    
    const thresholdsUsed = testMode 
      ? 'test_mode' 
      : droughtModeActive 
        ? 'drought_mode' 
        : 'baseline';
    
    console.log(`[trade-cycle] Mode: ${thresholdsUsed} | Thresholds: trend=${droughtModeActive ? DROUGHT_THRESHOLDS.trend_threshold : BASELINE_THRESHOLDS.trend_threshold}`);
    
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
        exitReason: result.exitReason,
        positionQty: posQty,
        gateFailures: result.gateFailures,
        nearestPass: result.nearestPass,
      });
      
      console.log(`[trade-cycle] ${sym}: ${result.decision} (conf=${result.confidence.toFixed(2)}, reasons=${result.reasons.join(',')})`);
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
    const { symbol, market, decision, reasons, confidence, exitReason, positionQty, gateFailures } = bestCandidate;
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
    };
    
    // Add explorer_mode tag for tracking
    if (isExplorerTrade) {
      (tags as TradeTags & { explorer_mode?: boolean }).explorer_mode = true;
    }

    const evaluations = candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(c => ({
        symbol: c.symbol,
        decision: c.decision,
        reasons: c.reasons,
        confidence: c.confidence,
        gate_failures: c.gateFailures,
        market: {
          price: c.market.price,
          change_24h: c.market.change_24h,
          ema_slope: c.market.ema_50_slope,
          atr: c.market.atr_ratio,
          regime: getRegime(c.market),
        },
      }));

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
