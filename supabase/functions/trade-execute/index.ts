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

    // Get trade mode
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
    console.log('[trade-execute] Trade mode:', tradeMode);

    if (tradeMode === 'paper') {
      // Forward to paper-execute
      const paperUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/paper-execute`;
      
      const paperResponse = await fetch(paperUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify(body),
      });

      const paperResult = await paperResponse.json();
      console.log('[trade-execute] Paper result:', paperResult);

      return new Response(
        JSON.stringify({ ...paperResult, mode: 'paper' }),
        { 
          status: paperResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } else if (tradeMode === 'live') {
      // Live trading not yet implemented
      console.log('[trade-execute] Live mode not implemented');
      
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'Live trading not yet implemented. Switch to paper mode.',
          mode: 'live'
        }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: `Unknown trade mode: ${tradeMode}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('[trade-execute] Unexpected error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
