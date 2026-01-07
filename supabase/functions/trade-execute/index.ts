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
  | 'BLOCKED_SYMBOL_RATE_LIMIT'
  | 'BLOCKED_LOSS_COOLDOWN'
  | 'BLOCKED_CONSECUTIVE_LOSSES'
  | 'BLOCKED_DAY_STOPPED';

// Dynamic universe: any symbol in market_data is allowed (market-poll establishes the valid set)
// This replaces the hardcoded ALLOWED_SYMBOLS list
const MAX_MARKET_AGE_SECONDS = 120;
const MAX_TRADES_PER_AGENT_PER_DAY = 5;
const MAX_TRADES_PER_SYMBOL_PER_DAY = 50;

// ============= LOSS REACTION DEFAULTS =============
const DEFAULT_COOLDOWN_MINUTES_AFTER_LOSS = 15;
const DEFAULT_MAX_CONSECUTIVE_LOSSES = 3;
const DEFAULT_HALVE_SIZE_DRAWDOWN_PCT = 2;
const DEFAULT_DAY_STOP_PCT = 5;

interface LossReactionConfig {
  enabled?: boolean;
  cooldown_minutes_after_loss?: number;
  max_consecutive_losses?: number;
  halve_size_drawdown_pct?: number;
  day_stop_pct?: number;
  session?: {
    consecutive_losses?: number;
    last_loss_at?: string | null;
    cooldown_until?: string | null;
    size_multiplier?: number;
    day_stopped?: boolean;
    day_stopped_reason?: string | null;
  };
}

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
    // === AUTH CHECK - supports JWT OR internal secret (for cron/trade-cycle) ===
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const hasInternalAuth = internalSecret && expectedSecret && internalSecret === expectedSecret;
    
    if (!hasInternalAuth) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabaseAuth = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getUser(token);

      if (claimsError || !claimsData?.user) {
        console.log('[trade-execute] Auth failed:', claimsError?.message);
        return new Response(
          JSON.stringify({ ok: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: ExecuteTradeRequest = await req.json();
    console.log('[trade-execute] Received request:', body);

    // === GATE 1: Validate symbol exists in market_data (dynamic universe) ===
    const { data: symbolCheck, error: symbolError } = await supabase
      .from('market_data')
      .select('symbol')
      .eq('symbol', body.symbol)
      .maybeSingle();
    
    if (symbolError || !symbolCheck) {
      const reason: BlockReason = 'BLOCKED_INVALID_SYMBOL';
      console.log(`[trade-execute] ${reason}: ${body.symbol} not in market_data`);
      
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

    // === PAPER MODE: Run continuously with minimal gates ===
    // Paper trading only checks: valid symbol (Gate 1), valid qty (Gate 2), market data freshness (Gate 4)
    // Skips: system stopped/paused, rate limits, loss reaction — these only apply to live
    const isPaperMode = tradeMode === 'paper';
    const skipRestrictiveGates = isPaperMode && !body.bypassGates;

    // === GATE 3: System must be running (skip for paper mode - paper runs always) ===
    if (!body.bypassGates && !skipRestrictiveGates) {
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
          mode: tradeMode,
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
          mode: tradeMode,
        });

        return new Response(
          JSON.stringify({ ok: false, blocked: true, reason }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // === GATE 4: Market data must be fresh (applies to both paper and live) ===
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

    // === GATE 5: Rate limits (skip for paper mode - paper runs freely) ===
    if (!body.bypassGates && !skipRestrictiveGates) {
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

    // === GATE 6: LOSS REACTION GATES (skip for paper mode - paper learns from all trades) ===
    // These prevent spiral losses in live mode: cooldown after loss, stop after consecutive losses, day-stop
    if (!body.bypassGates && !skipRestrictiveGates) {
      // Fetch loss_reaction config
      const { data: configData } = await supabase
        .from('system_config')
        .select('config')
        .limit(1)
        .maybeSingle();

      const config = configData?.config as Record<string, unknown> | null;
      const lossReaction = config?.loss_reaction as LossReactionConfig | undefined;
      
      if (lossReaction?.enabled !== false) {
        const session = lossReaction?.session || {};
        const cooldownMinutes = lossReaction?.cooldown_minutes_after_loss ?? DEFAULT_COOLDOWN_MINUTES_AFTER_LOSS;
        const maxConsecutive = lossReaction?.max_consecutive_losses ?? DEFAULT_MAX_CONSECUTIVE_LOSSES;
        
        console.log('[trade-execute] Loss reaction state:', session);

        // Check 1: Day stopped (hard stop for the day)
        if (session.day_stopped) {
          const reason: BlockReason = 'BLOCKED_DAY_STOPPED';
          console.log(`[trade-execute] ${reason}: ${session.day_stopped_reason || 'Unknown'}`);
          
          await logDecision(supabase, 'trade_blocked', {
            symbol: body.symbol,
            side: body.side,
            qty: body.qty,
            block_reason: reason,
            day_stopped_reason: session.day_stopped_reason,
            agent_id: body.agentId,
            generation_id: body.generationId,
            mode: tradeMode,
          });

          return new Response(
            JSON.stringify({ 
              ok: false, 
              blocked: true, 
              reason,
              error: `Trading stopped for today: ${session.day_stopped_reason || 'Loss limit reached'}`
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check 2: Cooldown after loss
        if (session.cooldown_until) {
          const cooldownEnd = new Date(session.cooldown_until);
          if (cooldownEnd > new Date()) {
            const reason: BlockReason = 'BLOCKED_LOSS_COOLDOWN';
            const remainingMs = cooldownEnd.getTime() - Date.now();
            const remainingMins = Math.ceil(remainingMs / 60000);
            console.log(`[trade-execute] ${reason}: ${remainingMins} minutes remaining`);
            
            await logDecision(supabase, 'trade_blocked', {
              symbol: body.symbol,
              side: body.side,
              qty: body.qty,
              block_reason: reason,
              cooldown_until: session.cooldown_until,
              remaining_minutes: remainingMins,
              agent_id: body.agentId,
              generation_id: body.generationId,
              mode: tradeMode,
            });

            return new Response(
              JSON.stringify({ 
                ok: false, 
                blocked: true, 
                reason,
                error: `Loss cooldown active. ${remainingMins} minutes remaining.`,
                cooldown_until: session.cooldown_until,
              }),
              { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Check 3: Consecutive losses limit
        const consecutiveLosses = session.consecutive_losses ?? 0;
        if (consecutiveLosses >= maxConsecutive) {
          const reason: BlockReason = 'BLOCKED_CONSECUTIVE_LOSSES';
          console.log(`[trade-execute] ${reason}: ${consecutiveLosses} consecutive losses`);
          
          await logDecision(supabase, 'trade_blocked', {
            symbol: body.symbol,
            side: body.side,
            qty: body.qty,
            block_reason: reason,
            consecutive_losses: consecutiveLosses,
            max_allowed: maxConsecutive,
            agent_id: body.agentId,
            generation_id: body.generationId,
            mode: tradeMode,
          });

          return new Response(
            JSON.stringify({ 
              ok: false, 
              blocked: true, 
              reason,
              error: `Trading paused: ${consecutiveLosses} consecutive losses reached limit of ${maxConsecutive}`
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Apply size multiplier if drawdown threshold exceeded
        const sizeMultiplier = session.size_multiplier ?? 1;
        if (sizeMultiplier < 1) {
          console.log(`[trade-execute] Applying size reduction: ${sizeMultiplier}x`);
          body.qty = body.qty * sizeMultiplier;
        }
      }
    }

// === GATE 7: Live mode requires explicit arm (timestamp-based) ===
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

      // === GATE 7: Preflight balance check (live mode only) ===
      console.log('[trade-execute] Fetching Coinbase balances for preflight check...');
      
      try {
        const balanceUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/coinbase-balances`;
        const balanceResponse = await fetch(balanceUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
        });
        
        if (!balanceResponse.ok) {
          console.error('[trade-execute] Failed to fetch balances:', balanceResponse.status);
          return new Response(
            JSON.stringify({ 
              ok: false, 
              blocked: true, 
              reason: 'BLOCKED_BALANCE_CHECK_FAILED',
              error: 'Could not verify Coinbase balances before trade'
            }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const balanceData = await balanceResponse.json();
        const balances = balanceData.balances || [];
        console.log('[trade-execute] Coinbase balances:', balances.map((b: { currency: string; available: string }) => 
          `${b.currency}: ${b.available}`).join(', '));
        
        // Parse the symbol (e.g., "DOGE-USD" -> base="DOGE", quote="USD")
        const [baseCurrency, quoteCurrency] = body.symbol.split('-');
        
        // Get available balances
        const baseBalance = balances.find((b: { currency: string }) => b.currency === baseCurrency);
        const quoteBalance = balances.find((b: { currency: string }) => b.currency === quoteCurrency);
        
        const baseAvailable = parseFloat(baseBalance?.available || '0');
        const quoteAvailable = parseFloat(quoteBalance?.available || '0');
        
        console.log(`[trade-execute] Preflight: side=${body.side}, qty=${body.qty}, baseAvailable=${baseAvailable}, quoteAvailable=${quoteAvailable}`);
        
        // SELL requires base currency (e.g., DOGE)
        if (body.side === 'sell') {
          if (baseAvailable < body.qty) {
            console.log(`[trade-execute] BLOCKED_INSUFFICIENT_BALANCE: need ${body.qty} ${baseCurrency}, have ${baseAvailable}`);
            
            await logDecision(supabase, 'trade_blocked', {
              symbol: body.symbol,
              side: body.side,
              qty: body.qty,
              block_reason: 'BLOCKED_INSUFFICIENT_BALANCE',
              required: body.qty,
              available: baseAvailable,
              currency: baseCurrency,
              agent_id: body.agentId,
              generation_id: generationId,
              mode: 'live',
            });
            
            return new Response(
              JSON.stringify({ 
                ok: false, 
                blocked: true, 
                reason: 'BLOCKED_INSUFFICIENT_BALANCE',
                error: `Cannot sell ${body.qty} ${baseCurrency}: only ${baseAvailable.toFixed(4)} available`,
                required: body.qty,
                available: baseAvailable,
                currency: baseCurrency,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
        
        // BUY requires quote currency (e.g., USD)
        if (body.side === 'buy') {
          // Get current price to estimate cost
          const { data: marketData } = await supabase
            .from('market_data')
            .select('price')
            .eq('symbol', body.symbol)
            .single();
          
          const price = marketData?.price || 0;
          const estimatedCost = body.qty * price * 1.01; // 1% buffer for slippage
          
          if (quoteAvailable < estimatedCost) {
            console.log(`[trade-execute] BLOCKED_INSUFFICIENT_BALANCE: need ~$${estimatedCost.toFixed(2)}, have $${quoteAvailable.toFixed(2)}`);
            
            await logDecision(supabase, 'trade_blocked', {
              symbol: body.symbol,
              side: body.side,
              qty: body.qty,
              block_reason: 'BLOCKED_INSUFFICIENT_BALANCE',
              estimated_cost: estimatedCost,
              available: quoteAvailable,
              currency: quoteCurrency,
              agent_id: body.agentId,
              generation_id: generationId,
              mode: 'live',
            });
            
            return new Response(
              JSON.stringify({ 
                ok: false, 
                blocked: true, 
                reason: 'BLOCKED_INSUFFICIENT_BALANCE',
                error: `Cannot buy ${body.qty} ${baseCurrency}: need ~$${estimatedCost.toFixed(2)}, only $${quoteAvailable.toFixed(2)} available`,
                estimated_cost: estimatedCost,
                available: quoteAvailable,
                currency: quoteCurrency,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
        
        console.log('[trade-execute] Preflight balance check passed');
        
      } catch (prefErr) {
        console.error('[trade-execute] Preflight balance check error:', prefErr);
        // Don't block on preflight errors - let live-execute handle it
        console.log('[trade-execute] Continuing despite preflight error...');
      }

      // Live is armed and preflight passed - forward to live-execute
      console.log(`[trade-execute] Live mode armed until ${liveArmedUntil}, forwarding to live-execute`);
      
      const liveUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/live-execute`;
      
      const liveResponse = await fetch(liveUrl, {
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
          generationId: generationId,
          tags: body.tags,
        }),
      });

      const liveResult = await liveResponse.json();
      console.log('[trade-execute] Live result:', liveResult);

      return new Response(
        JSON.stringify({ ...liveResult, mode: 'live', gates_passed: true }),
        { 
          status: liveResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // === ALL GATES PASSED - Execute in paper mode ===
    console.log('[trade-execute] All gates passed, forwarding to paper-execute');

    const paperUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/paper-execute`;
    
    const paperResponse = await fetch(paperUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') ?? '',
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
