import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('[price-feed] Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1) positions symbols (primary)
    const { data: positions } = await supabase
      .from("paper_positions")
      .select("symbol, qty")
      .neq("qty", 0);

    const positionSymbols = (positions || []).map(p => p.symbol);

    // 2) fallback: last 2h decisions (if no positions)
    let decisionSymbols: string[] = [];
    if (positionSymbols.length === 0) {
      const { data: decisions } = await supabase
        .from("control_events")
        .select("metadata")
        .eq("action", "trade_decision")
        .gte("triggered_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .limit(100);

      decisionSymbols = (decisions || [])
        .map(d => (d.metadata as { symbol?: string })?.symbol)
        .filter(Boolean) as string[];
    }

    const symbols = [...new Set([...positionSymbols, ...decisionSymbols])].slice(0, 20);

    // market_data already holds your approved universe + live-ish values
    const { data: md } = await supabase
      .from("market_data")
      .select("symbol, price, change_24h, volume_24h, updated_at")
      .in("symbol", symbols);

    // sort: positions first, then volume
    const posSet = new Set(positionSymbols);
    const sorted = (md || []).sort((a, b) => {
      const ap = posSet.has(a.symbol) ? 1 : 0;
      const bp = posSet.has(b.symbol) ? 1 : 0;
      if (bp !== ap) return bp - ap;
      return (b.volume_24h || 0) - (a.volume_24h || 0);
    });

    console.log(`[price-feed] Returning ${sorted.length} symbols (${positionSymbols.length} from positions)`);

    return new Response(JSON.stringify({ symbols: sorted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[price-feed] Error:", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
