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
    
    // Get symbols from:
    // 1. Current positions
    // 2. Recent trade decisions (last 2 hours)
    // 3. Top volume symbols
    
    const [positionsResult, decisionsResult, marketResult] = await Promise.all([
      supabase
        .from('paper_positions')
        .select('symbol')
        .neq('qty', 0),
      supabase
        .from('control_events')
        .select('metadata')
        .eq('action', 'trade_decision')
        .gte('triggered_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .limit(50),
      supabase
        .from('market_data')
        .select('symbol, volume_24h')
        .order('volume_24h', { ascending: false })
        .limit(10),
    ]);
    
    // Extract bot's active symbols
    const positionSymbols = (positionsResult.data || []).map(p => p.symbol);
    const decisionSymbols = (decisionsResult.data || [])
      .map(d => d.metadata?.symbol)
      .filter(Boolean);
    const topVolumeSymbols = (marketResult.data || []).map(m => m.symbol);
    
    const botSymbols = [...new Set([...positionSymbols, ...decisionSymbols])];
    
    console.log(`[news-feed] Bot symbols: ${botSymbols.length}, Top volume: ${topVolumeSymbols.length}`);
    
    // Fetch market lane - general high-quality news
    const { data: marketNews } = await supabase
      .from('news_items')
      .select('*')
      .gte('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('published_at', { ascending: false })
      .limit(12);
    
    // Fetch bot lane - news matching bot's symbols
    let botNews: typeof marketNews = [];
    if (botSymbols.length > 0) {
      const { data } = await supabase
        .from('news_items')
        .select('*')
        .gte('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .overlaps('symbols', botSymbols)
        .order('published_at', { ascending: false })
        .limit(20);
      
      botNews = data || [];
    }
    
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
      market_lane: marketNews || [],
      bot_lane: botNews || [],
      bot_symbols: botSymbols,
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
