import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('[paper-reset] Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[paper-reset] Authenticated user: ${claimsData.claims.sub}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[paper-reset] Resetting paper account...');

    // Get paper account
    const { data: account, error: accountError } = await supabase
      .from('paper_accounts')
      .select('*')
      .limit(1)
      .single();

    if (accountError || !account) {
      console.error('[paper-reset] No paper account found:', accountError);
      return new Response(
        JSON.stringify({ ok: false, error: 'No paper account found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete all paper fills (cascades from orders but do it explicitly)
    const { error: fillsError } = await supabase
      .from('paper_fills')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (fillsError) {
      console.error('[paper-reset] Failed to delete fills:', fillsError);
    }

    // Delete all paper orders
    const { error: ordersError } = await supabase
      .from('paper_orders')
      .delete()
      .eq('account_id', account.id);

    if (ordersError) {
      console.error('[paper-reset] Failed to delete orders:', ordersError);
    }

    // Delete all paper positions
    const { error: positionsError } = await supabase
      .from('paper_positions')
      .delete()
      .eq('account_id', account.id);

    if (positionsError) {
      console.error('[paper-reset] Failed to delete positions:', positionsError);
    }

    // Reset cash to starting_cash
    const { error: updateError } = await supabase
      .from('paper_accounts')
      .update({
        cash: account.starting_cash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id);

    if (updateError) {
      console.error('[paper-reset] Failed to reset cash:', updateError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to reset account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[paper-reset] Account reset successfully. Cash:', account.starting_cash);

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Paper account reset successfully',
        startingCash: account.starting_cash,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[paper-reset] Unexpected error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
