import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExecuteTradeRequest {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  orderType?: 'market' | 'limit';
  limitPrice?: number;
  agentId?: string;
  generationId?: string;
}

interface RiskConfig {
  max_position_pct: number;
  max_trade_pct: number;
  slippage_min_pct: number;
  slippage_max_pct: number;
  fee_pct: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: ExecuteTradeRequest = await req.json();
    const { symbol, side, qty, orderType = 'market', limitPrice, agentId, generationId } = body;

    console.log('[paper-execute] Request:', { symbol, side, qty, orderType, agentId });

    // Validate required fields
    if (!symbol || !side || !qty || qty <= 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing required fields: symbol, side, qty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check trade mode
    const { data: systemState, error: stateError } = await supabase
      .from('system_state')
      .select('trade_mode, status')
      .limit(1)
      .single();

    if (stateError) {
      console.error('[paper-execute] Failed to get system state:', stateError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to get system state' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (systemState.trade_mode !== 'paper') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Not in paper mode. Use live execution.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (systemState.status === 'stopped') {
      return new Response(
        JSON.stringify({ ok: false, error: 'System is stopped. Cannot execute trades.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get paper account
    const { data: account, error: accountError } = await supabase
      .from('paper_accounts')
      .select('*')
      .limit(1)
      .single();

    if (accountError || !account) {
      console.error('[paper-execute] No paper account found:', accountError);
      return new Response(
        JSON.stringify({ ok: false, error: 'No paper account found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get risk config
    const { data: configData } = await supabase
      .from('system_config')
      .select('config')
      .limit(1)
      .single();

    const riskConfig: RiskConfig = configData?.config?.risk?.paper ?? {
      max_position_pct: 0.25,
      max_trade_pct: 0.10,
      slippage_min_pct: 0.001,
      slippage_max_pct: 0.005,
      fee_pct: 0.006,
    };

    // Get current market price
    const { data: marketData, error: marketError } = await supabase
      .from('market_data')
      .select('price')
      .eq('symbol', symbol)
      .limit(1)
      .single();

    if (marketError || !marketData) {
      console.error('[paper-execute] No market data for symbol:', symbol, marketError);
      
      // Create rejected order
      await supabase.from('paper_orders').insert({
        account_id: account.id,
        agent_id: agentId,
        generation_id: generationId,
        symbol,
        side,
        order_type: orderType,
        qty,
        limit_price: limitPrice,
        status: 'rejected',
        reason: `No market data for ${symbol}`,
      });

      return new Response(
        JSON.stringify({ ok: false, error: `No market data for ${symbol}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const basePrice = Number(marketData.price);
    const notional = qty * basePrice;
    const totalEquity = account.starting_cash; // Use starting_cash as reference for position sizing

    // Risk validation
    const maxTradeNotional = totalEquity * riskConfig.max_trade_pct;
    if (notional > maxTradeNotional) {
      const rejectReason = `Trade notional $${notional.toFixed(2)} exceeds max $${maxTradeNotional.toFixed(2)} (${riskConfig.max_trade_pct * 100}% of equity)`;
      console.log('[paper-execute] Rejected:', rejectReason);
      
      await supabase.from('paper_orders').insert({
        account_id: account.id,
        agent_id: agentId,
        generation_id: generationId,
        symbol,
        side,
        order_type: orderType,
        qty,
        limit_price: limitPrice,
        status: 'rejected',
        reason: rejectReason,
      });

      return new Response(
        JSON.stringify({ ok: false, error: rejectReason }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check position size limit for buys
    if (side === 'buy') {
      const { data: position } = await supabase
        .from('paper_positions')
        .select('qty, avg_entry_price')
        .eq('account_id', account.id)
        .eq('symbol', symbol)
        .limit(1)
        .single();

      const currentPositionValue = (position?.qty ?? 0) * basePrice;
      const newPositionValue = currentPositionValue + notional;
      const maxPositionValue = totalEquity * riskConfig.max_position_pct;

      if (newPositionValue > maxPositionValue) {
        const rejectReason = `Position would be $${newPositionValue.toFixed(2)}, exceeds max $${maxPositionValue.toFixed(2)} (${riskConfig.max_position_pct * 100}% of equity)`;
        console.log('[paper-execute] Rejected:', rejectReason);
        
        await supabase.from('paper_orders').insert({
          account_id: account.id,
          agent_id: agentId,
          generation_id: generationId,
          symbol,
          side,
          order_type: orderType,
          qty,
          limit_price: limitPrice,
          status: 'rejected',
          reason: rejectReason,
        });

        return new Response(
          JSON.stringify({ ok: false, error: rejectReason }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if we have enough cash
      const fee = notional * riskConfig.fee_pct;
      if (account.cash < notional + fee) {
        const rejectReason = `Insufficient cash: need $${(notional + fee).toFixed(2)}, have $${account.cash.toFixed(2)}`;
        console.log('[paper-execute] Rejected:', rejectReason);
        
        await supabase.from('paper_orders').insert({
          account_id: account.id,
          agent_id: agentId,
          generation_id: generationId,
          symbol,
          side,
          order_type: orderType,
          qty,
          limit_price: limitPrice,
          status: 'rejected',
          reason: rejectReason,
        });

        return new Response(
          JSON.stringify({ ok: false, error: rejectReason }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check position for sells
    if (side === 'sell') {
      const { data: position } = await supabase
        .from('paper_positions')
        .select('qty')
        .eq('account_id', account.id)
        .eq('symbol', symbol)
        .limit(1)
        .single();

      if (!position || position.qty < qty) {
        const rejectReason = `Insufficient position: need ${qty}, have ${position?.qty ?? 0}`;
        console.log('[paper-execute] Rejected:', rejectReason);
        
        await supabase.from('paper_orders').insert({
          account_id: account.id,
          agent_id: agentId,
          generation_id: generationId,
          symbol,
          side,
          order_type: orderType,
          qty,
          limit_price: limitPrice,
          status: 'rejected',
          reason: rejectReason,
        });

        return new Response(
          JSON.stringify({ ok: false, error: rejectReason }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Calculate slippage (0.1% to 0.5% based on config)
    const slippagePct = riskConfig.slippage_min_pct + 
      Math.random() * (riskConfig.slippage_max_pct - riskConfig.slippage_min_pct);
    
    // Slippage is unfavorable: higher for buys, lower for sells
    const slippageMultiplier = side === 'buy' ? (1 + slippagePct) : (1 - slippagePct);
    const fillPrice = basePrice * slippageMultiplier;
    const fillNotional = qty * fillPrice;
    const fee = fillNotional * riskConfig.fee_pct;

    console.log('[paper-execute] Filling order:', {
      basePrice,
      slippagePct: (slippagePct * 100).toFixed(3) + '%',
      fillPrice,
      fillNotional,
      fee,
    });

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('paper_orders')
      .insert({
        account_id: account.id,
        agent_id: agentId,
        generation_id: generationId,
        symbol,
        side,
        order_type: orderType,
        qty,
        limit_price: limitPrice,
        status: 'filled',
        filled_price: fillPrice,
        filled_qty: qty,
        slippage_pct: slippagePct,
        filled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      console.error('[paper-execute] Failed to create order:', orderError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to create order' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create fill record
    await supabase.from('paper_fills').insert({
      order_id: order.id,
      symbol,
      side,
      qty,
      price: fillPrice,
      fee,
    });

    // Update position
    const { data: existingPosition } = await supabase
      .from('paper_positions')
      .select('*')
      .eq('account_id', account.id)
      .eq('symbol', symbol)
      .limit(1)
      .single();

    if (side === 'buy') {
      if (existingPosition) {
        // Update existing position with new average
        const newQty = existingPosition.qty + qty;
        const newAvgPrice = (existingPosition.qty * existingPosition.avg_entry_price + qty * fillPrice) / newQty;
        
        await supabase
          .from('paper_positions')
          .update({
            qty: newQty,
            avg_entry_price: newAvgPrice,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPosition.id);
      } else {
        // Create new position
        await supabase.from('paper_positions').insert({
          account_id: account.id,
          symbol,
          qty,
          avg_entry_price: fillPrice,
        });
      }

      // Deduct cash
      await supabase
        .from('paper_accounts')
        .update({
          cash: account.cash - fillNotional - fee,
          updated_at: new Date().toISOString(),
        })
        .eq('id', account.id);

    } else {
      // Sell: calculate realized P&L
      const realizedPnl = (fillPrice - existingPosition.avg_entry_price) * qty - fee;
      const newQty = existingPosition.qty - qty;

      if (newQty <= 0) {
        // Close position entirely
        await supabase
          .from('paper_positions')
          .delete()
          .eq('id', existingPosition.id);
      } else {
        // Reduce position
        await supabase
          .from('paper_positions')
          .update({
            qty: newQty,
            realized_pnl: existingPosition.realized_pnl + realizedPnl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPosition.id);
      }

      // Add cash (proceeds minus fee)
      await supabase
        .from('paper_accounts')
        .update({
          cash: account.cash + fillNotional - fee,
          updated_at: new Date().toISOString(),
        })
        .eq('id', account.id);
    }

    // Also insert into trades table for unified logging (marked as paper)
    await supabase.from('trades').insert({
      agent_id: agentId,
      generation_id: generationId,
      symbol,
      side: side.toUpperCase(),
      intent_size: qty,
      fill_price: fillPrice,
      fill_size: qty,
      fees: fee,
      outcome: 'success',
      pnl: side === 'sell' ? (fillPrice - (existingPosition?.avg_entry_price ?? fillPrice)) * qty - fee : 0,
    });

    console.log('[paper-execute] Order filled successfully:', order.id);

    return new Response(
      JSON.stringify({
        ok: true,
        order: {
          id: order.id,
          symbol,
          side,
          qty,
          fillPrice,
          fee,
          slippagePct,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[paper-execute] Unexpected error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
