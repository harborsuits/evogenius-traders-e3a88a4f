import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get monitored symbols from:
    // 1. Current positions
    // 2. Recent trade decisions (last 6 hours)
    // 3. Top volume symbols (as fallback)
    
    const [positionsResult, decisionsResult, marketResult] = await Promise.all([
      supabase
        .from('paper_positions')
        .select('symbol')
        .neq('qty', 0),
      supabase
        .from('control_events')
        .select('metadata')
        .eq('action', 'trade_decision')
        .gte('triggered_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
        .limit(100),
      supabase
        .from('market_data')
        .select('symbol, volume_24h')
        .like('symbol', '%-USD')
        .order('volume_24h', { ascending: false })
        .limit(20),
    ]);
    
    // Extract bot's active symbols
    const positionSymbols = (positionsResult.data || []).map(p => p.symbol);
    const decisionSymbols = (decisionsResult.data || [])
      .map(d => (d.metadata as { symbol?: string } | null)?.symbol)
      .filter((s): s is string => Boolean(s));
    const topVolumeSymbols = (marketResult.data || []).map(m => m.symbol);
    
    // Monitored = positions + evaluated + top 10 volume
    const monitoredSymbols = [...new Set([
      ...positionSymbols, 
      ...decisionSymbols,
      ...topVolumeSymbols.slice(0, 10)
    ])];
    
    // Bot symbols = just positions + evaluated (what we actively touched)
    const botSymbols = [...new Set([...positionSymbols, ...decisionSymbols])];
    
    console.log(`[news-feed] Bot symbols: ${botSymbols.length}, Top volume: ${topVolumeSymbols.length}`);
    
    // Fetch news from last 12 hours (extend to 24h if sparse)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // Get all recent news
    const { data: allNews } = await supabase
      .from('news_items')
      .select('*')
      .gte('published_at', twentyFourHoursAgo)
      .order('published_at', { ascending: false })
      .limit(100);
    
    const newsItems = allNews || [];
    
    // Score and filter news for bot lane (relevant catalysts)
    const scoredBotNews = newsItems
      .map(n => {
        const symbols: string[] = n.symbols || [];
        // Count how many of our monitored symbols this news mentions
        const overlapCount = symbols.filter((s: string) => monitoredSymbols.includes(s)).length;
        
        // Skip if no overlap with monitored symbols
        if (overlapCount === 0) return null;
        
        // Score by: overlap count + recency + importance
        const ageHours = (Date.now() - new Date(n.published_at).getTime()) / (1000 * 60 * 60);
        const recencyScore = Math.max(0, 1 - (ageHours / 12)); // 1.0 at 0h, 0 at 12h
        const importanceScore = (n.importance || 3) / 5; // Normalize to 0-1
        
        const score = (overlapCount * 2) + recencyScore + importanceScore;
        
        return { ...n, score, overlapCount };
      })
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    
    // Get market lane (general/macro news for fallback)
    const marketNews = newsItems
      .filter(n => {
        const symbols: string[] = n.symbols || [];
        // Include if: no symbols (general), or mentions BTC/ETH
        return symbols.length === 0 || 
               symbols.some((s: string) => ['BTC-USD', 'ETH-USD'].includes(s));
      })
      .slice(0, 12);
    
    // Get recent fills for correlation (last 6 hours)
    const { data: recentFills } = await supabase
      .from('paper_fills')
      .select('symbol, timestamp, side, price')
      .gte('timestamp', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(20);
    
    // Get news intensity per symbol (last 2 hours)
    const { data: newsIntensity } = await supabase
      .from('news_mentions')
      .select('symbol')
      .gte('bucket_start', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    
    const intensityMap: Record<string, number> = {};
    for (const m of newsIntensity || []) {
      intensityMap[m.symbol] = (intensityMap[m.symbol] || 0) + 1;
    }
    
    return new Response(JSON.stringify({
      market_lane: marketNews,
      bot_lane: scoredBotNews,
      bot_symbols: botSymbols,
      monitored_symbols: monitoredSymbols,
      recent_fills: recentFills || [],
      news_intensity: intensityMap,
      top_volume_symbols: topVolumeSymbols,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[news-feed] Error:', error);
    return new Response(JSON.stringify({
      error: errMsg,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
