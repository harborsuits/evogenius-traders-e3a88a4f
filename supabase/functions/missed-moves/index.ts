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
  last_decision: string | null;
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
    const PUMP_THRESHOLD = 5;
    const DUMP_THRESHOLD = -5;

    // 1) Get the valid exchange universe (symbols in market_data with proper format)
    const { data: universeData, error: universeError } = await supabase
      .from("market_data")
      .select("symbol")
      .like("symbol", "%-USD");
    
    if (universeError) throw universeError;
    
    const validUniverse = new Set((universeData || []).map(u => u.symbol));
    console.log(`[missed-moves] Valid universe: ${validUniverse.size} symbols`);
    
    // 2) Get monitored symbols (positions + recent decisions + top volume)
    const [positionsResult, decisionsResult, volumeResult] = await Promise.all([
      supabase
        .from("paper_positions")
        .select("symbol")
        .neq("qty", 0),
      supabase
        .from("control_events")
        .select("metadata")
        .eq("action", "trade_decision")
        .gte("triggered_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
        .limit(100),
      supabase
        .from("market_data")
        .select("symbol, volume_24h")
        .order("volume_24h", { ascending: false })
        .limit(20),
    ]);
    
    const positionSymbols = (positionsResult.data || []).map(p => p.symbol);
    const decisionSymbols = (decisionsResult.data || [])
      .map(d => (d.metadata as { symbol?: string } | null)?.symbol)
      .filter((s): s is string => Boolean(s));
    const topVolumeSymbols = (volumeResult.data || []).map(m => m.symbol);
    
    // Combine and validate against universe
    const monitoredSymbols = new Set([
      ...positionSymbols,
      ...decisionSymbols,
      ...topVolumeSymbols.slice(0, 10), // Top 10 by volume
    ].filter(s => validUniverse.has(s)));
    
    console.log(`[missed-moves] Monitored symbols: ${monitoredSymbols.size}`);

    // 3) Get ALL market data for monitored symbols (for informational movers section)
    const monitoredArray = Array.from(monitoredSymbols);
    const { data: allMarketData, error: allMdError } = await supabase
      .from("market_data")
      .select("symbol, price, change_24h, updated_at")
      .in("symbol", monitoredArray.length > 0 ? monitoredArray : ['NONE']);

    if (allMdError) throw allMdError;

    // Build all_monitored list with price data
    const allMonitored = (allMarketData || []).map(md => ({
      symbol: md.symbol,
      change_24h: md.change_24h,
      price: md.price,
      last_decision: null as string | null,
    }));

    // 3b) Filter to significant moves only for missed moves detection
    const marketData = (allMarketData || []).filter(
      md => md.change_24h >= PUMP_THRESHOLD || md.change_24h <= DUMP_THRESHOLD
    );

    if (!marketData || marketData.length === 0) {
      console.log("[missed-moves] No significant moves detected");
      return new Response(JSON.stringify({ 
        missed_moves: [], 
        all_monitored: allMonitored,
        thresholds: { pump: PUMP_THRESHOLD, dump: DUMP_THRESHOLD },
        monitored_count: monitoredSymbols.size
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Get recent trade decisions (last 6 hours)
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

    // 5) Get recent fills (last 6 hours) to check if we actually traded
    const { data: fills, error: fillError } = await supabase
      .from("paper_fills")
      .select("symbol, side, timestamp")
      .gte("timestamp", sixHoursAgo);

    if (fillError) throw fillError;

    const filledSymbols = new Set((fills || []).map(f => f.symbol));

    // 6) Build missed moves list - ONLY for monitored and valid symbols
    const missedMoves: MissedMove[] = [];

    for (const md of marketData) {
      // Skip if not in valid universe
      if (!validUniverse.has(md.symbol)) {
        console.log(`[missed-moves] Skipping invalid symbol: ${md.symbol}`);
        continue;
      }
      
      // Skip if not in monitored symbols
      if (!monitoredSymbols.has(md.symbol)) {
        continue;
      }

      const change = md.change_24h;
      const moveType: 'pump' | 'dump' = change >= PUMP_THRESHOLD ? 'pump' : 'dump';
      
      const recentDecision = decisionMap.get(md.symbol);
      const hadFill = filledSymbols.has(md.symbol);
      
      const hadSignal = recentDecision?.decision === 'BUY' || recentDecision?.decision === 'SELL';
      
      // Only flag as missed if:
      // 1. Big move happened on a monitored symbol
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

    // Add decision info to all_monitored for display
    const allMonitoredWithDecisions = allMonitored.map(m => ({
      ...m,
      last_decision: decisionMap.get(m.symbol)?.decision || null,
    }));

    return new Response(JSON.stringify({ 
      missed_moves: missedMoves.slice(0, 10),
      all_monitored: allMonitoredWithDecisions,
      thresholds: { pump: PUMP_THRESHOLD, dump: DUMP_THRESHOLD },
      monitored_count: monitoredSymbols.size
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
