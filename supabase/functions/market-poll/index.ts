import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// DYNAMIC UNIVERSE CONFIGURATION
// Minimum 24h volume in USD to qualify as liquid
const MIN_VOLUME_USD = 1_000_000; // $1M floor for validation (raise to $5M for production)
// Max symbols to poll per cycle (performance/rate limit guard)
const MAX_SYMBOLS = 20;

interface CoinbaseProduct {
  id: string;
  base_currency: string;
  quote_currency: string;
  status: string;
  trading_disabled: boolean;
}

interface CoinbaseTicker {
  price: string;
  volume: string;
  time: string;
}

// Fetch all eligible Coinbase spot USD products
async function fetchEligibleProducts(): Promise<string[]> {
  try {
    console.log('[market-poll] Fetching Coinbase products...');
    
    const response = await fetch('https://api.exchange.coinbase.com/products', {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.error(`[market-poll] Products API error: ${response.status}`);
      return ['BTC-USD', 'ETH-USD']; // Fallback to core pairs
    }
    
    const products: CoinbaseProduct[] = await response.json();
    
    // Filter for eligible spot USD pairs
    const eligible = products.filter(p => 
      p.status === 'online' &&
      !p.trading_disabled &&
      p.quote_currency === 'USD' &&
      p.base_currency !== 'USD'
    );
    
    console.log(`[market-poll] Found ${eligible.length} eligible USD pairs`);
    
    // Return product IDs (e.g., 'BTC-USD', 'ETH-USD')
    return eligible.map(p => p.id);
  } catch (error) {
    console.error('[market-poll] Error fetching products:', error);
    return ['BTC-USD', 'ETH-USD']; // Fallback
  }
}

async function fetchCoinbasePrice(symbol: string): Promise<{ price: number; volume_24h: number } | null> {
  try {
    const response = await fetch(`https://api.exchange.coinbase.com/products/${symbol}/ticker`, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      // Don't log 404s as errors - some products may be temporarily unavailable
      if (response.status !== 404) {
        console.error(`[market-poll] Coinbase API error for ${symbol}: ${response.status}`);
      }
      return null;
    }
    
    const data: CoinbaseTicker = await response.json();
    const price = parseFloat(data.price);
    const volume_24h = parseFloat(data.volume) * price;
    
    return { price, volume_24h };
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

async function logPollRun(
  supabase: any,
  status: 'success' | 'skipped' | 'error',
  updatedCount: number,
  durationMs: number,
  errorMessage?: string
) {
  try {
    await supabase.from('market_poll_runs').insert({
      status,
      updated_count: updatedCount,
      duration_ms: durationMs,
      error_message: errorMessage || null,
    });
  } catch (err) {
    console.error('[market-poll] Failed to log run:', err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('[market-poll] Starting market data poll...');

    // Check system status
    const { data: systemState } = await supabase
      .from('system_state')
      .select('status')
      .limit(1)
      .single();

    if (systemState?.status === 'stopped') {
      console.log('[market-poll] System is stopped, skipping poll');
      const duration = Date.now() - startTime;
      await logPollRun(supabase, 'skipped', 0, duration);
      
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

    // DYNAMIC UNIVERSE: Fetch all eligible products from Coinbase
    const allEligibleProducts = await fetchEligibleProducts();
    
    // Get price data for all eligible products to filter by volume
    const productsWithVolume: { symbol: string; volume: number }[] = [];
    
    // Fetch in batches to avoid rate limits (max 10 req/sec on public endpoints)
    const batchSize = 5;
    for (let i = 0; i < allEligibleProducts.length; i += batchSize) {
      const batch = allEligibleProducts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          const data = await fetchCoinbasePrice(symbol);
          return data ? { symbol, volume: data.volume_24h } : null;
        })
      );
      
      for (const result of batchResults) {
        if (result && result.volume >= MIN_VOLUME_USD) {
          productsWithVolume.push(result);
        }
      }
    }
    
    // Sort by volume and take top N
    productsWithVolume.sort((a, b) => b.volume - a.volume);
    const symbols = productsWithVolume.slice(0, MAX_SYMBOLS).map(p => p.symbol);
    
    // Always ensure BTC-USD and ETH-USD are included (core pairs)
    if (!symbols.includes('BTC-USD')) symbols.unshift('BTC-USD');
    if (!symbols.includes('ETH-USD')) symbols.splice(1, 0, 'ETH-USD');
    
    console.log(`[market-poll] Polling ${symbols.length} symbols: ${symbols.slice(0, 5).join(', ')}...`);

    const results: { symbol: string; price: number; change_24h: number; volume_24h: number }[] = [];

    for (const symbol of symbols) {
      const priceData = await fetchCoinbasePrice(symbol);
      
      if (priceData) {
        const change_24h = await fetch24hChange(symbol, priceData.price);
        
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

    const duration = Date.now() - startTime;
    await logPollRun(supabase, 'success', results.length, duration);
    
    console.log(`[market-poll] Updated ${results.length} symbols in ${duration}ms`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        skipped: false,
        updated: results.length,
        data: results,
        duration_ms: duration,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const duration = Date.now() - startTime;
    await logPollRun(supabase, 'error', 0, duration, errorMessage);
    
    console.error('[market-poll] Fatal error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});