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
  market_snapshot: {
    price: number;
    change_24h: number;
    ema_50_slope: number;
    atr_ratio: number;
    age_seconds: number;
  };
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
// BASELINE CRYPTO TRADING KNOWLEDGE (SEEDED PRIORS)
// ===========================================================================
// These are evidence-based starting thresholds from crypto market analysis.
// They're NOT "winners", just reasonable priors to avoid garbage exploration.
// Evolution can still mutate and discover better values over time.
// ===========================================================================

// BASELINE THRESHOLDS - VALIDATION PHASE (AGGRESSIVE)
// These are very loose to force trades for pipeline validation.
// MUST tighten back after validation passes (30-50 trades).
const BASELINE_THRESHOLDS = {
  // Trend Pullback: Very low slope threshold
  trend_threshold: 0.005,      // 0.5% EMA slope - almost any trend triggers
  pullback_pct: 5.0,           // 5% pullback tolerance - very lenient
  
  // Mean Reversion: Very low change threshold
  rsi_threshold: 0.8,          // 0.8% move in 24h - triggers on small moves
  
  // Breakout: High contraction threshold so most conditions qualify
  vol_contraction: 1.3,        // ATR ratio < 1.3 - triggers in normal/high volatility
  vol_expansion_exit: 1.2,     // Earlier exit
  
  // Confidence modifiers
  min_confidence: 0.5,
  max_confidence: 0.85,
};

// TEST MODE THRESHOLDS - looser to trigger trades for pipeline validation
// IMPORTANT: Trades made with test_mode=true should NEVER train the system
const TEST_MODE_THRESHOLDS = {
  trend_threshold: 0.01,       // Much looser - almost any slope triggers
  pullback_pct: 1.5,           // Small pullback still qualifies
  rsi_threshold: 1.0,          // Very easy oversold/overbought
  vol_contraction: 1.2,        // Breakout triggers in normal conditions
  vol_expansion_exit: 1.3,
  min_confidence: 0.5,
  max_confidence: 0.85,
};

// ===========================================================================
// LEARNABLE TRADE FILTER
// ===========================================================================
// Use this to exclude test mode trades from fitness/evolution/pattern_stats
// ===========================================================================
interface TradeTagsForLearning {
  test_mode?: boolean;
  entry_reason?: string[];
}

/**
 * Returns true if this trade should be used for learning (fitness, evolution, pattern_stats).
 * Excludes: test_mode trades, trades with 'test_mode' in entry_reason.
 */
function isLearnableTrade(tags: TradeTagsForLearning): boolean {
  if (tags.test_mode === true) return false;
  if (tags.entry_reason?.includes('test_mode')) return false;
  return true;
}

// Export for use in fitness/evolution functions later
// Usage: if (!isLearnableTrade(trade.tags)) continue;

// Confidence calibration - scales raw confidence by sample size
// Prevents overconfidence with few trades (survivorship bias protection)
function calibrateConfidence(rawConfidence: number, tradeCount: number): number {
  const MIN_TRADES_FOR_FULL_CONFIDENCE = 30;
  const scaleFactor = Math.min(1, tradeCount / MIN_TRADES_FOR_FULL_CONFIDENCE);
  return rawConfidence * scaleFactor;
}

// Simple strategy decision logic
function makeDecision(
  agent: Agent,
  market: MarketData,
  hasPosition: boolean,
  positionQty: number,
  testMode: boolean,
  agentTradeCount: number = 0
): { decision: Decision; reasons: string[]; confidence: number; exitReason?: string } {
  const reasons: string[] = [];
  let confidence = 0.5;
  let exitReason: string | undefined;
  
  const regime = getRegime(market);
  const strategy = agent.strategy_template;
  const genes = agent.genes;
  
  // Threshold selection priority:
  // 1. Test mode: use TEST_MODE_THRESHOLDS (loose, for pipeline validation)
  // 2. Normal mode: use agent genes if set, else BASELINE_THRESHOLDS (sensible crypto defaults)
  const thresholds = testMode 
    ? TEST_MODE_THRESHOLDS 
    : {
        trend_threshold: genes.trend_threshold ?? BASELINE_THRESHOLDS.trend_threshold,
        pullback_pct: genes.pullback_pct ?? BASELINE_THRESHOLDS.pullback_pct,
        rsi_threshold: genes.rsi_threshold ?? BASELINE_THRESHOLDS.rsi_threshold,
        vol_contraction: genes.vol_contraction ?? BASELINE_THRESHOLDS.vol_contraction,
        vol_expansion_exit: genes.vol_expansion_exit ?? BASELINE_THRESHOLDS.vol_expansion_exit,
      };
  
  // Trend Pullback Strategy
  if (strategy === 'trend_pullback') {
    // Use >= for slope comparison to catch edge cases
    const emaTrending = Math.abs(market.ema_50_slope) >= thresholds.trend_threshold;
    // FIX: Use absolute value for pullback - negative change IS a pullback in uptrend
    const pullback = Math.abs(market.change_24h) <= thresholds.pullback_pct;
    
    if (emaTrending && market.ema_50_slope > 0 && pullback && !hasPosition) {
      reasons.push('ema_trending_up', 'pullback_detected');
      if (testMode) reasons.push('test_mode');
      const rawConfidence = 0.6 + Math.min(0.2, Math.abs(market.ema_50_slope) * 5);
      confidence = calibrateConfidence(rawConfidence, agentTradeCount);
      return { decision: 'buy', reasons, confidence };
    }
    
    if (hasPosition && market.ema_50_slope < 0) {
      reasons.push('trend_reversal');
      exitReason = 'trend_reversal';
      confidence = calibrateConfidence(0.65, agentTradeCount);
      return { decision: 'sell', reasons, confidence, exitReason };
    }
  }
  
  // Mean Reversion Strategy
  if (strategy === 'mean_reversion') {
    const oversold = market.change_24h < -thresholds.rsi_threshold;
    const overbought = market.change_24h > thresholds.rsi_threshold;
    
    if (oversold && !hasPosition && regime === 'ranging') {
      reasons.push('oversold', 'ranging_regime');
      if (testMode) reasons.push('test_mode');
      const rawConfidence = 0.55 + Math.min(0.2, Math.abs(market.change_24h) / 20);
      confidence = calibrateConfidence(rawConfidence, agentTradeCount);
      return { decision: 'buy', reasons, confidence };
    }
    
    if (overbought && hasPosition) {
      reasons.push('overbought', 'take_profit');
      exitReason = 'take_profit';
      confidence = calibrateConfidence(0.6, agentTradeCount);
      return { decision: 'sell', reasons, confidence, exitReason };
    }
  }
  
  // Breakout Strategy
  if (strategy === 'breakout') {
    const volatilityContraction = market.atr_ratio < thresholds.vol_contraction;
    
    if (volatilityContraction && market.ema_50_slope > 0 && !hasPosition) {
      reasons.push('volatility_contraction', 'upward_bias');
      if (testMode) reasons.push('test_mode');
      const rawConfidence = 0.5 + Math.min(0.15, (1 - market.atr_ratio) * 0.5);
      confidence = calibrateConfidence(rawConfidence, agentTradeCount);
      return { decision: 'buy', reasons, confidence };
    }
    
    if (hasPosition && market.atr_ratio > (thresholds.vol_expansion_exit ?? 1.4)) {
      reasons.push('volatility_spike', 'exit_breakout');
      exitReason = 'exit_breakout';
      confidence = calibrateConfidence(0.55, agentTradeCount);
      return { decision: 'sell', reasons, confidence, exitReason };
    }
  }
  
  reasons.push('no_signal');
  return { decision: 'hold', reasons, confidence: 0.5 };
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
  console.log(`[trade-cycle] THRESHOLDS: trend=${BASELINE_THRESHOLDS.trend_threshold}, pullback=${BASELINE_THRESHOLDS.pullback_pct}, rsi=${BASELINE_THRESHOLDS.rsi_threshold}, vol_contraction=${BASELINE_THRESHOLDS.vol_contraction}`);

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

    // Must be running and paper mode
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

    // 2. Get active agents
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

    // 3. Get market data for all symbols
    const { data: marketDataList, error: marketError } = await supabase
      .from('market_data')
      .select('*')
      .in('symbol', ['BTC-USD', 'ETH-USD']);

    if (marketError || !marketDataList || marketDataList.length === 0) {
      console.log('[trade-cycle] No market data available');
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_market_data' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const marketBySymbol = new Map<string, MarketData>();
    for (const m of marketDataList) {
      marketBySymbol.set(m.symbol, m as MarketData);
    }

    // 4. Get paper account for position checks
    const { data: paperAccount } = await supabase
      .from('paper_accounts')
      .select('id, cash')
      .limit(1)
      .single();

    if (!paperAccount) {
      console.log('[trade-cycle] No paper account found');
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_account' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Get current positions
    const { data: positions } = await supabase
      .from('paper_positions')
      .select('symbol, qty')
      .eq('account_id', paperAccount.id);

    const positionBySymbol = new Map<string, number>();
    for (const p of positions ?? []) {
      positionBySymbol.set(p.symbol, p.qty);
    }

    // 6. Pick one agent for this cycle (round-robin by cycle time)
    const agentIndex = Math.floor(Date.now() / 60000) % agents.length;
    const agent = agents[agentIndex] as Agent;
    
    // 7. Pick symbol (alternate between BTC and ETH based on agent index)
    const symbols = ['BTC-USD', 'ETH-USD'];
    const symbol = symbols[agentIndex % 2];
    const market = marketBySymbol.get(symbol);

    if (!market) {
      console.log(`[trade-cycle] No market data for ${symbol}`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_market_for_symbol' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dataAge = getDataAge(market.updated_at);
    
    // === FRESHNESS GATE: Skip if market data is stale ===
    const MAX_MARKET_AGE_SECONDS = 120;
    if (dataAge > MAX_MARKET_AGE_SECONDS) {
      console.log(`[trade-cycle] Market data stale (${dataAge}s old), skipping`);
      
      await supabase.from('control_events').insert({
        action: 'trade_decision',
        metadata: {
          cycle_id: cycleId,
          agent_id: agent.id,
          generation_id: systemState.current_generation_id,
          symbol,
          decision: 'hold',
          reason: 'stale_market_data_skip',
          market_age_seconds: dataAge,
          mode: 'paper',
        },
      });
      
      return new Response(
        JSON.stringify({ 
          ok: true, 
          skipped: true, 
          reason: 'stale_market_data_skip',
          market_age_seconds: dataAge,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 7b. Get system config for test mode flag
    const { data: configData } = await supabase
      .from('system_config')
      .select('config')
      .limit(1)
      .single();
    
    const testMode = configData?.config?.strategy_test_mode === true;
    
    if (testMode) {
      console.log('[trade-cycle] TEST MODE ACTIVE - using loosened thresholds');
    }
    
    // 7c. Get agent's trade count for confidence calibration
    const { data: agentTradeData } = await supabase
      .from('paper_orders')
      .select('id')
      .eq('agent_id', agent.id)
      .eq('status', 'filled');
    const agentTradeCount = agentTradeData?.length ?? 0;
    
    const regime = getRegime(market);
    const positionQty = positionBySymbol.get(symbol) ?? 0;
    const hasPosition = positionQty > 0;

    console.log(`[trade-cycle] Agent ${agent.id.substring(0, 8)} | ${agent.strategy_template} | ${symbol} | regime=${regime} | pos=${positionQty} | trades=${agentTradeCount}`);

    // 8. Make decision (pass testMode flag and trade count for confidence calibration)
    const { decision, reasons, confidence, exitReason } = makeDecision(agent, market, hasPosition, positionQty, testMode, agentTradeCount);
    
    // Calculate qty early so we can log the correct value
    const baseQty = symbol === 'BTC-USD' ? 0.0001 : 0.001;
    const plannedQty = decision === 'sell' ? Math.min(baseQty, positionQty) : baseQty;
    
    const patternId = generatePatternId(agent.strategy_template, symbol, regime, reasons);
    
    const tags: TradeTags = {
      strategy_template: agent.strategy_template,
      regime_at_entry: regime,
      entry_reason: reasons,
      exit_reason: exitReason,
      confidence,
      pattern_id: patternId,
      test_mode: testMode,
      market_snapshot: {
        price: market.price,
        change_24h: market.change_24h,
        ema_50_slope: market.ema_50_slope,
        atr_ratio: market.atr_ratio,
        age_seconds: dataAge,
      },
    };

    // 9. Log decision to control_events (even for HOLD)
    // CRITICAL: Use system_state.current_generation_id, NOT agent.generation_id
    // Agents table may have stale/placeholder generation_id
    await supabase.from('control_events').insert({
      action: 'trade_decision',
      metadata: {
        cycle_id: cycleId,
        agent_id: agent.id,
        generation_id: systemState.current_generation_id,
        symbol,
        decision,
        qty: decision !== 'hold' ? plannedQty : null,
        ...tags,
        mode: 'paper',
        // Threshold snapshot for deployment verification
        thresholds_used: {
          trend: BASELINE_THRESHOLDS.trend_threshold,
          pullback: BASELINE_THRESHOLDS.pullback_pct,
          rsi: BASELINE_THRESHOLDS.rsi_threshold,
          vol_contraction: BASELINE_THRESHOLDS.vol_contraction,
        },
      },
    });

    // 10. If HOLD, we're done
    if (decision === 'hold') {
      console.log(`[trade-cycle] Decision: HOLD | reasons=${reasons.join(',')}`);
      return new Response(
        JSON.stringify({
          ok: true,
          decision: 'hold',
          agent_id: agent.id,
          symbol,
          reasons,
          duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 11. Use pre-calculated quantity
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

    console.log(`[trade-cycle] Decision: ${decision.toUpperCase()} ${finalQty} ${symbol} | conf=${confidence.toFixed(2)} | reasons=${reasons.join(',')}`);

    // 12. Submit to trade-execute (which handles all gates)
    // Use service role key for internal function-to-function calls
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