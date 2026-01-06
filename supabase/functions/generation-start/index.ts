import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ===========================================================================
// GENERATION START
// ===========================================================================
// Atomically starts a new generation:
// 1. Closes any active generation
// 2. Creates new generation row
// 3. Updates system_state.current_generation_id
// 4. Links all agents to new generation
// 5. Logs control event
// ===========================================================================

const PLACEHOLDER_ID = '11111111-1111-1111-1111-111111111111';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // === AUTH CHECK ===
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
    console.log('[generation-start] Auth failed:', claimsError?.message);
    return new Response(
      JSON.stringify({ ok: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  console.log('[generation-start] Starting new generation...');

  try {
    // Check if we already have a valid active generation
    const { data: systemState } = await supabase
      .from('system_state')
      .select('current_generation_id')
      .limit(1)
      .single();

    const currentGenId = systemState?.current_generation_id;
    
    // If current generation is placeholder or missing, proceed
    if (currentGenId && currentGenId !== PLACEHOLDER_ID) {
      // Check if it's actually active
      const { data: currentGen } = await supabase
        .from('generations')
        .select('is_active')
        .eq('id', currentGenId)
        .single();

      if (currentGen?.is_active) {
        console.log('[generation-start] Active generation already exists:', currentGenId);
        return new Response(
          JSON.stringify({ 
            ok: true, 
            skipped: true, 
            reason: 'active_generation_exists',
            generation_id: currentGenId 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Call the RPC function to atomically start a new generation
    const { data: newGenId, error: rpcError } = await supabase
      .rpc('start_new_generation');

    if (rpcError) {
      console.error('[generation-start] RPC error:', rpcError);
      throw rpcError;
    }

    console.log('[generation-start] New generation created:', newGenId);

    // Get generation details for response
    const { data: newGen } = await supabase
      .from('generations')
      .select('generation_number, start_time')
      .eq('id', newGenId)
      .single();

    return new Response(
      JSON.stringify({
        ok: true,
        generation_id: newGenId,
        generation_number: newGen?.generation_number,
        start_time: newGen?.start_time,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[generation-start] Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
