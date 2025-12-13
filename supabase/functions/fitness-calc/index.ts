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
  diversity_penalty: number;
  fitness_score: number;
  realized_pnl: number;
  total_trades: number;
  gross_profit: number;
  total_fees: number;
  symbols_traded: number;
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
// SYMBOL DIVERSITY PENALTY (PREVENT COIN FIXATION)
// ===========================================================================
// Penalizes agents that trade only one symbol when multiple are available.
// This prevents agents from getting stuck on BTC or ETH and missing opportunities.
// ===========================================================================
function calculateDiversityPenalty(
  trades: TradeRecord[],
  availableSymbols: number = 2  // BTC-USD and ETH-USD
): number {
  if (trades.length === 0) return 0;
  
  const uniqueSymbols = new Set(trades.map(t => t.symbol)).size;
  const diversityRatio = uniqueSymbols / availableSymbols;
  
  // No penalty if trading both symbols
  if (diversityRatio >= 1) return 0;
  
  // Light penalty for single-symbol fixation (max 0.1)
  // Only applies after sufficient sample size (10+ trades)
  if (trades.length < 10) return 0;
  
  return (1 - diversityRatio) * 0.1;
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
      diversity_penalty: 0,
      fitness_score: 0,
      realized_pnl: 0,
      total_trades: 0,
      gross_profit: 0,
      total_fees: 0,
      symbols_traded: 0,
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
  const diversityPenalty = calculateDiversityPenalty(learnableTrades);
  const symbolsTraded = new Set(learnableTrades.map(t => t.symbol)).size;

  // === FITNESS FORMULA ===
  // Normalize sharpe to 0..1 range for weighting (sharpe of 2 = excellent)
  const normalizedSharpe = (sharpe + 3) / 6; // Maps -3..3 to 0..1
  
  // Base fitness calculation
  let fitnessScore = 
    (normalizedPnl * 0.35) +
    (normalizedSharpe * 0.25) +
    (profitableDaysRatio * 0.15) -
    (maxDrawdown * 0.15) -
    (overtradingPenalty * 0.10) -
    (diversityPenalty);  // Up to -0.1 for single-symbol fixation

  // MINIMUM TRADES GATE: Penalize agents with insufficient sample size
  // Prevents lucky 1-2 trade agents from ranking high in selection
  const MIN_TRADES_FOR_FULL_FITNESS = 10;
  if (learnableTrades.length < MIN_TRADES_FOR_FULL_FITNESS) {
    const samplePenalty = 0.5 * (1 - learnableTrades.length / MIN_TRADES_FOR_FULL_FITNESS);
    fitnessScore *= (1 - samplePenalty);  // Up to 50% reduction for 0 trades
  }

  return {
    normalized_pnl: normalizedPnl,
    sharpe_ratio: sharpe,
    profitable_days_ratio: profitableDaysRatio,
    max_drawdown: maxDrawdown,
    overtrading_penalty: overtradingPenalty,
    diversity_penalty: diversityPenalty,
    fitness_score: fitnessScore,
    realized_pnl: pnlResult.realizedPnl,
    total_trades: learnableTrades.length,
    gross_profit: pnlResult.grossProfit,
    total_fees: pnlResult.totalFees,
    symbols_traded: symbolsTraded,
  };
}

// ===========================================================================
// GENERATION END DETECTION
// ===========================================================================
// Checks if generation should end based on:
// 1. Time-based: 7 days elapsed
// 2. Trade-based: 100 learnable trades
// 3. Risk-based: 15% max drawdown
// ===========================================================================

const PLACEHOLDER_ID = '11111111-1111-1111-1111-111111111111';
const GENERATION_TIME_LIMIT_DAYS = 7;
const GENERATION_TRADE_LIMIT = 100;
const GENERATION_DRAWDOWN_LIMIT = 0.15;

interface GenerationEndCheck {
  should_end: boolean;
  reason: 'time' | 'trades' | 'drawdown' | null;
  details: {
    elapsed_days: number;
    trade_count: number;
    max_drawdown: number;
  };
}

function checkGenerationEnd(
  startTime: string,
  tradeCount: number,
  maxDrawdown: number
): GenerationEndCheck {
  const elapsedMs = Date.now() - new Date(startTime).getTime();
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  const details = {
    elapsed_days: elapsedDays,
    trade_count: tradeCount,
    max_drawdown: maxDrawdown,
  };

  // Check time limit (7 days)
  if (elapsedDays >= GENERATION_TIME_LIMIT_DAYS) {
    return { should_end: true, reason: 'time', details };
  }

  // Check trade limit (100 trades)
  if (tradeCount >= GENERATION_TRADE_LIMIT) {
    return { should_end: true, reason: 'trades', details };
  }

  // Check drawdown limit (15%)
  if (maxDrawdown >= GENERATION_DRAWDOWN_LIMIT) {
    return { should_end: true, reason: 'drawdown', details };
  }

  return { should_end: false, reason: null, details };
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
    
    // Check for placeholder or missing generation
    if (!generationId || generationId === PLACEHOLDER_ID) {
      console.log('[fitness-calc] No valid generation (placeholder or missing)');
      
      // Log warning event
      await supabase.from('control_events').insert({
        action: 'generation_missing',
        metadata: { 
          current_id: generationId,
          message: 'Fitness calc skipped - no valid generation. Use "Start Generation" to begin.'
        },
      });

      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no_valid_generation' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get generation details for end detection
    const { data: generation } = await supabase
      .from('generations')
      .select('id, generation_number, is_active, start_time')
      .eq('id', generationId)
      .single();

    if (!generation || !generation.is_active) {
      console.log('[fitness-calc] Generation not active');
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'generation_not_active' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Get paper account for starting capital
    const { data: paperAccount } = await supabase
      .from('paper_accounts')
      .select('id, starting_cash')
      .limit(1)
      .single();

    const startingCapital = paperAccount?.starting_cash ?? 1000;
    console.log(`[fitness-calc] Using starting capital: $${startingCapital}`);

    // 4. Get all agents for this generation
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

    // 5. Get all filled paper orders
    const { data: orders } = await supabase
      .from('paper_orders')
      .select('id, agent_id, symbol, side, filled_price, filled_qty, filled_at, tags')
      .eq('status', 'filled')
      .eq('generation_id', generationId);

    // Filter test_mode in JS for reliability
    const learnableOrders = (orders ?? []).filter(o => {
      const tags = o.tags as { test_mode?: boolean; entry_reason?: string[] } | null;
      return isLearnableTrade(tags);
    });

    console.log(`[fitness-calc] Found ${learnableOrders.length} learnable orders (filtered from ${orders?.length ?? 0}) for ${agents.length} agents`);

    // 6. Get fills for fee data
    const orderIds = learnableOrders.map(o => o.id);
    const { data: fills } = orderIds.length > 0 
      ? await supabase.from('paper_fills').select('order_id, fee').in('order_id', orderIds)
      : { data: [] };

    // Map fees to orders
    const feeByOrder = new Map<string, number>();
    for (const fill of fills ?? []) {
      feeByOrder.set(fill.order_id, (feeByOrder.get(fill.order_id) ?? 0) + fill.fee);
    }

    // 7. Group orders by agent with fees + build ACCOUNT-LEVEL equity curve for drawdown
    const ordersByAgent = new Map<string, TradeRecord[]>();
    const allTradesForAccount: TradeRecord[] = []; // For account-level drawdown
    
    for (const order of learnableOrders) {
      // Add to account-level list (for drawdown)
      allTradesForAccount.push({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        filled_price: order.filled_price ?? 0,
        filled_qty: order.filled_qty ?? 0,
        fee: feeByOrder.get(order.id) ?? 0,
        filled_at: order.filled_at ?? '',
        tags: order.tags as TradeRecord['tags'],
      });
      
      // Add to per-agent list (for individual fitness)
      if (order.agent_id) {
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
    }

    // 8. Calculate ACCOUNT-LEVEL drawdown (for generation stop-loss)
    // This is the true risk metric since agents share a single paper account
    const accountPnlResult = calculateRealizedPnL(allTradesForAccount, startingCapital);
    const accountLevelDrawdown = calculateMaxDrawdown(accountPnlResult.equityCurve);
    console.log(`[fitness-calc] Account-level drawdown: ${(accountLevelDrawdown * 100).toFixed(2)}%`);

    // 9. Calculate fitness for each agent
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

    // 10. CHECK GENERATION END CONDITIONS (using ACCOUNT-LEVEL drawdown)
    const endCheck = checkGenerationEnd(
      generation.start_time,
      learnableOrders.length,  // order_count, not round-trips
      accountLevelDrawdown     // account-level, not per-agent max
    );

    let newGenerationId: string | null = null;
    let liquidatedPositions: { symbol: string; qty: number; price: number }[] = [];
    
    if (endCheck.should_end && endCheck.reason) {
      console.log(`[fitness-calc] Generation ${generation.generation_number} ending: ${endCheck.reason}`);
      
      // =========================================================================
      // FORCED LIQUIDATION - CRITICAL FOR CLEAN GENERATION BOUNDARIES
      // =========================================================================
      // All open positions must be closed BEFORE fitness is finalized
      // and BEFORE new generation starts. This ensures:
      // 1. Fitness attribution is correct (no leaking to next gen)
      // 2. New generation starts with clean slate
      // =========================================================================
      
      const { data: openPositions } = await supabase
        .from('paper_positions')
        .select('id, symbol, qty, avg_entry_price, account_id')
        .neq('qty', 0);
      
      if (openPositions && openPositions.length > 0) {
        console.log(`[fitness-calc] Force liquidating ${openPositions.length} open positions`);
        
        for (const pos of openPositions) {
          // Get current market price for liquidation
          const { data: marketData } = await supabase
            .from('market_data')
            .select('price')
            .eq('symbol', pos.symbol)
            .limit(1)
            .single();
          
          const liquidationPrice = marketData?.price ?? pos.avg_entry_price;
          
          // Create liquidation order with special tags
          const { data: liqOrder } = await supabase
            .from('paper_orders')
            .insert({
              account_id: pos.account_id,
              generation_id: generationId,
              symbol: pos.symbol,
              side: 'sell',
              order_type: 'market',
              qty: pos.qty,
              status: 'filled',
              filled_price: liquidationPrice,
              filled_qty: pos.qty,
              filled_at: new Date().toISOString(),
              tags: {
                exit_reason: 'generation_rollover',
                forced: true,
                liquidation: true,
                generation_end_reason: endCheck.reason,
              },
            })
            .select()
            .single();
          
          if (liqOrder) {
            // Create fill record
            const fee = pos.qty * liquidationPrice * 0.006;
            await supabase.from('paper_fills').insert({
              order_id: liqOrder.id,
              symbol: pos.symbol,
              side: 'sell',
              qty: pos.qty,
              price: liquidationPrice,
              fee,
            });
            
            // Calculate realized PnL and update account cash
            const realizedPnl = (liquidationPrice - pos.avg_entry_price) * pos.qty - fee;
            
            const { data: account } = await supabase
              .from('paper_accounts')
              .select('cash')
              .eq('id', pos.account_id)
              .single();
            
            if (account) {
              await supabase
                .from('paper_accounts')
                .update({
                  cash: account.cash + (pos.qty * liquidationPrice) - fee,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', pos.account_id);
            }
            
            // Delete the position
            await supabase
              .from('paper_positions')
              .delete()
              .eq('id', pos.id);
            
            liquidatedPositions.push({
              symbol: pos.symbol,
              qty: pos.qty,
              price: liquidationPrice,
            });
            
            console.log(`[fitness-calc] Liquidated ${pos.qty} ${pos.symbol} @ $${liquidationPrice} (PnL: $${realizedPnl.toFixed(2)})`);
          }
        }
        
        // Log liquidation event
        await supabase.from('control_events').insert({
          action: 'generation_liquidation',
          metadata: {
            generation_id: generationId,
            generation_number: generation.generation_number,
            positions_closed: liquidatedPositions.length,
            positions: liquidatedPositions,
          },
        });
      }
      
      // =========================================================================
      // NOW END GENERATION (after liquidation, fitness is finalized)
      // =========================================================================
      
      const { error: endError } = await supabase
        .rpc('end_generation', {
          gen_id: generationId,
          reason: endCheck.reason,
        });

      if (endError) {
        console.error('[fitness-calc] Failed to end generation:', endError);
      } else {
        console.log('[fitness-calc] Generation ended successfully');
        
        // Log generation end summary
        await supabase.from('control_events').insert({
          action: 'generation_summary',
          metadata: {
            generation_id: generationId,
            generation_number: generation.generation_number,
            termination_reason: endCheck.reason,
            details: endCheck.details,
            agents_with_trades: results.filter(r => r.fitness.total_trades > 0).length,
            total_trades: learnableOrders.length,
            positions_liquidated: liquidatedPositions.length,
            top_fitness: results.length > 0 
              ? Math.max(...results.map(r => r.fitness.fitness_score)).toFixed(4)
              : 0,
          },
        });

        // AUTO-START NEXT GENERATION
        console.log('[fitness-calc] Starting new generation before selection/breeding...');
        
        const { data: nextGenId, error: startError } = await supabase
          .rpc('start_new_generation');

        if (startError) {
          console.error('[fitness-calc] Failed to start next generation:', startError);
          await supabase.from('control_events').insert({
            action: 'generation_start_failed',
            metadata: { error: startError.message },
          });
        } else {
          newGenerationId = nextGenId;
          console.log('[fitness-calc] Next generation started:', nextGenId);
          
          // =========================================================================
          // SELECTION & BREEDING - THE EVOLUTION STEP
          // =========================================================================
          // Now that we have the new generation, run selection and breeding
          // to evolve the population based on fitness from ended generation
          // =========================================================================
          console.log('[fitness-calc] Running selection & breeding...');
          
          try {
            const selectionResponse = await fetch(
              `${Deno.env.get('SUPABASE_URL')}/functions/v1/selection-breeding`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                },
                body: JSON.stringify({
                  ended_generation_id: generationId,
                  new_generation_id: nextGenId,
                }),
              }
            );
            
            const selectionResult = await selectionResponse.json();
            
            if (selectionResult.ok) {
              console.log('[fitness-calc] Selection & breeding completed:', selectionResult);
            } else {
              console.error('[fitness-calc] Selection & breeding failed:', selectionResult.error);
              await supabase.from('control_events').insert({
                action: 'selection_breeding_failed',
                metadata: { error: selectionResult.error, generation_id: nextGenId },
              });
            }
          } catch (selectionError) {
            console.error('[fitness-calc] Selection & breeding error:', selectionError);
            await supabase.from('control_events').insert({
              action: 'selection_breeding_failed',
              metadata: { 
                error: selectionError instanceof Error ? selectionError.message : 'Unknown error',
                generation_id: nextGenId,
              },
            });
          }
        }
      }
    }

    // 10. Log fitness calculation event
    const topAgents = results
      .filter(r => r.fitness.total_trades > 0)
      .sort((a, b) => b.fitness.fitness_score - a.fitness.fitness_score)
      .slice(0, 5);

    await supabase.from('control_events').insert({
      action: 'fitness_calculated',
      metadata: {
        generation_id: generationId,
        generation_number: generation.generation_number,
        starting_capital: startingCapital,
        agents_processed: agents.length,
        agents_with_trades: results.filter(r => r.fitness.total_trades > 0).length,
        trades_analyzed: learnableOrders.length,
        account_drawdown: (accountLevelDrawdown * 100).toFixed(2) + '%',
        generation_end_check: endCheck.should_end ? endCheck.reason : 'continuing',
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
        generation_number: generation.generation_number,
        agents_processed: agents.length,
        agents_with_trades: results.filter(r => r.fitness.total_trades > 0).length,
        trades_analyzed: learnableOrders.length,
        account_drawdown: accountLevelDrawdown,
        generation_ended: endCheck.should_end,
        end_reason: endCheck.reason,
        new_generation_id: newGenerationId,
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
