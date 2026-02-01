import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// === TIERED POLLING CONFIGURATION ===
// Tier 1: High-activity symbols - poll every minute
const TIER_1_SYMBOLS = [
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'AVAX-USD', 'DOGE-USD',
  'XRP-USD', 'DOT-USD', 'LINK-USD', 'ADA-USD', 'NEAR-USD',
  'ARB-USD', 'ATOM-USD', 'POL-USD', 'OP-USD', 'INJ-USD',
];

// Tier 2: Medium-activity symbols - poll every 5 minutes
const TIER_2_SYMBOLS = [
  'APT-USD', 'FIL-USD', 'TAO-USD', 'ONDO-USD', 'ZRO-USD',
  'BCH-USD', 'HBAR-USD', 'ZEC-USD', 'XLM-USD', 'WLD-USD',
  'RENDER-USD', 'PENGU-USD', 'PEPE-USD', 'BNB-USD', 'AAVE-USD',
  'ICP-USD', 'FET-USD', 'ALGO-USD',
];

// Tier 3: Low-activity symbols - poll every 15 minutes
const TIER_3_SYMBOLS = [
  'AXS-USD', 'AERO-USD', 'BONK-USD', 'DASH-USD', 'ROSE-USD',
  'CBETH-USD', 'SAND-USD', 'MANA-USD', 'GRT-USD', 'CRV-USD',
  'MKR-USD', 'COMP-USD', 'UMA-USD', 'SNX-USD', 'BAL-USD',
];

// Rate limit settings
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1500; // 1.5s between batches to avoid 429s

interface CoinbaseTicker {
  price: string;
  volume: string;
  time: string;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCoinbasePrice(symbol: string): Promise<{ price: number; volume_24h: number } | null> {
  try {
    const response = await fetch(`https://api.exchange.coinbase.com/products/${symbol}/ticker`, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`[market-poll] Rate limited for ${symbol}, will retry next cycle`);
      } else if (response.status !== 404) {
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

// Regime classification based on price movement and volatility
function classifyRegime(change24h: number, volume24h: number): string {
  const absChange = Math.abs(change24h);
  
  if (absChange > 3) return 'Trending';
  if (absChange > 1 && absChange <= 3) return 'Ranging';
  if (absChange <= 1 && volume24h > 500000) return 'Ranging';
  if (volume24h < 100000) return 'Unknown';
  
  return 'Ranging';
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

async function pollSymbolBatch(
  supabase: any,
  symbols: string[]
): Promise<{ symbol: string; price: number; change_24h: number; volume_24h: number }[]> {
  const results: { symbol: string; price: number; change_24h: number; volume_24h: number }[] = [];
  
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    
    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        const priceData = await fetchCoinbasePrice(symbol);
        if (!priceData) return null;
        
        const change_24h = await fetch24hChange(symbol, priceData.price);
        const regime = classifyRegime(change_24h, priceData.volume_24h);
        
        const { error } = await supabase
          .from('market_data')
          .upsert({
            symbol,
            price: priceData.price,
            volume_24h: priceData.volume_24h,
            change_24h: change_24h,
            regime: regime,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'symbol',
          });

        if (error) {
          console.error(`[market-poll] DB upsert error for ${symbol}:`, error);
          return null;
        }
        
        return {
          symbol,
          price: priceData.price,
          change_24h,
          volume_24h: priceData.volume_24h,
        };
      })
    );
    
    for (const r of batchResults) {
      if (r) results.push(r);
    }
    
    // Add delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < symbols.length) {
      await delay(BATCH_DELAY_MS);
    }
  }
  
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // === AUTH CHECK - supports JWT OR internal secret ===
  const internalSecret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const hasInternalAuth = internalSecret && expectedSecret && internalSecret === expectedSecret;
  
  if (!hasInternalAuth) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getUser(token);

    if (claimsError || !claimsData?.user) {
      console.log('[market-poll] Auth failed:', claimsError?.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  const startTime = Date.now();
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('[market-poll] Starting tiered market data poll...');

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

    // Determine which tiers to poll based on current minute
    const currentMinute = new Date().getMinutes();
    
    // Tier 1: Always polled (every minute)
    let symbolsToPoll = [...TIER_1_SYMBOLS];
    let tiersIncluded = ['T1'];
    
    // Tier 2: Every 5 minutes (minutes 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55)
    if (currentMinute % 5 === 0) {
      symbolsToPoll.push(...TIER_2_SYMBOLS);
      tiersIncluded.push('T2');
    }
    
    // Tier 3: Every 15 minutes (minutes 0, 15, 30, 45)
    if (currentMinute % 15 === 0) {
      symbolsToPoll.push(...TIER_3_SYMBOLS);
      tiersIncluded.push('T3');
    }
    
    console.log(`[market-poll] Minute ${currentMinute}: polling tiers [${tiersIncluded.join(', ')}] = ${symbolsToPoll.length} symbols`);
    
    // Poll all symbols with rate limiting
    const results = await pollSymbolBatch(supabase, symbolsToPoll);
    
    const duration = Date.now() - startTime;
    await logPollRun(supabase, 'success', results.length, duration);
    
    console.log(`[market-poll] Complete: updated ${results.length}/${symbolsToPoll.length} symbols in ${duration}ms`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        skipped: false,
        updated: results.length,
        attempted: symbolsToPoll.length,
        tiers: tiersIncluded,
        current_minute: currentMinute,
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
