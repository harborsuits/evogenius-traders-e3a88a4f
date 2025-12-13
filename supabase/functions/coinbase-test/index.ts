import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Coinbase Advanced Trade API requires signing requests with HMAC SHA256
function signRequest(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string = ''
): string {
  const message = timestamp + method + path + body;
  const hmac = createHmac('sha256', secret);
  hmac.update(message);
  return hmac.digest('hex');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const coinbaseApiKey = Deno.env.get('COINBASE_API_KEY');
  const coinbaseApiSecret = Deno.env.get('COINBASE_API_SECRET');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[coinbase-test] Starting connection test...');

    // Check if credentials are configured
    if (!coinbaseApiKey || !coinbaseApiSecret) {
      console.log('[coinbase-test] Missing API credentials');
      
      // Update exchange_connections to show not connected
      await supabase
        .from('exchange_connections')
        .upsert({
          provider: 'coinbase',
          is_enabled: false,
          last_auth_check: new Date().toISOString(),
          permissions: [],
        }, { onConflict: 'provider' });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'Coinbase API credentials not configured. Add COINBASE_API_KEY and COINBASE_API_SECRET to edge function secrets.',
          provider: 'coinbase'
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Build the request to Coinbase Advanced Trade API
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'GET';
    const path = '/api/v3/brokerage/accounts';
    
    const signature = signRequest(coinbaseApiSecret, timestamp, method, path);

    console.log('[coinbase-test] Calling Coinbase accounts endpoint...');

    const response = await fetch(`https://api.coinbase.com${path}`, {
      method,
      headers: {
        'CB-ACCESS-KEY': coinbaseApiKey,
        'CB-ACCESS-SIGN': signature,
        'CB-ACCESS-TIMESTAMP': timestamp,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[coinbase-test] Coinbase API error:', data);
      
      // Update exchange_connections to show failed
      await supabase
        .from('exchange_connections')
        .upsert({
          provider: 'coinbase',
          is_enabled: false,
          last_auth_check: new Date().toISOString(),
          permissions: [],
        }, { onConflict: 'provider' });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: data.message || data.error || 'Coinbase API authentication failed',
          provider: 'coinbase'
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Success - extract account info
    const accounts = data.accounts || [];
    const accountCount = accounts.length;
    
    // Determine permissions based on what we can access
    // For now, if we can list accounts, we have read access
    const permissions = ['wallet:accounts:read'];
    
    // Try to detect if we have order permissions by checking account capabilities
    // This is a safe read-only check
    if (accounts.some((acc: { available_balance?: { value?: string } }) => acc.available_balance?.value)) {
      permissions.push('wallet:orders:read');
    }

    console.log(`[coinbase-test] Success! Found ${accountCount} accounts`);

    // Update exchange_connections with success
    await supabase
      .from('exchange_connections')
      .upsert({
        provider: 'coinbase',
        is_enabled: true,
        last_auth_check: new Date().toISOString(),
        permissions: permissions,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider' });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        permissions,
        account_count: accountCount,
        provider: 'coinbase'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
    console.error('[coinbase-test] Error:', errorMessage);
    
    // Update exchange_connections to show error
    await supabase
      .from('exchange_connections')
      .upsert({
        provider: 'coinbase',
        is_enabled: false,
        last_auth_check: new Date().toISOString(),
        permissions: [],
      }, { onConflict: 'provider' });

    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: errorMessage,
        provider: 'coinbase'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
