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
  confidence: number;
  pattern_id: string;
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

// Simple strategy decision logic (v1 - placeholder for real strategy rules)
function makeDecision(
  agent: Agent,
  market: MarketData,
  hasPosition: boolean,
  positionQty: number
): { decision: Decision; reasons: string[]; confidence: number } {
  const reasons: string[] = [];
  let confidence = 0.5;
  
  const regime = getRegime(market);
  const strategy = agent.strategy_template;
  const genes = agent.genes;
  
  // Trend Pullback Strategy
  if (strategy === 'trend_pullback') {
    const emaTrending = Math.abs(market.ema_50_slope) > (genes.trend_threshold ?? 0.02);
    const pullback = Math.abs(market.change_24h) < (genes.pullback_pct ?? 3);
    
    if (emaTrending && market.ema_50_slope > 0 && pullback && !hasPosition) {
      reasons.push('ema_trending_up', 'pullback_detected');
      confidence = 0.6 + Math.min(0.2, Math.abs(market.ema_50_slope) * 5);
      return { decision: 'buy', reasons, confidence };
    }
    
    if (hasPosition && market.ema_50_slope < 0) {
      reasons.push('trend_reversal');
      confidence = 0.65;
      return { decision: 'sell', reasons, confidence };
    }
  }
  
  // Mean Reversion Strategy
  if (strategy === 'mean_reversion') {
    const oversold = market.change_24h < -(genes.rsi_threshold ?? 5);
    const overbought = market.change_24h > (genes.rsi_threshold ?? 5);
    
    if (oversold && !hasPosition && regime === 'ranging') {
      reasons.push('oversold', 'ranging_regime');
      confidence = 0.55 + Math.min(0.2, Math.abs(market.change_24h) / 20);
      return { decision: 'buy', reasons, confidence };
    }
    
    if (overbought && hasPosition) {
      reasons.push('overbought', 'take_profit');
      confidence = 0.6;
      return { decision: 'sell', reasons, confidence };
    }
  }
  
  // Breakout Strategy
  if (strategy === 'breakout') {
    const volatilityContraction = market.atr_ratio < (genes.vol_contraction ?? 0.8);
    const volumeExpansion = market.volume_24h > 0; // Simplified - would need baseline
    
    if (volatilityContraction && market.ema_50_slope > 0 && !hasPosition) {
      reasons.push('volatility_contraction', 'upward_bias');
      confidence = 0.5 + Math.min(0.15, (1 - market.atr_ratio) * 0.5);
      return { decision: 'buy', reasons, confidence };
    }
    
    if (hasPosition && market.atr_ratio > 1.5) {
      reasons.push('volatility_spike', 'exit_breakout');
      confidence = 0.55;
      return { decision: 'sell', reasons, confidence };
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
          generation_id: agent.generation_id,
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
    
    const regime = getRegime(market);
    const positionQty = positionBySymbol.get(symbol) ?? 0;
    const hasPosition = positionQty > 0;

    console.log(`[trade-cycle] Agent ${agent.id.substring(0, 8)} | ${agent.strategy_template} | ${symbol} | regime=${regime} | pos=${positionQty}`);

    // 8. Make decision
    const { decision, reasons, confidence } = makeDecision(agent, market, hasPosition, positionQty);
    
    // Calculate qty early so we can log the correct value
    const baseQty = symbol === 'BTC-USD' ? 0.0001 : 0.001;
    const plannedQty = decision === 'sell' ? Math.min(baseQty, positionQty) : baseQty;
    
    const patternId = generatePatternId(agent.strategy_template, symbol, regime, reasons);
    
    const tags: TradeTags = {
      strategy_template: agent.strategy_template,
      regime_at_entry: regime,
      entry_reason: reasons,
      confidence,
      pattern_id: patternId,
      market_snapshot: {
        price: market.price,
        change_24h: market.change_24h,
        ema_50_slope: market.ema_50_slope,
        atr_ratio: market.atr_ratio,
        age_seconds: dataAge,
      },
    };

    // 9. Log decision to control_events (even for HOLD)
    await supabase.from('control_events').insert({
      action: 'trade_decision',
      metadata: {
        cycle_id: cycleId,
        agent_id: agent.id,
        generation_id: agent.generation_id,
        symbol,
        decision,
        qty: decision !== 'hold' ? plannedQty : null,
        ...tags,
        mode: 'paper',
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