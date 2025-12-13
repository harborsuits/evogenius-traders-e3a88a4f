import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base64url encode helper
function base64urlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Generate JWT for Coinbase Advanced Trade API (ES256)
async function generateCoinbaseJWT(
  keyName: string,
  privateKeyPem: string,
  method: string,
  path: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  // JWT Header
  const header = {
    alg: 'ES256',
    typ: 'JWT',
    kid: keyName,
    nonce: crypto.randomUUID(),
  };

  // JWT Payload per Coinbase docs
  const payload = {
    iss: 'cdp',
    sub: keyName,
    iat: now,
    exp: now + 120, // 2 minutes
    nbf: now,
    uri: `${method} api.coinbase.com${path}`,
  };

  const encodedHeader = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Parse the PEM private key
  const pemContents = privateKeyPem
    .replace(/-----BEGIN EC PRIVATE KEY-----/g, '')
    .replace(/-----END EC PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  // Import the private key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the token
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = base64urlEncode(new Uint8Array(signature));
  return `${unsignedToken}.${encodedSignature}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const keyName = Deno.env.get('COINBASE_API_KEY'); // e.g., organizations/{org_id}/apiKeys/{key_id}
  const privateKey = Deno.env.get('COINBASE_API_SECRET'); // EC Private Key PEM

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[coinbase-test] Starting connection test with JWT auth...');

    if (!keyName || !privateKey) {
      console.log('[coinbase-test] Missing API credentials');
      
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
          error: 'Coinbase API credentials not configured. Add COINBASE_API_KEY (key name) and COINBASE_API_SECRET (private key PEM) to edge function secrets.',
          provider: 'coinbase'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const method = 'GET';
    const path = '/api/v3/brokerage/accounts';
    
    console.log('[coinbase-test] Generating JWT for:', keyName.substring(0, 30) + '...');
    const jwt = await generateCoinbaseJWT(keyName, privateKey, method, path);

    console.log('[coinbase-test] Calling Coinbase accounts endpoint...');
    const response = await fetch(`https://api.coinbase.com${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[coinbase-test] Coinbase API error:', response.status, data);
      
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
          error: data.message || data.error || `Coinbase API error: ${response.status}`,
          provider: 'coinbase'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accounts = data.accounts || [];
    const accountCount = accounts.length;
    
    // Determine permissions based on API key capabilities
    const permissions = ['wallet:accounts:read'];
    if (accounts.some((acc: { available_balance?: { value?: string } }) => acc.available_balance?.value)) {
      permissions.push('wallet:orders:read');
    }

    console.log(`[coinbase-test] Success! Found ${accountCount} accounts`);

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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
    console.error('[coinbase-test] Error:', errorMessage);
    
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
