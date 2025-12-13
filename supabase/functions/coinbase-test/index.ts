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

// Parse PEM key to raw bytes and detect format
function parsePEMKey(pem: string): { bytes: Uint8Array; format: 'pkcs8' | 'sec1' } {
  // Handle escaped newlines from environment variables
  const normalizedPem = pem.replace(/\\n/g, '\n');
  
  const isPKCS8 = normalizedPem.includes('BEGIN PRIVATE KEY');
  const isSEC1 = normalizedPem.includes('BEGIN EC PRIVATE KEY');
  
  console.log('[coinbase-test] Key format detected:', isPKCS8 ? 'PKCS8' : isSEC1 ? 'SEC1/EC' : 'unknown');
  
  const pemContents = normalizedPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN EC PRIVATE KEY-----/g, '')
    .replace(/-----END EC PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  
  return {
    bytes: Uint8Array.from(atob(pemContents), c => c.charCodeAt(0)),
    format: isPKCS8 ? 'pkcs8' : 'sec1'
  };
}

// Convert SEC1 EC private key to PKCS#8 format
// SEC1 is just the raw EC key, PKCS#8 wraps it with algorithm identifier
function sec1ToPKCS8(sec1Bytes: Uint8Array): Uint8Array {
  // PKCS#8 header for P-256 EC key
  const pkcs8Header = new Uint8Array([
    0x30, 0x81, 0x87,                         // SEQUENCE, length
    0x02, 0x01, 0x00,                         // INTEGER version = 0
    0x30, 0x13,                               // SEQUENCE (algorithm identifier)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID 1.2.840.10045.2.1 (ecPublicKey)
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID 1.2.840.10045.3.1.7 (P-256)
    0x04, 0x6d,                               // OCTET STRING, length
  ]);
  
  // Combine header with SEC1 key
  const result = new Uint8Array(pkcs8Header.length + sec1Bytes.length);
  result.set(pkcs8Header, 0);
  result.set(sec1Bytes, pkcs8Header.length);
  
  // Fix the outer SEQUENCE length (position 2)
  result[2] = sec1Bytes.length + pkcs8Header.length - 4;
  // Fix the OCTET STRING length (last byte of header)
  result[pkcs8Header.length - 1] = sec1Bytes.length;
  
  return result;
}

// Generate JWT for Coinbase Advanced Trade API
async function generateCoinbaseJWT(
  keyName: string,
  privateKeyPem: string,
  method: string,
  path: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  // JWT Header per Coinbase docs
  const header = {
    alg: 'ES256',
    typ: 'JWT',
    kid: keyName,
    nonce: randomHex(16),
  };

  // JWT Payload per Coinbase docs
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

  // Parse PEM key and detect format
  const { bytes: keyBytes, format } = parsePEMKey(privateKeyPem);
  
  // Convert SEC1 to PKCS8 if needed
  const pkcs8Bytes = format === 'sec1' ? sec1ToPKCS8(keyBytes) : keyBytes;

  // Import the private key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the token
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  // WebCrypto returns signature in IEEE P1363 format (r||s), which is what we need
  const encodedSignature = base64urlEncode(new Uint8Array(signatureBuffer));
  return `${unsignedToken}.${encodedSignature}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const keyName = Deno.env.get('COINBASE_KEY_NAME');
  const privateKey = Deno.env.get('COINBASE_PRIVATE_KEY');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[coinbase-test] Starting connection test...');

    if (!keyName || !privateKey) {
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

    const method = 'GET';
    const path = '/api/v3/brokerage/accounts';
    
    console.log('[coinbase-test] Key name prefix:', keyName.substring(0, 40) + '...');
    
    const jwt = await generateCoinbaseJWT(keyName, privateKey, method, path);
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
