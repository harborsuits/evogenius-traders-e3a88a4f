import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYMBOLS = ['BTC-USD', 'ETH-USD'];

interface CoinbaseTicker {
  price: string;
  volume: string;
  time: string;
}

async function fetchCoinbasePrice(symbol: string): Promise<{ price: number; volume_24h: number } | null> {
  try {
    console.log(`[market-poll] Fetching ${symbol} from Coinbase...`);
    
    const response = await fetch(`https://api.exchange.coinbase.com/products/${symbol}/ticker`, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.error(`[market-poll] Coinbase API error for ${symbol}: ${response.status}`);
      return null;
    }
    
    const data: CoinbaseTicker = await response.json();
    console.log(`[market-poll] ${symbol}: $${data.price}`);
    
    return {
      price: parseFloat(data.price),
      volume_24h: parseFloat(data.volume) * parseFloat(data.price), // Convert to USD volume
    };
  } catch (error) {
    console.error(`[market-poll] Error fetching ${symbol}:`, error);
    return null;
  }
}

async function fetch24hChange(symbol: string, currentPrice: number): Promise<number> {
  try {
    const response = await fetch(`https://api.exchange.coinbase.com/products/${symbol}/stats`, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) return 0;
    
    const data = await response.json();
    const open = parseFloat(data.open);
    if (open > 0) {
      return ((currentPrice - open) / open) * 100;
    }
    return 0;
  } catch {
    return 0;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[market-poll] Starting market data poll...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check system status - skip polling if stopped
    const { data: systemState } = await supabase
      .from('system_state')
      .select('status')
      .limit(1)
      .single();

    if (systemState?.status === 'stopped') {
      console.log('[market-poll] System is stopped, skipping poll');
      return new Response(
        JSON.stringify({ 
          success: true, 
          skipped: true,
          reason: 'System is stopped',
          timestamp: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: { symbol: string; price: number; change_24h: number; volume_24h: number }[] = [];

    for (const symbol of SYMBOLS) {
      const priceData = await fetchCoinbasePrice(symbol);
      
      if (priceData) {
        const change_24h = await fetch24hChange(symbol, priceData.price);
        
        // Upsert into market_data
        const { error } = await supabase
          .from('market_data')
          .upsert({
            symbol,
            price: priceData.price,
            volume_24h: priceData.volume_24h,
            change_24h: change_24h,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'symbol',
          });

        if (error) {
          console.error(`[market-poll] DB upsert error for ${symbol}:`, error);
        } else {
          results.push({
            symbol,
            price: priceData.price,
            change_24h,
            volume_24h: priceData.volume_24h,
          });
        }
      }
    }

    console.log(`[market-poll] Updated ${results.length} symbols`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        updated: results.length,
        data: results,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[market-poll] Fatal error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});