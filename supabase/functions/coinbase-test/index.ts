import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate random hex nonce
function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Base64url encode
function base64urlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Parse the private key - handles raw base64, PEM with headers, or escaped newlines
function parsePrivateKey(input: string): Uint8Array {
  // Normalize escaped newlines
  let key = input.replace(/\\n/g, '\n').trim();
  
  // Check if it has PEM headers
  const hasPEMHeaders = key.includes('-----BEGIN');
  
  if (hasPEMHeaders) {
    // Extract base64 content between headers
    key = key
      .replace(/-----BEGIN[^-]+-----/g, '')
      .replace(/-----END[^-]+-----/g, '')
      .replace(/\s/g, '');
  } else {
    // Raw base64 - just remove any whitespace
    key = key.replace(/\s/g, '');
  }
  
  console.log('[coinbase-test] Key length after parsing:', key.length);
  
  return Uint8Array.from(atob(key), c => c.charCodeAt(0));
}

// Convert SEC1 EC key to JWK format for P-256
function sec1ToJWK(sec1Bytes: Uint8Array): JsonWebKey {
  // SEC1 format for P-256: 0x30 len 0x02 0x01 version 0x04 0x20 privateKey [0xA1 len 0x03 oid] [0xA1 len publicKey]
  // The private key 'd' is 32 bytes for P-256
  
  // Find the private key bytes - look for 0x04 0x20 (OCTET STRING, 32 bytes)
  let privateKeyStart = -1;
  for (let i = 0; i < sec1Bytes.length - 33; i++) {
    if (sec1Bytes[i] === 0x04 && sec1Bytes[i + 1] === 0x20) {
      privateKeyStart = i + 2;
      break;
    }
  }
  
  if (privateKeyStart === -1) {
    throw new Error('Could not find private key in SEC1 structure');
  }
  
  const privateKeyBytes = sec1Bytes.slice(privateKeyStart, privateKeyStart + 32);
  const d = base64urlEncode(privateKeyBytes);
  
  // For signing, we only need the private key 'd' parameter
  // The public key can be derived, but for ES256 signing we need x, y too
  // Let's find the public key - it's after 0xA1 tag, then 0x03 0x42 0x00 0x04 (uncompressed point)
  let publicKeyStart = -1;
  for (let i = privateKeyStart + 32; i < sec1Bytes.length - 65; i++) {
    if (sec1Bytes[i] === 0x03 && sec1Bytes[i + 1] === 0x42 && 
        sec1Bytes[i + 2] === 0x00 && sec1Bytes[i + 3] === 0x04) {
      publicKeyStart = i + 4;
      break;
    }
  }
  
  if (publicKeyStart === -1) {
    throw new Error('Could not find public key in SEC1 structure');
  }
  
  const x = base64urlEncode(sec1Bytes.slice(publicKeyStart, publicKeyStart + 32));
  const y = base64urlEncode(sec1Bytes.slice(publicKeyStart + 32, publicKeyStart + 64));
  
  return {
    kty: 'EC',
    crv: 'P-256',
    d,
    x,
    y,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const keyName = Deno.env.get('COINBASE_KEY_NAME');
  const privateKeyInput = Deno.env.get('COINBASE_PRIVATE_KEY');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[coinbase-test] Starting connection test...');

    if (!keyName || !privateKeyInput) {
      console.log('[coinbase-test] Missing credentials');
      
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
          error: 'Missing COINBASE_KEY_NAME or COINBASE_PRIVATE_KEY secrets.',
          provider: 'coinbase'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[coinbase-test] Key name:', keyName.substring(0, 50) + '...');
    
    // Parse the private key bytes
    const keyBytes = parsePrivateKey(privateKeyInput);
    console.log('[coinbase-test] Parsed key bytes:', keyBytes.length);
    
    // Convert SEC1 to JWK
    const jwk = sec1ToJWK(keyBytes);
    console.log('[coinbase-test] JWK created with d length:', jwk.d?.length);
    
    // Import as CryptoKey
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    
    const method = 'GET';
    const path = '/api/v3/brokerage/accounts';
    const now = Math.floor(Date.now() / 1000);
    
    // Build JWT header and payload
    const header = {
      alg: 'ES256',
      typ: 'JWT',
      kid: keyName,
      nonce: randomHex(16),
    };
    
    const payload = {
      sub: keyName,
      iss: 'cdp',
      nbf: now,
      exp: now + 120,
      uri: `${method} api.coinbase.com${path}`,
    };
    
    const encodedHeader = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const encodedPayload = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    
    // Sign the token
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(unsignedToken)
    );
    
    const jwt = `${unsignedToken}.${base64urlEncode(new Uint8Array(signature))}`;
    console.log('[coinbase-test] JWT generated, calling Coinbase API...');

    const response = await fetch(`https://api.coinbase.com${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[coinbase-test] Coinbase error:', response.status, JSON.stringify(data));
      
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
