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

    const { action } = await req.json();

    if (action === 'arm') {
      // Set live_armed_until to 60 seconds from now
      const armedUntil = new Date(Date.now() + 60 * 1000).toISOString();

      const { error } = await supabase
        .from('system_state')
        .update({ live_armed_until: armedUntil })
        .eq('id', (await supabase.from('system_state').select('id').single()).data?.id);

      if (error) throw error;

      // Log the arm event
      await supabase.from('control_events').insert({
        action: 'live_armed',
        metadata: { armed_until: armedUntil, duration_seconds: 60 }
      });

      console.log(`[arm-live] Armed until ${armedUntil}`);

      return new Response(
        JSON.stringify({ success: true, armed_until: armedUntil }),
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
        JSON.stringify({ success: true, armed_until: null }),
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
