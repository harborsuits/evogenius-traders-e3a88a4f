import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ===========================================================================
// FITNESS V1 CALCULATION
// ===========================================================================
// Formula: (Normalized_Net_PnL × 0.35) + (Sharpe_Ratio × 0.25) + (Profitable_Days_Ratio × 0.15)
//          - (Max_Drawdown × 0.15) - (Overtrading_Penalty × 0.10)
//
// IMPORTANT: Excludes test_mode trades from all calculations
// ===========================================================================

interface AgentTradeData {
  agent_id: string;
  generation_id: string;
  trades: TradeRecord[];
}

interface TradeRecord {
  id: string;
  symbol: string;
  side: string;
  filled_price: number;
  filled_qty: number;
  fee: number;
  filled_at: string;
  tags: {
    test_mode?: boolean;
    [key: string]: unknown;
  };
}

interface FitnessComponents {
  normalized_pnl: number;
  sharpe_ratio: number;
  profitable_days_ratio: number;
  max_drawdown: number;
  overtrading_penalty: number;
  fitness_score: number;
  net_pnl: number;
  total_trades: number;
  gross_profit: number;
  total_fees: number;
}

// Filter out test mode trades
function isLearnableTrade(tags: { test_mode?: boolean; entry_reason?: string[] } | null): boolean {
  if (!tags) return true;
  if (tags.test_mode === true) return false;
  if (tags.entry_reason?.includes('test_mode')) return false;
  return true;
}

// Normalize PnL using tanh to get stable 0..1 range
function normalizePnL(pnl: number, scale: number = 100): number {
  return Math.tanh(pnl / scale);
}

// Calculate Sharpe Ratio from daily returns (clamped to ±3)
function calculateSharpe(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  // Annualized Sharpe (assuming 365 trading days for crypto)
  const sharpe = (mean / stdDev) * Math.sqrt(365);
  
  // Clamp to reasonable range
  return Math.max(-3, Math.min(3, sharpe));
}

// Calculate max drawdown from equity curve (returns 0..1)
function calculateMaxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length < 2) return 0;
  
  let maxDrawdown = 0;
  let peak = equityCurve[0];
  
  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    const drawdown = (peak - equity) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }
  
  return maxDrawdown;
}

// Calculate overtrading penalty (0..1 where 1 = worst)
function calculateOvertradingPenalty(
  totalFees: number,
  grossProfit: number,
  tradesPerDay: number,
  maxTradesPerDay: number = 5
): number {
  let penalty = 0;
  
  // Penalty if fees > 30% of gross profit
  if (grossProfit > 0 && totalFees / grossProfit > 0.3) {
    penalty += 0.5 * (totalFees / grossProfit - 0.3);
  }
  
  // Penalty if trading too frequently
  if (tradesPerDay > maxTradesPerDay) {
    penalty += 0.3 * (tradesPerDay / maxTradesPerDay - 1);
  }
  
  return Math.min(1, penalty);
}

// Group trades by day and calculate daily PnL
function getDailyPnL(trades: TradeRecord[]): { date: string; pnl: number }[] {
  const dailyMap = new Map<string, number>();
  
  for (const trade of trades) {
    const date = trade.filled_at.split('T')[0];
    const tradePnl = trade.side === 'sell' 
      ? (trade.filled_price * trade.filled_qty) - trade.fee
      : -(trade.filled_price * trade.filled_qty) - trade.fee;
    
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + tradePnl);
  }
  
  return Array.from(dailyMap.entries())
    .map(([date, pnl]) => ({ date, pnl }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Main fitness calculation for an agent
function calculateFitness(trades: TradeRecord[]): FitnessComponents {
  // Filter to learnable trades only
  const learnableTrades = trades.filter(t => isLearnableTrade(t.tags));
  
  if (learnableTrades.length === 0) {
    return {
      normalized_pnl: 0,
      sharpe_ratio: 0,
      profitable_days_ratio: 0,
      max_drawdown: 0,
      overtrading_penalty: 0,
      fitness_score: 0,
      net_pnl: 0,
      total_trades: 0,
      gross_profit: 0,
      total_fees: 0,
    };
  }

  // Calculate basic metrics
  let netPnl = 0;
  let grossProfit = 0;
  let totalFees = 0;
  
  for (const trade of learnableTrades) {
    const value = trade.filled_price * trade.filled_qty;
    totalFees += trade.fee;
    
    if (trade.side === 'sell') {
      grossProfit += value;
      netPnl += value - trade.fee;
    } else {
      netPnl -= value + trade.fee;
    }
  }

  // Daily metrics
  const dailyPnL = getDailyPnL(learnableTrades);
  const dailyReturns = dailyPnL.map(d => d.pnl);
  const profitableDays = dailyPnL.filter(d => d.pnl > 0).length;
  const totalDays = dailyPnL.length;
  
  // Equity curve for drawdown
  let equity = 1000; // Assume starting capital
  const equityCurve = [equity];
  for (const day of dailyPnL) {
    equity += day.pnl;
    equityCurve.push(equity);
  }

  // Calculate components
  const normalizedPnl = normalizePnL(netPnl);
  const sharpe = calculateSharpe(dailyReturns);
  const profitableDaysRatio = totalDays > 0 ? profitableDays / totalDays : 0;
  const maxDrawdown = calculateMaxDrawdown(equityCurve);
  
  // Trades per day
  const firstDate = new Date(learnableTrades[0].filled_at);
  const lastDate = new Date(learnableTrades[learnableTrades.length - 1].filled_at);
  const daySpan = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
  const tradesPerDay = learnableTrades.length / daySpan;
  
  const overtradingPenalty = calculateOvertradingPenalty(totalFees, grossProfit, tradesPerDay);

  // === FITNESS FORMULA ===
  // Normalize sharpe to 0..1 range for weighting (sharpe of 2 = excellent)
  const normalizedSharpe = (sharpe + 3) / 6; // Maps -3..3 to 0..1
  
  const fitnessScore = 
    (normalizedPnl * 0.35) +
    (normalizedSharpe * 0.25) +
    (profitableDaysRatio * 0.15) -
    (maxDrawdown * 0.15) -
    (overtradingPenalty * 0.10);

  return {
    normalized_pnl: normalizedPnl,
    sharpe_ratio: sharpe,
    profitable_days_ratio: profitableDaysRatio,
    max_drawdown: maxDrawdown,
    overtrading_penalty: overtradingPenalty,
    fitness_score: fitnessScore,
    net_pnl: netPnl,
    total_trades: learnableTrades.length,
    gross_profit: grossProfit,
    total_fees: totalFees,
  };
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
  console.log('[fitness-calc] Starting fitness calculation');

  try {
    // 1. Get current generation
    const { data: systemState } = await supabase
      .from('system_state')
      .select('current_generation_id')
      .limit(1)
      .single();

    const generationId = systemState?.current_generation_id;
    
    if (!generationId) {
      console.log('[fitness-calc] No active generation');
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_generation' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get all agents for this generation
    const { data: agents } = await supabase
      .from('agents')
      .select('id, generation_id, strategy_template')
      .eq('generation_id', generationId);

    if (!agents || agents.length === 0) {
      console.log('[fitness-calc] No agents found');
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_agents' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Get all filled paper orders (excluding test_mode via SQL)
    const { data: orders } = await supabase
      .from('paper_orders')
      .select('id, agent_id, symbol, side, filled_price, filled_qty, filled_at, tags')
      .eq('status', 'filled')
      .eq('generation_id', generationId)
      .not('tags->test_mode', 'eq', 'true');

    console.log(`[fitness-calc] Found ${orders?.length ?? 0} learnable orders for ${agents.length} agents`);

    // 4. Group orders by agent
    const ordersByAgent = new Map<string, TradeRecord[]>();
    for (const order of orders ?? []) {
      if (!order.agent_id) continue;
      
      const agentOrders = ordersByAgent.get(order.agent_id) ?? [];
      agentOrders.push({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        filled_price: order.filled_price ?? 0,
        filled_qty: order.filled_qty ?? 0,
        fee: 0, // Will get from fills
        filled_at: order.filled_at ?? '',
        tags: order.tags as TradeRecord['tags'],
      });
      ordersByAgent.set(order.agent_id, agentOrders);
    }

    // 5. Get fills for fee data
    const orderIds = orders?.map(o => o.id) ?? [];
    const { data: fills } = await supabase
      .from('paper_fills')
      .select('order_id, fee')
      .in('order_id', orderIds);

    // Map fees to orders
    const feeByOrder = new Map<string, number>();
    for (const fill of fills ?? []) {
      feeByOrder.set(fill.order_id, (feeByOrder.get(fill.order_id) ?? 0) + fill.fee);
    }

    // Update order fees
    for (const agentOrders of ordersByAgent.values()) {
      for (const order of agentOrders) {
        order.fee = feeByOrder.get(order.id) ?? 0;
      }
    }

    // 6. Calculate fitness for each agent and upsert to performance table
    const results: { agent_id: string; fitness: FitnessComponents }[] = [];
    
    for (const agent of agents) {
      const agentTrades = ordersByAgent.get(agent.id) ?? [];
      const fitness = calculateFitness(agentTrades);
      
      results.push({ agent_id: agent.id, fitness });

      // Upsert performance record
      const { error: upsertError } = await supabase
        .from('performance')
        .upsert({
          agent_id: agent.id,
          generation_id: generationId,
          fitness_score: fitness.fitness_score,
          net_pnl: fitness.net_pnl,
          sharpe_ratio: fitness.sharpe_ratio,
          max_drawdown: fitness.max_drawdown,
          profitable_days_ratio: fitness.profitable_days_ratio,
          total_trades: fitness.total_trades,
        }, {
          onConflict: 'agent_id,generation_id',
        });

      if (upsertError) {
        console.error(`[fitness-calc] Failed to upsert performance for ${agent.id}:`, upsertError);
      }
    }

    // 7. Log to control_events
    await supabase.from('control_events').insert({
      action: 'fitness_calculated',
      metadata: {
        generation_id: generationId,
        agents_processed: agents.length,
        trades_analyzed: orders?.length ?? 0,
        top_agents: results
          .sort((a, b) => b.fitness.fitness_score - a.fitness.fitness_score)
          .slice(0, 5)
          .map(r => ({
            agent_id: r.agent_id.substring(0, 8),
            score: r.fitness.fitness_score.toFixed(4),
            pnl: r.fitness.net_pnl.toFixed(2),
            trades: r.fitness.total_trades,
          })),
        duration_ms: Date.now() - startTime,
      },
    });

    console.log(`[fitness-calc] Completed in ${Date.now() - startTime}ms`);

    return new Response(
      JSON.stringify({
        ok: true,
        generation_id: generationId,
        agents_processed: agents.length,
        trades_analyzed: orders?.length ?? 0,
        duration_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[fitness-calc] Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
