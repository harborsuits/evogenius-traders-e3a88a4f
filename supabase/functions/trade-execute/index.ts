import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TradeTags {
  strategy_template?: string;
  regime_at_entry?: string;
  entry_reason?: string[];
  confidence?: number;
  pattern_id?: string;
  market_snapshot?: Record<string, unknown>;
}

interface ExecuteTradeRequest {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  orderType?: 'market' | 'limit';
  limitPrice?: number;
  agentId?: string;
  generationId?: string;
  bypassGates?: boolean;
  tags?: TradeTags;
}

type BlockReason = 
  | 'BLOCKED_SYSTEM_STOPPED'
  | 'BLOCKED_SYSTEM_PAUSED'
  | 'BLOCKED_STALE_MARKET_DATA'
  | 'BLOCKED_DEAD_MARKET_DATA'
  | 'BLOCKED_INVALID_SYMBOL'
  | 'BLOCKED_LIVE_NOT_ARMED'
  | 'BLOCKED_INVALID_QTY'
  | 'BLOCKED_AGENT_RATE_LIMIT'
  | 'BLOCKED_SYMBOL_RATE_LIMIT';

const ALLOWED_SYMBOLS = ['BTC-USD', 'ETH-USD'];
const MAX_MARKET_AGE_SECONDS = 120;
const MAX_TRADES_PER_AGENT_PER_DAY = 5;
const MAX_TRADES_PER_SYMBOL_PER_DAY = 50;

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
        generation_id: body.generationId,
        mode: 'paper',
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
        generation_id: body.generationId,
        mode: 'paper',
      });

      return new Response(
        JSON.stringify({ ok: false, blocked: true, reason }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === Get system state (including generation_id - server-side source of truth) ===
    const { data: systemState, error: stateError } = await supabase
      .from('system_state')
      .select('trade_mode, status, current_generation_id, live_armed_until')
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
    const liveArmedUntil = systemState?.live_armed_until;
    // CRITICAL: Use server-side generation_id, not client-provided (security + correctness)
    const generationId = systemState?.current_generation_id;
    console.log('[trade-execute] System state:', { tradeMode, systemStatus, generationId, liveArmedUntil });

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
        generation_id: body.generationId,
        mode: 'paper',
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
        generation_id: body.generationId,
        mode: 'paper',
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
        generation_id: body.generationId,
        mode: 'paper',
      });

      return new Response(
        JSON.stringify({ ok: false, blocked: true, reason }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

      const ageSeconds = (Date.now() - new Date(marketData.updated_at).getTime()) / 1000;
      console.log(`[trade-execute] Market data age: ${ageSeconds.toFixed(1)}s`);

      if (ageSeconds > MAX_MARKET_AGE_SECONDS) {
        const reason: BlockReason = ageSeconds > 300 ? 'BLOCKED_DEAD_MARKET_DATA' : 'BLOCKED_STALE_MARKET_DATA';
        console.log(`[trade-execute] ${reason}: ${ageSeconds.toFixed(1)}s old`);
        
        await logDecision(supabase, 'trade_blocked', {
          symbol: body.symbol,
          side: body.side,
          qty: body.qty,
          block_reason: reason,
          market_age_seconds: Math.floor(ageSeconds),
          agent_id: body.agentId,
          generation_id: body.generationId,
          mode: 'paper',
        });

        return new Response(
          JSON.stringify({ ok: false, blocked: true, reason }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // === GATE 5: Rate limits (per-agent and per-symbol) ===
    if (!body.bypassGates) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Check agent rate limit
      if (body.agentId) {
        const { count: agentTradeCount } = await supabase
          .from('paper_orders')
          .select('*', { count: 'exact', head: true })
          .eq('agent_id', body.agentId)
          .gte('created_at', todayStart.toISOString())
          .eq('status', 'filled');

        if ((agentTradeCount ?? 0) >= MAX_TRADES_PER_AGENT_PER_DAY) {
          const reason: BlockReason = 'BLOCKED_AGENT_RATE_LIMIT';
          console.log(`[trade-execute] ${reason}: agent ${body.agentId} has ${agentTradeCount} trades today`);
          
          await logDecision(supabase, 'trade_blocked', {
            symbol: body.symbol,
            side: body.side,
            qty: body.qty,
            block_reason: reason,
            trades_today: agentTradeCount,
            max_allowed: MAX_TRADES_PER_AGENT_PER_DAY,
            agent_id: body.agentId,
            generation_id: body.generationId,
            mode: 'paper',
          });

          return new Response(
            JSON.stringify({ ok: false, blocked: true, reason }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Check symbol rate limit
      const { count: symbolTradeCount } = await supabase
        .from('paper_orders')
        .select('*', { count: 'exact', head: true })
        .eq('symbol', body.symbol)
        .gte('created_at', todayStart.toISOString())
        .eq('status', 'filled');

      if ((symbolTradeCount ?? 0) >= MAX_TRADES_PER_SYMBOL_PER_DAY) {
        const reason: BlockReason = 'BLOCKED_SYMBOL_RATE_LIMIT';
        console.log(`[trade-execute] ${reason}: ${body.symbol} has ${symbolTradeCount} trades today`);
        
        await logDecision(supabase, 'trade_blocked', {
          symbol: body.symbol,
          side: body.side,
          qty: body.qty,
          block_reason: reason,
          trades_today: symbolTradeCount,
          max_allowed: MAX_TRADES_PER_SYMBOL_PER_DAY,
          agent_id: body.agentId,
          generation_id: body.generationId,
          mode: 'paper',
        });

        return new Response(
          JSON.stringify({ ok: false, blocked: true, reason }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // === GATE 6: Live mode requires explicit arm (timestamp-based) ===
    if (tradeMode === 'live') {
      const isArmed = liveArmedUntil && new Date(liveArmedUntil) > new Date();
      
      if (!isArmed) {
        const reason: BlockReason = 'BLOCKED_LIVE_NOT_ARMED';
        console.log(`[trade-execute] ${reason}: liveArmedUntil=${liveArmedUntil}, now=${new Date().toISOString()}`);
        
        await logDecision(supabase, 'trade_blocked', {
          symbol: body.symbol,
          side: body.side,
          qty: body.qty,
          block_reason: reason,
          live_armed_until: liveArmedUntil,
          agent_id: body.agentId,
          generation_id: generationId,
          mode: 'live',
        });

        return new Response(
          JSON.stringify({ 
            ok: false, 
            blocked: true,
            reason,
            error: 'Live trading requires ARM. ARM has expired or was never enabled.',
            mode: 'live',
            armed_until: liveArmedUntil,
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Live is armed - but we still don't execute live trades yet (future implementation)
      console.log(`[trade-execute] Live mode is armed until ${liveArmedUntil}, but live execution not implemented yet`);
      
      await logDecision(supabase, 'trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: 'LIVE_NOT_IMPLEMENTED',
        live_armed_until: liveArmedUntil,
        agent_id: body.agentId,
        generation_id: generationId,
        mode: 'live',
      });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          blocked: true,
          reason: 'LIVE_NOT_IMPLEMENTED',
          error: 'Live execution is armed but not yet implemented. Use paper mode.',
          mode: 'live',
          armed: true,
        }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        // CRITICAL: Use server-side generation_id, not client-provided
        generationId: generationId,
        tags: body.tags,
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
