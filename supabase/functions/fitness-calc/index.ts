import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ===========================================================================
// FITNESS V1 CALCULATION (CORRECTED)
// ===========================================================================
// Formula: (Normalized_Net_PnL × 0.35) + (Sharpe_Ratio × 0.25) + (Profitable_Days_Ratio × 0.15)
//          - (Max_Drawdown × 0.15) - (Overtrading_Penalty × 0.10)
//
// FIXED: Uses average-entry accounting for REAL realized PnL
// FIXED: Sharpe uses returns (not raw PnL)
// FIXED: Reads starting capital from paper_accounts
// IMPORTANT: Excludes test_mode trades from all calculations
// ===========================================================================

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
    entry_reason?: string[];
    [key: string]: unknown;
  } | null;
}

interface Position {
  qty: number;
  avg_entry: number;
  cost_basis: number;
}

interface FitnessComponents {
  normalized_pnl: number;
  sharpe_ratio: number;
  profitable_days_ratio: number;
  max_drawdown: number;
  overtrading_penalty: number;
  fitness_score: number;
  realized_pnl: number;
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

// Normalize PnL using tanh to get stable -1..1 range
function normalizePnL(pnl: number, scale: number = 50): number {
  return Math.tanh(pnl / scale);
}

// Calculate Sharpe Ratio from daily RETURNS (not PnL) - clamped to ±3
function calculateSharpe(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  // Annualized Sharpe (365 days for crypto)
  const sharpe = (mean / stdDev) * Math.sqrt(365);
  
  return Math.max(-3, Math.min(3, sharpe));
}

// Calculate max drawdown from equity curve (returns 0..1)
function calculateMaxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length < 2) return 0;
  
  let maxDrawdown = 0;
  let peak = equityCurve[0];
  
  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const drawdown = (peak - equity) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  }
  
  return maxDrawdown;
}

// Calculate overtrading penalty (0..1 where 1 = worst)
// Uses gross_profit (sum of winning trade PnLs) not proceeds
function calculateOvertradingPenalty(
  totalFees: number,
  grossProfit: number,
  tradesPerDay: number,
  maxTradesPerDay: number = 5
): number {
  let penalty = 0;
  
  // Penalty if fees > 30% of gross profit (actual wins)
  if (grossProfit > 0 && totalFees / grossProfit > 0.3) {
    penalty += 0.5 * Math.min(1, (totalFees / grossProfit - 0.3));
  }
  
  // Penalty if trading too frequently
  if (tradesPerDay > maxTradesPerDay) {
    penalty += 0.3 * Math.min(1, (tradesPerDay / maxTradesPerDay - 1));
  }
  
  return Math.min(1, penalty);
}

// ===========================================================================
// AVERAGE-ENTRY REALIZED PNL CALCULATION
// ===========================================================================
// Tracks position per symbol with weighted average entry price.
// On SELL: realized_pnl = (sell_price - avg_entry) * qty - fees
// ===========================================================================
interface RealizedPnLResult {
  realizedPnl: number;
  totalFees: number;
  grossProfit: number;  // Sum of positive trade PnLs only
  dailyPnL: Map<string, number>;
  equityCurve: number[];
  tradePnLs: number[];
}

function calculateRealizedPnL(
  trades: TradeRecord[],
  startingCapital: number
): RealizedPnLResult {
  // Sort trades chronologically
  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime()
  );

  // Track positions by symbol (average-entry accounting)
  const positions = new Map<string, Position>();
  
  let realizedPnl = 0;
  let totalFees = 0;
  let grossProfit = 0;
  const dailyPnL = new Map<string, number>();
  const tradePnLs: number[] = [];
  
  // Build equity curve
  let equity = startingCapital;
  const equityCurve = [equity];

  for (const trade of sortedTrades) {
    const { symbol, side, filled_price, filled_qty, fee, filled_at } = trade;
    const date = filled_at.split('T')[0];
    
    totalFees += fee;
    
    // Get or create position
    let pos = positions.get(symbol) ?? { qty: 0, avg_entry: 0, cost_basis: 0 };
    
    if (side === 'buy') {
      // BUY: Update weighted average entry
      const newCost = filled_price * filled_qty + fee;
      pos.cost_basis += newCost;
      pos.qty += filled_qty;
      pos.avg_entry = pos.qty > 0 ? pos.cost_basis / pos.qty : 0;
      
      // No realized PnL on buy, but track the fee as a "cost"
      tradePnLs.push(-fee);
      dailyPnL.set(date, (dailyPnL.get(date) ?? 0) - fee);
      equity -= fee;
      
    } else if (side === 'sell') {
      // SELL: Calculate realized PnL using average entry
      const sellQty = Math.min(filled_qty, pos.qty);
      
      if (sellQty > 0 && pos.avg_entry > 0) {
        const proceeds = filled_price * sellQty;
        const costOfSold = pos.avg_entry * sellQty;
        const tradePnl = proceeds - costOfSold - fee;
        
        realizedPnl += tradePnl;
        tradePnLs.push(tradePnl);
        dailyPnL.set(date, (dailyPnL.get(date) ?? 0) + tradePnl);
        equity += tradePnl;
        
        // Track gross profit (only winning trades)
        if (tradePnl > 0) {
          grossProfit += tradePnl;
        }
        
        // Update position
        pos.qty -= sellQty;
        pos.cost_basis = pos.qty * pos.avg_entry;
      } else {
        // Selling without position (shouldn't happen, but handle gracefully)
        tradePnLs.push(-fee);
        dailyPnL.set(date, (dailyPnL.get(date) ?? 0) - fee);
        equity -= fee;
      }
    }
    
    positions.set(symbol, pos);
    equityCurve.push(equity);
  }

  return {
    realizedPnl,
    totalFees,
    grossProfit,
    dailyPnL,
    equityCurve,
    tradePnLs,
  };
}

// Main fitness calculation for an agent
function calculateFitness(trades: TradeRecord[], startingCapital: number): FitnessComponents {
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
      realized_pnl: 0,
      total_trades: 0,
      gross_profit: 0,
      total_fees: 0,
    };
  }

  // Calculate REAL realized PnL using average-entry accounting
  const pnlResult = calculateRealizedPnL(learnableTrades, startingCapital);
  
  // Calculate daily RETURNS (not raw PnL) for Sharpe
  const dailyPnLArray = Array.from(pnlResult.dailyPnL.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));
  
  // Convert to returns: daily_pnl / equity_at_start_of_day
  let runningEquity = startingCapital;
  const dailyReturns: number[] = [];
  let profitableDays = 0;
  
  for (const [, pnl] of dailyPnLArray) {
    if (runningEquity > 0) {
      dailyReturns.push(pnl / runningEquity);
    }
    if (pnl > 0) profitableDays++;
    runningEquity += pnl;
  }

  const totalDays = dailyPnLArray.length;
  
  // Trades per day calculation
  const firstTrade = learnableTrades[0];
  const lastTrade = learnableTrades[learnableTrades.length - 1];
  const firstDate = new Date(firstTrade.filled_at);
  const lastDate = new Date(lastTrade.filled_at);
  const daySpan = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
  const tradesPerDay = learnableTrades.length / daySpan;

  // Calculate components
  const normalizedPnl = normalizePnL(pnlResult.realizedPnl);
  const sharpe = calculateSharpe(dailyReturns);
  const profitableDaysRatio = totalDays > 0 ? profitableDays / totalDays : 0;
  const maxDrawdown = calculateMaxDrawdown(pnlResult.equityCurve);
  const overtradingPenalty = calculateOvertradingPenalty(
    pnlResult.totalFees, 
    pnlResult.grossProfit, 
    tradesPerDay
  );

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
    realized_pnl: pnlResult.realizedPnl,
    total_trades: learnableTrades.length,
    gross_profit: pnlResult.grossProfit,
    total_fees: pnlResult.totalFees,
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

    // 2. Get paper account for starting capital
    const { data: paperAccount } = await supabase
      .from('paper_accounts')
      .select('id, starting_cash')
      .limit(1)
      .single();

    const startingCapital = paperAccount?.starting_cash ?? 1000;
    console.log(`[fitness-calc] Using starting capital: $${startingCapital}`);

    // 3. Get all agents for this generation
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

    // 4. Get all filled paper orders
    // Filter test_mode using explicit JSON path extraction
    const { data: orders } = await supabase
      .from('paper_orders')
      .select('id, agent_id, symbol, side, filled_price, filled_qty, filled_at, tags')
      .eq('status', 'filled')
      .eq('generation_id', generationId);

    // Filter test_mode in JS for reliability (PostgREST JSON filtering can be brittle)
    const learnableOrders = (orders ?? []).filter(o => {
      const tags = o.tags as { test_mode?: boolean; entry_reason?: string[] } | null;
      return isLearnableTrade(tags);
    });

    console.log(`[fitness-calc] Found ${learnableOrders.length} learnable orders (filtered from ${orders?.length ?? 0}) for ${agents.length} agents`);

    // 5. Get fills for fee data
    const orderIds = learnableOrders.map(o => o.id);
    const { data: fills } = orderIds.length > 0 
      ? await supabase.from('paper_fills').select('order_id, fee').in('order_id', orderIds)
      : { data: [] };

    // Map fees to orders
    const feeByOrder = new Map<string, number>();
    for (const fill of fills ?? []) {
      feeByOrder.set(fill.order_id, (feeByOrder.get(fill.order_id) ?? 0) + fill.fee);
    }

    // 6. Group orders by agent with fees
    const ordersByAgent = new Map<string, TradeRecord[]>();
    for (const order of learnableOrders) {
      if (!order.agent_id) continue;
      
      const agentOrders = ordersByAgent.get(order.agent_id) ?? [];
      agentOrders.push({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        filled_price: order.filled_price ?? 0,
        filled_qty: order.filled_qty ?? 0,
        fee: feeByOrder.get(order.id) ?? 0,
        filled_at: order.filled_at ?? '',
        tags: order.tags as TradeRecord['tags'],
      });
      ordersByAgent.set(order.agent_id, agentOrders);
    }

    // 7. Calculate fitness for each agent and upsert to performance table
    const results: { agent_id: string; fitness: FitnessComponents }[] = [];
    
    for (const agent of agents) {
      const agentTrades = ordersByAgent.get(agent.id) ?? [];
      const fitness = calculateFitness(agentTrades, startingCapital);
      
      results.push({ agent_id: agent.id, fitness });

      // Upsert performance record
      const { error: upsertError } = await supabase
        .from('performance')
        .upsert({
          agent_id: agent.id,
          generation_id: generationId,
          fitness_score: fitness.fitness_score,
          net_pnl: fitness.realized_pnl,
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

    // 8. Log to control_events
    const topAgents = results
      .filter(r => r.fitness.total_trades > 0)
      .sort((a, b) => b.fitness.fitness_score - a.fitness.fitness_score)
      .slice(0, 5);

    await supabase.from('control_events').insert({
      action: 'fitness_calculated',
      metadata: {
        generation_id: generationId,
        starting_capital: startingCapital,
        agents_processed: agents.length,
        agents_with_trades: results.filter(r => r.fitness.total_trades > 0).length,
        trades_analyzed: learnableOrders.length,
        top_agents: topAgents.map(r => ({
          agent_id: r.agent_id.substring(0, 8),
          score: r.fitness.fitness_score.toFixed(4),
          pnl: r.fitness.realized_pnl.toFixed(2),
          trades: r.fitness.total_trades,
          sharpe: r.fitness.sharpe_ratio.toFixed(2),
          drawdown: (r.fitness.max_drawdown * 100).toFixed(1) + '%',
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
        agents_with_trades: results.filter(r => r.fitness.total_trades > 0).length,
        trades_analyzed: learnableOrders.length,
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
