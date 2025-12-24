import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Shadow trade outcome calculation
// Runs periodically to calculate simulated PnL for pending shadow trades

interface ShadowTrade {
  id: string;
  agent_id: string;
  generation_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entry_time: string;
  entry_price: number;
  intended_qty: number;
  confidence: number;
  stop_price: number | null;
  target_price: number | null;
  trailing_stop_pct: number | null;
  regime: string;
  outcome_status: string;
}

interface MarketData {
  symbol: string;
  price: number;
  updated_at: string;
}

// Configuration
const CONFIG = {
  // Time limits for outcome calculation
  min_hold_minutes: 30,        // Minimum time before calculating outcome
  max_hold_hours: 24,          // Maximum time to track (expire if no exit signal)
  
  // Batch processing
  batch_size: 50,              // Process up to 50 shadow trades per run
};

// Calculate shadow trade outcome based on current price vs entry/stop/target
function calculateOutcome(
  trade: ShadowTrade,
  currentPrice: number,
  elapsedMinutes: number
): {
  shouldClose: boolean;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  hitStop: boolean;
  hitTarget: boolean;
  reason: string;
} {
  const entryPrice = trade.entry_price;
  const stopPrice = trade.stop_price;
  const targetPrice = trade.target_price;
  const isBuy = trade.side === 'BUY';
  
  // Calculate current PnL
  const priceDelta = currentPrice - entryPrice;
  const pnlPct = isBuy 
    ? (priceDelta / entryPrice) * 100 
    : (-priceDelta / entryPrice) * 100;
  const pnl = trade.intended_qty * (isBuy ? priceDelta : -priceDelta);
  
  // Check stop loss
  if (stopPrice) {
    const stopHit = isBuy 
      ? currentPrice <= stopPrice 
      : currentPrice >= stopPrice;
    
    if (stopHit) {
      const stopPnl = trade.intended_qty * (isBuy 
        ? (stopPrice - entryPrice) 
        : (entryPrice - stopPrice));
      const stopPnlPct = isBuy 
        ? ((stopPrice - entryPrice) / entryPrice) * 100 
        : ((entryPrice - stopPrice) / entryPrice) * 100;
      
      return {
        shouldClose: true,
        exitPrice: stopPrice,
        pnl: stopPnl,
        pnlPct: stopPnlPct,
        hitStop: true,
        hitTarget: false,
        reason: 'stop_loss_hit',
      };
    }
  }
  
  // Check take profit target
  if (targetPrice) {
    const targetHit = isBuy 
      ? currentPrice >= targetPrice 
      : currentPrice <= targetPrice;
    
    if (targetHit) {
      const targetPnl = trade.intended_qty * (isBuy 
        ? (targetPrice - entryPrice) 
        : (entryPrice - targetPrice));
      const targetPnlPct = isBuy 
        ? ((targetPrice - entryPrice) / entryPrice) * 100 
        : ((entryPrice - targetPrice) / entryPrice) * 100;
      
      return {
        shouldClose: true,
        exitPrice: targetPrice,
        pnl: targetPnl,
        pnlPct: targetPnlPct,
        hitStop: false,
        hitTarget: true,
        reason: 'target_hit',
      };
    }
  }
  
  // Check max hold time expiry
  if (elapsedMinutes >= CONFIG.max_hold_hours * 60) {
    return {
      shouldClose: true,
      exitPrice: currentPrice,
      pnl,
      pnlPct,
      hitStop: false,
      hitTarget: false,
      reason: 'time_expired',
    };
  }
  
  // Still pending
  return {
    shouldClose: false,
    exitPrice: currentPrice,
    pnl,
    pnlPct,
    hitStop: false,
    hitTarget: false,
    reason: 'pending',
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
  console.log('[shadow-outcome-calc] Starting calculation run');

  try {
    // 1. Get pending shadow trades that are old enough
    const minHoldTime = new Date(Date.now() - CONFIG.min_hold_minutes * 60 * 1000).toISOString();
    
    const { data: pendingTrades, error: tradesError } = await supabase
      .from('shadow_trades')
      .select('*')
      .eq('outcome_status', 'pending')
      .lt('entry_time', minHoldTime)
      .order('entry_time', { ascending: true })
      .limit(CONFIG.batch_size);
    
    if (tradesError) {
      console.error('[shadow-outcome-calc] Failed to fetch pending trades:', tradesError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to fetch pending trades' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!pendingTrades || pendingTrades.length === 0) {
      console.log('[shadow-outcome-calc] No pending shadow trades to process');
      return new Response(
        JSON.stringify({ ok: true, processed: 0, reason: 'no_pending_trades' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[shadow-outcome-calc] Processing ${pendingTrades.length} pending shadow trades`);
    
    // 2. Get unique symbols and fetch current market data
    const symbols = [...new Set(pendingTrades.map(t => t.symbol))];
    
    const { data: marketData, error: marketError } = await supabase
      .from('market_data')
      .select('symbol, price, updated_at')
      .in('symbol', symbols);
    
    if (marketError) {
      console.error('[shadow-outcome-calc] Failed to fetch market data:', marketError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to fetch market data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const marketBySymbol = new Map<string, MarketData>();
    for (const m of marketData ?? []) {
      marketBySymbol.set(m.symbol, m as MarketData);
    }
    
    // 3. Process each trade
    const now = new Date();
    const results = {
      calculated: 0,
      expired: 0,
      skipped: 0,
      errors: 0,
    };
    
    for (const trade of pendingTrades as ShadowTrade[]) {
      const market = marketBySymbol.get(trade.symbol);
      
      // Skip if no market data
      if (!market) {
        console.log(`[shadow-outcome-calc] No market data for ${trade.symbol}, skipping`);
        results.skipped++;
        continue;
      }
      
      // Check if market data is stale (> 5 minutes old)
      const marketAge = (now.getTime() - new Date(market.updated_at).getTime()) / 60000;
      if (marketAge > 5) {
        console.log(`[shadow-outcome-calc] Market data stale for ${trade.symbol} (${marketAge.toFixed(0)}m), skipping`);
        results.skipped++;
        continue;
      }
      
      // Calculate elapsed time since entry
      const elapsedMs = now.getTime() - new Date(trade.entry_time).getTime();
      const elapsedMinutes = elapsedMs / 60000;
      
      // Calculate outcome
      const outcome = calculateOutcome(trade, market.price, elapsedMinutes);
      
      // Update if should close
      if (outcome.shouldClose) {
        const { error: updateError } = await supabase
          .from('shadow_trades')
          .update({
            outcome_calculated_at: now.toISOString(),
            exit_time: now.toISOString(),
            exit_price: outcome.exitPrice,
            simulated_pnl: outcome.pnl,
            simulated_pnl_pct: outcome.pnlPct,
            hit_stop: outcome.hitStop,
            hit_target: outcome.hitTarget,
            outcome_status: 'calculated',
          })
          .eq('id', trade.id);
        
        if (updateError) {
          console.error(`[shadow-outcome-calc] Failed to update trade ${trade.id}:`, updateError);
          results.errors++;
        } else {
          console.log(`[shadow-outcome-calc] ${trade.symbol} ${trade.side}: ${outcome.reason} | PnL: ${outcome.pnlPct.toFixed(2)}%`);
          
          if (outcome.reason === 'time_expired') {
            results.expired++;
          } else {
            results.calculated++;
          }
        }
      }
    }
    
    // 4. Log summary event
    await supabase.from('control_events').insert({
      action: 'shadow_outcome_calc',
      metadata: {
        processed: pendingTrades.length,
        calculated: results.calculated,
        expired: results.expired,
        skipped: results.skipped,
        errors: results.errors,
        duration_ms: Date.now() - startTime,
      },
    });
    
    console.log(`[shadow-outcome-calc] Complete: calculated=${results.calculated}, expired=${results.expired}, skipped=${results.skipped}, errors=${results.errors}`);
    
    return new Response(
      JSON.stringify({
        ok: true,
        processed: pendingTrades.length,
        results,
        duration_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[shadow-outcome-calc] Unexpected error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
