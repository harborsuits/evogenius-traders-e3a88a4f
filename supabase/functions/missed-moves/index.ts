import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MissedMove {
  symbol: string;
  change_24h: number;
  price: number;
  had_signal: boolean;
  last_decision: string | null; // 'BUY' | 'SELL' | 'HOLD' | null
  last_decision_reason: string | null;
  decision_time: string | null;
  move_type: 'pump' | 'dump';
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Config: what counts as a "significant" move
    const PUMP_THRESHOLD = 5; // +5% or more
    const DUMP_THRESHOLD = -5; // -5% or more

    // 1) Get market data with significant moves
    const { data: marketData, error: mdError } = await supabase
      .from("market_data")
      .select("symbol, price, change_24h, updated_at")
      .or(`change_24h.gte.${PUMP_THRESHOLD},change_24h.lte.${DUMP_THRESHOLD}`)
      .order("change_24h", { ascending: false });

    if (mdError) throw mdError;

    if (!marketData || marketData.length === 0) {
      console.log("[missed-moves] No significant moves detected");
      return new Response(JSON.stringify({ missed_moves: [], thresholds: { pump: PUMP_THRESHOLD, dump: DUMP_THRESHOLD } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Get recent trade decisions (last 6 hours)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: decisions, error: decError } = await supabase
      .from("control_events")
      .select("metadata, triggered_at")
      .eq("action", "trade_decision")
      .gte("triggered_at", sixHoursAgo);

    if (decError) throw decError;

    // Build a map: symbol -> most recent decision
    const decisionMap = new Map<string, { decision: string; reason: string; time: string }>();
    for (const d of decisions || []) {
      const meta = d.metadata as { symbol?: string; decision?: string; reason?: string } | null;
      if (meta?.symbol) {
        const existing = decisionMap.get(meta.symbol);
        if (!existing || new Date(d.triggered_at) > new Date(existing.time)) {
          decisionMap.set(meta.symbol, {
            decision: meta.decision || 'HOLD',
            reason: meta.reason || '',
            time: d.triggered_at,
          });
        }
      }
    }

    // 3) Get recent fills (last 6 hours) to check if we actually traded
    const { data: fills, error: fillError } = await supabase
      .from("paper_fills")
      .select("symbol, side, timestamp")
      .gte("timestamp", sixHoursAgo);

    if (fillError) throw fillError;

    const filledSymbols = new Set((fills || []).map(f => f.symbol));

    // 4) Build missed moves list
    const missedMoves: MissedMove[] = [];

    for (const md of marketData) {
      const change = md.change_24h;
      const moveType: 'pump' | 'dump' = change >= PUMP_THRESHOLD ? 'pump' : 'dump';
      
      const recentDecision = decisionMap.get(md.symbol);
      const hadFill = filledSymbols.has(md.symbol);
      
      // Determine if we "missed" it:
      // - For pumps: missed if we didn't BUY (or had no signal)
      // - For dumps: missed if we were holding and didn't SELL (or had no signal)
      // Simplified: if there was a big move and we didn't fill on that symbol, it's a "miss"
      
      const hadSignal = recentDecision?.decision === 'BUY' || recentDecision?.decision === 'SELL';
      
      // Only flag as missed if:
      // 1. Big move happened
      // 2. We didn't trade it (no fill)
      // 3. Either no decision at all, or decision was HOLD
      const isMissed = !hadFill && (!hadSignal || recentDecision?.decision === 'HOLD');

      if (isMissed) {
        missedMoves.push({
          symbol: md.symbol,
          change_24h: change,
          price: md.price,
          had_signal: hadSignal,
          last_decision: recentDecision?.decision || null,
          last_decision_reason: recentDecision?.reason || null,
          decision_time: recentDecision?.time || null,
          move_type: moveType,
        });
      }
    }

    // Sort by absolute change (biggest moves first)
    missedMoves.sort((a, b) => Math.abs(b.change_24h) - Math.abs(a.change_24h));

    console.log(`[missed-moves] Found ${missedMoves.length} missed moves out of ${marketData.length} significant movers`);

    return new Response(JSON.stringify({ 
      missed_moves: missedMoves.slice(0, 10), // Top 10
      thresholds: { pump: PUMP_THRESHOLD, dump: DUMP_THRESHOLD }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[missed-moves] Error:", errMsg);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
