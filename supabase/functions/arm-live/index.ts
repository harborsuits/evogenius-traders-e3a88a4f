import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { action, duration_minutes } = await req.json();

    if (action === 'arm') {
      // Default to 30 minutes, max 60 minutes for canary mode
      const durationMins = Math.min(Math.max(duration_minutes || 30, 1), 60);
      const armedUntil = new Date(Date.now() + durationMins * 60 * 1000).toISOString();

      // Create an arm_session record for atomic spending (canary hard-lock)
      const { data: sessionData, error: sessionError } = await supabase
        .from('arm_sessions')
        .insert({
          mode: 'live',
          expires_at: armedUntil,
          max_live_orders: 1, // Canary mode: exactly one order allowed
        })
        .select('id')
        .single();

      if (sessionError) {
        console.error('[arm-live] Failed to create arm session:', sessionError);
        throw sessionError;
      }

      const sessionId = sessionData.id;
      console.log(`[arm-live] Created arm session: ${sessionId}`);

      // Update system_state with armed timestamp
      const { error } = await supabase
        .from('system_state')
        .update({ live_armed_until: armedUntil })
        .eq('id', (await supabase.from('system_state').select('id').single()).data?.id);

      if (error) throw error;

      // Log the arm event
      await supabase.from('control_events').insert({
        action: 'live_armed',
        metadata: { 
          armed_until: armedUntil, 
          duration_minutes: durationMins,
          session_id: sessionId,
          max_orders: 1,
        }
      });

      console.log(`[arm-live] Armed until ${armedUntil} (session: ${sessionId})`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          armed_until: armedUntil,
          session_id: sessionId,
          max_orders: 1,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'disarm') {
      const { error } = await supabase
        .from('system_state')
        .update({ live_armed_until: null })
        .eq('id', (await supabase.from('system_state').select('id').single()).data?.id);

      if (error) throw error;

      await supabase.from('control_events').insert({
        action: 'live_disarmed',
        metadata: {}
      });

      console.log('[arm-live] Disarmed');

      return new Response(
        JSON.stringify({ success: true, armed_until: null, session_id: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "arm" or "disarm".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[arm-live] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});