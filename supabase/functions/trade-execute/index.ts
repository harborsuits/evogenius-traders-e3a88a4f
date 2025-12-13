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
  bypassGates?: boolean;
}

type BlockReason = 
  | 'BLOCKED_SYSTEM_STOPPED'
  | 'BLOCKED_SYSTEM_PAUSED'
  | 'BLOCKED_STALE_MARKET_DATA'
  | 'BLOCKED_INVALID_SYMBOL'
  | 'BLOCKED_LIVE_NOT_ARMED'
  | 'BLOCKED_INVALID_QTY';

const ALLOWED_SYMBOLS = ['BTC-USD', 'ETH-USD'];
const MAX_MARKET_AGE_SECONDS = 120;

// deno-lint-ignore no-explicit-any
async function logDecision(
  supabase: any,
  action: string,
  metadata: Record<string, unknown>
) {
  try {
    await supabase.from('control_events').insert({
      action,
      metadata,
      triggered_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[trade-execute] Failed to log decision:', err);
  }
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
    console.log('[trade-execute] Received request:', body);

    // === GATE 1: Validate symbol ===
    if (!ALLOWED_SYMBOLS.includes(body.symbol)) {
      const reason: BlockReason = 'BLOCKED_INVALID_SYMBOL';
      console.log(`[trade-execute] ${reason}: ${body.symbol}`);
      
      await logDecision(supabase, 'trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: reason,
        agent_id: body.agentId,
      });

      return new Response(
        JSON.stringify({ ok: false, blocked: true, reason }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === GATE 2: Validate quantity ===
    if (!body.qty || body.qty <= 0) {
      const reason: BlockReason = 'BLOCKED_INVALID_QTY';
      console.log(`[trade-execute] ${reason}: ${body.qty}`);
      
      await logDecision(supabase, 'trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: reason,
        agent_id: body.agentId,
      });

      return new Response(
        JSON.stringify({ ok: false, blocked: true, reason }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === Get system state ===
    const { data: systemState, error: stateError } = await supabase
      .from('system_state')
      .select('trade_mode, status')
      .limit(1)
      .single();

    if (stateError) {
      console.error('[trade-execute] Failed to get system state:', stateError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to get system state' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tradeMode = systemState?.trade_mode ?? 'paper';
    const systemStatus = systemState?.status ?? 'stopped';
    console.log('[trade-execute] System state:', { tradeMode, systemStatus });

    // === GATE 3: System must be running (skip for manual trades) ===
    if (!body.bypassGates) {
      if (systemStatus === 'stopped') {
        const reason: BlockReason = 'BLOCKED_SYSTEM_STOPPED';
        console.log(`[trade-execute] ${reason}`);
        
        await logDecision(supabase, 'trade_blocked', {
          symbol: body.symbol,
          side: body.side,
          qty: body.qty,
          block_reason: reason,
          agent_id: body.agentId,
        });

        return new Response(
          JSON.stringify({ ok: false, blocked: true, reason }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (systemStatus === 'paused') {
        const reason: BlockReason = 'BLOCKED_SYSTEM_PAUSED';
        console.log(`[trade-execute] ${reason}`);
        
        await logDecision(supabase, 'trade_blocked', {
          symbol: body.symbol,
          side: body.side,
          qty: body.qty,
          block_reason: reason,
          agent_id: body.agentId,
        });

        return new Response(
          JSON.stringify({ ok: false, blocked: true, reason }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // === GATE 4: Market data must be fresh (skip for manual trades) ===
    if (!body.bypassGates) {
      const { data: marketData, error: marketError } = await supabase
        .from('market_data')
        .select('symbol, updated_at')
        .eq('symbol', body.symbol)
        .single();

      if (marketError || !marketData) {
        const reason: BlockReason = 'BLOCKED_STALE_MARKET_DATA';
        console.log(`[trade-execute] ${reason}: No market data for ${body.symbol}`);
        
        await logDecision(supabase, 'trade_blocked', {
          symbol: body.symbol,
          side: body.side,
          qty: body.qty,
          block_reason: reason,
          agent_id: body.agentId,
        });

        return new Response(
          JSON.stringify({ ok: false, blocked: true, reason }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const ageSeconds = (Date.now() - new Date(marketData.updated_at).getTime()) / 1000;
      console.log(`[trade-execute] Market data age: ${ageSeconds.toFixed(1)}s`);

      if (ageSeconds > MAX_MARKET_AGE_SECONDS) {
        const reason: BlockReason = 'BLOCKED_STALE_MARKET_DATA';
        console.log(`[trade-execute] ${reason}: ${ageSeconds.toFixed(1)}s old`);
        
        await logDecision(supabase, 'trade_blocked', {
          symbol: body.symbol,
          side: body.side,
          qty: body.qty,
          block_reason: `${reason} (${ageSeconds.toFixed(0)}s old)`,
          agent_id: body.agentId,
        });

        return new Response(
          JSON.stringify({ ok: false, blocked: true, reason }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // === GATE 5: Live mode requires explicit arm ===
    if (tradeMode === 'live') {
      const reason: BlockReason = 'BLOCKED_LIVE_NOT_ARMED';
      console.log(`[trade-execute] ${reason}`);
      
      await logDecision(supabase, 'trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: reason,
        agent_id: body.agentId,
      });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          blocked: true,
          reason,
          error: 'Live trading requires explicit arm. Switch to paper mode.',
          mode: 'live'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === ALL GATES PASSED - Execute in paper mode ===
    console.log('[trade-execute] All gates passed, forwarding to paper-execute');

    const paperUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/paper-execute`;
    
    const paperResponse = await fetch(paperUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        orderType: body.orderType,
        limitPrice: body.limitPrice,
        agentId: body.agentId,
        generationId: body.generationId,
      }),
    });

    const paperResult = await paperResponse.json();
    console.log('[trade-execute] Paper result:', paperResult);

    if (paperResult.ok) {
      await logDecision(supabase, 'trade_executed', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        fill_price: paperResult.order?.filled_price,
        order_id: paperResult.order?.id,
        agent_id: body.agentId,
        mode: 'paper',
      });
    }

    return new Response(
      JSON.stringify({ ...paperResult, mode: 'paper', gates_passed: true }),
      { 
        status: paperResponse.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[trade-execute] Unexpected error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
