import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= LOSS REACTION DEFAULTS =============
const DEFAULT_COOLDOWN_MINUTES_AFTER_LOSS = 15;
const DEFAULT_MAX_CONSECUTIVE_LOSSES = 3;
const DEFAULT_HALVE_SIZE_DRAWDOWN_PCT = 2;
const DEFAULT_DAY_STOP_PCT = 5;

interface LossReactionSession {
  consecutive_losses: number;
  last_loss_at: string | null;
  cooldown_until: string | null;
  size_multiplier: number;
  day_stopped: boolean;
  day_stopped_reason: string | null;
}

interface LossReactionConfig {
  enabled?: boolean;
  cooldown_minutes_after_loss?: number;
  max_consecutive_losses?: number;
  halve_size_drawdown_pct?: number;
  day_stop_pct?: number;
  session?: LossReactionSession;
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

    const body = await req.json();
    const { action, pnl, symbol, trade_id } = body;

    console.log('[loss-reaction] Received:', { action, pnl, symbol, trade_id });

    // Get current config
    const { data: configData } = await supabase
      .from('system_config')
      .select('id, config')
      .limit(1)
      .maybeSingle();

    if (!configData) {
      return new Response(
        JSON.stringify({ ok: false, error: 'No system config found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = configData.config as Record<string, unknown>;
    const lossReaction = (config.loss_reaction || {}) as LossReactionConfig;
    
    // Get defaults from config or use constants
    const cooldownMinutes = lossReaction.cooldown_minutes_after_loss ?? DEFAULT_COOLDOWN_MINUTES_AFTER_LOSS;
    const maxConsecutive = lossReaction.max_consecutive_losses ?? DEFAULT_MAX_CONSECUTIVE_LOSSES;
    const halveSizeDrawdownPct = lossReaction.halve_size_drawdown_pct ?? DEFAULT_HALVE_SIZE_DRAWDOWN_PCT;
    const dayStopPct = lossReaction.day_stop_pct ?? DEFAULT_DAY_STOP_PCT;

    // Initialize session if not present
    const session: LossReactionSession = lossReaction.session || {
      consecutive_losses: 0,
      last_loss_at: null,
      cooldown_until: null,
      size_multiplier: 1,
      day_stopped: false,
      day_stopped_reason: null,
    };

    // Handle different actions
    if (action === 'trade_completed') {
      const pnlValue = parseFloat(pnl);
      const isLoss = pnlValue < 0;

      if (isLoss) {
        // Record the loss
        session.consecutive_losses = (session.consecutive_losses || 0) + 1;
        session.last_loss_at = new Date().toISOString();
        
        // Set cooldown
        const cooldownEnd = new Date(Date.now() + cooldownMinutes * 60 * 1000);
        session.cooldown_until = cooldownEnd.toISOString();
        
        console.log(`[loss-reaction] Loss recorded: consecutive=${session.consecutive_losses}, cooldown until ${session.cooldown_until}`);

        // Check if we've hit max consecutive losses
        if (session.consecutive_losses >= maxConsecutive) {
          session.day_stopped = true;
          session.day_stopped_reason = `${session.consecutive_losses} consecutive losses`;
          console.log('[loss-reaction] DAY STOPPED: Max consecutive losses reached');
        }
      } else {
        // Win resets consecutive losses
        session.consecutive_losses = 0;
        session.cooldown_until = null;
        session.size_multiplier = 1;
        console.log('[loss-reaction] Win recorded: resetting consecutive losses');
      }

      // Check day drawdown for size reduction
      const { data: systemState } = await supabase
        .from('system_state')
        .select('today_pnl, total_capital')
        .limit(1)
        .single();

      if (systemState) {
        const dayPnlPct = (systemState.today_pnl / systemState.total_capital) * 100;
        
        // Halve size if drawdown exceeds threshold
        if (dayPnlPct < -halveSizeDrawdownPct && session.size_multiplier === 1) {
          session.size_multiplier = 0.5;
          console.log(`[loss-reaction] Size halved: day PnL ${dayPnlPct.toFixed(2)}% < -${halveSizeDrawdownPct}%`);
        }
        
        // Day stop if exceeds day stop threshold
        if (dayPnlPct < -dayStopPct && !session.day_stopped) {
          session.day_stopped = true;
          session.day_stopped_reason = `Day PnL ${dayPnlPct.toFixed(2)}% exceeded -${dayStopPct}% limit`;
          console.log(`[loss-reaction] DAY STOPPED: ${session.day_stopped_reason}`);
        }
      }

      // Log control event
      await supabase.from('control_events').insert({
        action: 'loss_reaction_updated',
        metadata: {
          trade_id,
          symbol,
          pnl: pnlValue,
          is_loss: isLoss,
          consecutive_losses: session.consecutive_losses,
          cooldown_until: session.cooldown_until,
          size_multiplier: session.size_multiplier,
          day_stopped: session.day_stopped,
        },
        triggered_at: new Date().toISOString(),
      });
    } else if (action === 'reset_session') {
      // Reset session state (e.g., for new trading day)
      session.consecutive_losses = 0;
      session.last_loss_at = null;
      session.cooldown_until = null;
      session.size_multiplier = 1;
      session.day_stopped = false;
      session.day_stopped_reason = null;
      console.log('[loss-reaction] Session reset');

      await supabase.from('control_events').insert({
        action: 'loss_reaction_reset',
        metadata: { reason: body.reason || 'manual_reset' },
        triggered_at: new Date().toISOString(),
      });
    } else if (action === 'clear_cooldown') {
      // Clear just the cooldown (manual override)
      session.cooldown_until = null;
      console.log('[loss-reaction] Cooldown cleared manually');

      await supabase.from('control_events').insert({
        action: 'loss_reaction_cooldown_cleared',
        metadata: { reason: body.reason || 'manual_clear' },
        triggered_at: new Date().toISOString(),
      });
    } else if (action === 'get_state') {
      // Just return current state
      return new Response(
        JSON.stringify({ 
          ok: true, 
          session,
          config: {
            cooldown_minutes_after_loss: cooldownMinutes,
            max_consecutive_losses: maxConsecutive,
            halve_size_drawdown_pct: halveSizeDrawdownPct,
            day_stop_pct: dayStopPct,
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update config with new session state
    const updatedConfig = {
      ...config,
      loss_reaction: {
        ...lossReaction,
        session,
      },
    };

    const { error: updateError } = await supabase
      .from('system_config')
      .update({ config: updatedConfig, updated_at: new Date().toISOString() })
      .eq('id', configData.id);

    if (updateError) {
      console.error('[loss-reaction] Failed to update config:', updateError);
      throw updateError;
    }

    console.log('[loss-reaction] Config updated successfully');

    return new Response(
      JSON.stringify({ ok: true, session }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[loss-reaction] Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
