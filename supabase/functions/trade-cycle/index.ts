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

interface Agent {
  id: string;
  generation_id: string;
  strategy_template: StrategyTemplate;
  genes: Record<string, number>;
  capital_allocation: number;
  status: string;
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
  active: boolean;
  blocked: boolean;
  blockReason?: string;
  killed: boolean;
  killReason?: string;
  cooldownUntil?: string;
  override: 'auto' | 'force_off' | 'force_on';
  detection: DroughtState;
}

async function resolveDroughtMode(
  supabase: any,
  accountId: string,
  startingCash: number,
  marketData: MarketData[]
): Promise<ResolvedDroughtState> {
  // 1. Get detection state
  const detection = await detectDrought(supabase);
  
  // 2. Get system config for override + cooldown state
  const { data: configData } = await supabase
    .from('system_config')
    .select('config')
    .limit(1)
    .single();
  
  const config = configData?.config ?? {};
  const override = (config.drought_override ?? 'auto') as 'auto' | 'force_off' | 'force_on';
  const cooldownUntil = config.drought_cooldown_until as string | undefined;
  
  // 3. Check cooldown
  const now = new Date();
  const inCooldown = cooldownUntil && new Date(cooldownUntil) > now;
  
  // 4. Check if force_off
  if (override === 'force_off') {
    return {
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
  let shouldBeActive = override === 'force_on' || detection.isActive;
  
  // 7. Safety checks (can kill even force_on)
  const { data: account } = await supabase
    .from('paper_accounts')
    .select('cash')
    .eq('id', accountId)
    .single();
  
  if (!account) {
    return {
      active: false,
      blocked: true,
      blockReason: 'no_account',
      killed: false,
      override,
      detection,
    };
  }
  
  const cashPct = (account.cash / startingCash) * 100;
  const drawdownPct = 100 - cashPct;
  
  // Kill check: drawdown
  if (shouldBeActive && drawdownPct > DROUGHT_SAFETY.max_drawdown_pct) {
    // Set cooldown
    const cooldownEnd = new Date(now.getTime() + DROUGHT_SAFETY.kill_cooldown_hours * 60 * 60 * 1000).toISOString();
    await supabase
      .from('system_config')
      .update({ 
        config: { ...config, drought_cooldown_until: cooldownEnd },
        updated_at: now.toISOString(),
      })
      .eq('id', configData.id);
    
    // Log kill event
    await supabase.from('control_events').insert({
      action: 'drought_kill',
      metadata: {
        reason: 'drawdown',
        drawdown_pct: drawdownPct,
        threshold: DROUGHT_SAFETY.max_drawdown_pct,
        cooldown_until: cooldownEnd,
      },
    });
    
    return {
      active: false,
      blocked: false,
      killed: true,
      killReason: `drawdown_${drawdownPct.toFixed(1)}pct`,
      cooldownUntil: cooldownEnd,
      override,
      detection,
    };
  }
  
  // Kill check: volatility spike
  const avgAtr = marketData.length > 0 
    ? marketData.reduce((sum, m) => sum + m.atr_ratio, 0) / marketData.length 
    : 1;
  
  if (shouldBeActive && avgAtr > DROUGHT_SAFETY.vol_spike_atr) {
    // Soft exit - no cooldown, just disable
    return {
      active: false,
      blocked: false,
      killed: true,
      killReason: `vol_spike_${avgAtr.toFixed(2)}`,
      override,
      detection,
    };
  }
  
  // Block check: low cash
  if (shouldBeActive && cashPct < DROUGHT_SAFETY.min_cash_pct) {
    return {
      active: false,
      blocked: true,
      blockReason: `low_cash_${cashPct.toFixed(0)}pct`,
      killed: false,
      override,
      detection,
    };
  }
  
  // Block check: hourly cap
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: droughtOrderCount } = await supabase
    .from('paper_orders')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneHourAgo)
    .eq('status', 'filled');
  
  // This is approximate - we'd need to check tags but that requires row fetch
  // For now, just cap total trades in drought periods
  if (shouldBeActive && (droughtOrderCount ?? 0) >= DROUGHT_SAFETY.max_trades_per_hour) {
    return {
      active: shouldBeActive,
      blocked: true,
      blockReason: `hourly_cap_${droughtOrderCount}`,
      killed: false,
      override,
      detection,
    };
  }
  
  return {
    active: shouldBeActive,
    blocked: false,
    killed: false,
    override,
    detection,
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
  // 2. Drought mode: use DROUGHT_THRESHOLDS
  // 3. Normal mode: use agent genes or BASELINE_THRESHOLDS
  let thresholds: typeof BASELINE_THRESHOLDS;
  if (testMode) {
    thresholds = TEST_MODE_THRESHOLDS;
  } else if (droughtMode) {
    thresholds = DROUGHT_THRESHOLDS;
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
    const droughtResolved = await resolveDroughtMode(
      supabase, 
      paperAccount.id, 
      paperAccount.starting_cash,
      marketDataList as MarketData[]
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

    // 5. Get active agents
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('*')
      .eq('status', 'active')
      .limit(100);

    if (agentsError || !agents || agents.length === 0) {
      console.log('[trade-cycle] No active agents found');
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_agents' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
            active: droughtResolved.detection.isActive,
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
    
    // Calculate qty with drought mode adjustment
    const baseQty = symbol === 'BTC-USD' ? 0.0001 : 0.001;
    const sizeMultiplier = droughtModeActive ? DROUGHT_SAFETY.size_multiplier : 1.0;
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
          active: droughtModeActive,
          blocked: droughtBlocked,
          block_reason: droughtBlockReason,
          killed: droughtKilled,
          kill_reason: droughtKillReason,
          override: droughtResolved.override,
          reason: droughtResolved.detection.reason,
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

    console.log(`[trade-cycle] BEST: ${decision.toUpperCase()} ${finalQty} ${symbol} | conf=${confidence.toFixed(2)} | drought=${droughtModeActive} | reasons=${reasons.join(',')}`);

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

    return new Response(
      JSON.stringify({
        ok: true,
        decision,
        agent_id: agent.id,
        symbol,
        qty: finalQty,
        symbols_evaluated: symbolsToEvaluate,
        drought_mode: droughtModeActive,
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
