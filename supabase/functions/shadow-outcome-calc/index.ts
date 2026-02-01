import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Shadow trade outcome calculation
// Runs periodically to calculate simulated PnL for pending shadow trades
// NOTE: Uses mark-to-market only (no path-aware stop/target detection without candle data)

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

interface ShadowTradingConfig {
  enabled?: boolean;
  shadow_threshold?: number;
  max_per_cycle?: number;
  default_stop_pct?: number;
  default_target_pct?: number;
  default_trailing_pct?: number;
  max_hold_hours?: number;
  min_hold_minutes?: number;
}

// Default configuration (overridden by system_config)
const CONFIG_DEFAULTS = {
  min_hold_minutes: 30,        // Minimum time before calculating outcome
  max_hold_hours: 24,          // Maximum time to track (expire if no exit signal)
  batch_size: 50,              // Process up to 50 shadow trades per run
};

// Calculate shadow trade outcome using mark-to-market
// IMPORTANT: This is NOT path-aware - we cannot detect if stop/target was hit earlier
// Outcomes are labeled honestly as 'expired_mtm' (mark-to-market at expiry)
function calculateOutcome(
  trade: ShadowTrade,
  currentPrice: number,
  elapsedMinutes: number,
  maxHoldHours: number
): {
  shouldClose: boolean;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  hitStop: boolean;      // Note: only approximate (current price, not path)
  hitTarget: boolean;    // Note: only approximate (current price, not path)
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
  
  // Check if max hold time expired (primary expiry trigger)
  const maxHoldMinutes = maxHoldHours * 60;
  if (elapsedMinutes >= maxHoldMinutes) {
    // Determine approximate outcome based on current price vs stop/target
    // NOTE: These are APPROXIMATE - we don't know the price path, just the final price
    let approximateHitStop = false;
    let approximateHitTarget = false;
    
    if (stopPrice) {
      approximateHitStop = isBuy 
        ? currentPrice <= stopPrice 
        : currentPrice >= stopPrice;
    }
    
    if (targetPrice) {
      approximateHitTarget = isBuy 
        ? currentPrice >= targetPrice 
        : currentPrice <= targetPrice;
    }
    
    return {
      shouldClose: true,
      exitPrice: currentPrice,
      pnl,
      pnlPct,
      hitStop: approximateHitStop,
      hitTarget: approximateHitTarget,
      reason: 'expired_mtm', // Mark-to-market at expiry (honest label)
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
    // Load config from system_config
    const { data: configData } = await supabase
      .from('system_config')
      .select('config')
      .limit(1)
      .single();
    
    const systemConfig = (configData?.config ?? {}) as Record<string, unknown>;
    const shadowConfig = systemConfig.shadow_trading as ShadowTradingConfig | undefined;
    
    const minHoldMinutes = shadowConfig?.min_hold_minutes ?? CONFIG_DEFAULTS.min_hold_minutes;
    const maxHoldHours = shadowConfig?.max_hold_hours ?? CONFIG_DEFAULTS.max_hold_hours;
    const batchSize = CONFIG_DEFAULTS.batch_size;
    
    console.log(`[shadow-outcome-calc] Config: min_hold=${minHoldMinutes}m, max_hold=${maxHoldHours}h`);
    
    // Get current active generation for priority processing
    const { data: systemState } = await supabase
      .from('system_state')
      .select('current_generation_id')
      .limit(1)
      .single();
    
    const currentGenId = systemState?.current_generation_id;
    console.log(`[shadow-outcome-calc] Current generation: ${currentGenId}`);
    
    const minHoldTime = new Date(Date.now() - minHoldMinutes * 60 * 1000).toISOString();
    
    // SMART PRIORITY: First try current generation trades
    let pendingTrades: ShadowTrade[] = [];
    let tradeSource = 'backlog';
    
    if (currentGenId) {
      const { data: currentGenTrades, error: currentGenError } = await supabase
        .from('shadow_trades')
        .select('*')
        .eq('outcome_status', 'pending')
        .eq('generation_id', currentGenId)
        .lt('entry_time', minHoldTime)
        .order('entry_time', { ascending: true })
        .limit(batchSize);
      
      if (!currentGenError && currentGenTrades && currentGenTrades.length > 0) {
        pendingTrades = currentGenTrades as ShadowTrade[];
        tradeSource = 'current_gen';
        console.log(`[shadow-outcome-calc] PRIORITY: Found ${pendingTrades.length} trades from current generation`);
      }
    }
    
    // If no current gen trades, fall back to oldest pending (backlog)
    if (pendingTrades.length === 0) {
      const { data: backlogTrades, error: backlogError } = await supabase
        .from('shadow_trades')
        .select('*')
        .eq('outcome_status', 'pending')
        .lt('entry_time', minHoldTime)
        .order('entry_time', { ascending: true })
        .limit(batchSize);
      
      if (backlogError) {
        console.error('[shadow-outcome-calc] Failed to fetch pending trades:', backlogError);
        return new Response(
          JSON.stringify({ ok: false, error: 'Failed to fetch pending trades' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      pendingTrades = (backlogTrades ?? []) as ShadowTrade[];
      tradeSource = 'backlog';
    }
    
    if (pendingTrades.length === 0) {
      console.log('[shadow-outcome-calc] No pending shadow trades to process');
      return new Response(
        JSON.stringify({ ok: true, processed: 0, reason: 'no_pending_trades' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[shadow-outcome-calc] Processing ${pendingTrades.length} pending shadow trades (source: ${tradeSource})`);
    
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
      byReason: {} as Record<string, number>,
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
      const outcome = calculateOutcome(trade, market.price, elapsedMinutes, maxHoldHours);
      
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
          
          results.calculated++;
          results.byReason[outcome.reason] = (results.byReason[outcome.reason] ?? 0) + 1;
        }
      }
    }
    
    // 4. Log summary event
    await supabase.from('control_events').insert({
      action: 'shadow_outcome_calc',
      metadata: {
        processed: pendingTrades.length,
        source: tradeSource,
        calculated: results.calculated,
        skipped: results.skipped,
        errors: results.errors,
        by_reason: results.byReason,
        config: {
          min_hold_minutes: minHoldMinutes,
          max_hold_hours: maxHoldHours,
        },
        duration_ms: Date.now() - startTime,
      },
    });
    
    console.log(`[shadow-outcome-calc] Complete: source=${tradeSource}, calculated=${results.calculated}, skipped=${results.skipped}, errors=${results.errors}, reasons=${JSON.stringify(results.byReason)}`);
    
    return new Response(
      JSON.stringify({
        ok: true,
        processed: pendingTrades.length,
        source: tradeSource,
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
