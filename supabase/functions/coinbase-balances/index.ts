import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64urlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function parsePrivateKey(input: string): Uint8Array {
  let key = input.replace(/\\n/g, '\n').trim();
  const hasPEMHeaders = key.includes('-----BEGIN');
  
  if (hasPEMHeaders) {
    key = key
      .replace(/-----BEGIN[^-]+-----/g, '')
      .replace(/-----END[^-]+-----/g, '')
      .replace(/\s/g, '');
  } else {
    key = key.replace(/\s/g, '');
  }
  
  return Uint8Array.from(atob(key), c => c.charCodeAt(0));
}

// Find a byte sequence in an array
function findSequence(arr: Uint8Array, seq: number[], startFrom = 0): number {
  for (let i = startFrom; i <= arr.length - seq.length; i++) {
    let found = true;
    for (let j = 0; j < seq.length; j++) {
      if (arr[i + j] !== seq[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}

// Convert EC private key bytes to JWK format for P-256
// Handles both SEC1 (EC PRIVATE KEY) and PKCS8 (PRIVATE KEY) formats
function derToJWK(derBytes: Uint8Array): JsonWebKey {
  let privateKeyBytes: Uint8Array | null = null;
  let publicKeyBytes: Uint8Array | null = null;
  
  // Try multiple patterns to find the 32-byte private key
  // Pattern 1: OCTET STRING with length 32 (0x04 0x20)
  let idx = findSequence(derBytes, [0x04, 0x20]);
  if (idx !== -1 && idx + 34 <= derBytes.length) {
    privateKeyBytes = derBytes.slice(idx + 2, idx + 34);
  }
  
  // Pattern 2: For PKCS8, look for the nested OCTET STRING containing the SEC1 key
  if (!privateKeyBytes) {
    const p256OidIdx = findSequence(derBytes, [0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07]);
    if (p256OidIdx !== -1) {
      for (let i = p256OidIdx + 10; i < derBytes.length - 40; i++) {
        if (derBytes[i] === 0x04 && derBytes[i + 2] === 0x30) {
          const nestedIdx = findSequence(derBytes, [0x04, 0x20], i + 2);
          if (nestedIdx !== -1 && nestedIdx + 34 <= derBytes.length) {
            privateKeyBytes = derBytes.slice(nestedIdx + 2, nestedIdx + 34);
            break;
          }
        }
      }
    }
  }
  
  // Pattern 3: Just scan for any 32-byte sequence after 0x04 0x20
  if (!privateKeyBytes) {
    for (let i = 0; i < derBytes.length - 33; i++) {
      if (derBytes[i] === 0x04 && derBytes[i + 1] === 0x20) {
        privateKeyBytes = derBytes.slice(i + 2, i + 34);
        break;
      }
    }
  }
  
  if (!privateKeyBytes) {
    if (derBytes.length === 32) {
      privateKeyBytes = derBytes;
    } else if (derBytes.length === 64) {
      privateKeyBytes = derBytes.slice(0, 32);
      publicKeyBytes = derBytes.slice(32, 64);
    } else {
      throw new Error(`Could not find private key in key structure (length: ${derBytes.length})`);
    }
  }
  
  // Find public key
  if (!publicKeyBytes) {
    let pubIdx = findSequence(derBytes, [0x03, 0x42, 0x00, 0x04]);
    if (pubIdx !== -1 && pubIdx + 68 <= derBytes.length) {
      publicKeyBytes = derBytes.slice(pubIdx + 4, pubIdx + 68);
    }
    
    if (!publicKeyBytes) {
      pubIdx = findSequence(derBytes, [0x03, 0x41, 0x04]);
      if (pubIdx !== -1 && pubIdx + 67 <= derBytes.length) {
        publicKeyBytes = derBytes.slice(pubIdx + 3, pubIdx + 67);
      }
    }
    
    if (!publicKeyBytes) {
      for (let i = (privateKeyBytes ? 34 : 0); i < derBytes.length - 64; i++) {
        if (derBytes[i] === 0x04) {
          const potentialPub = derBytes.slice(i + 1, i + 65);
          if (potentialPub.length === 64) {
            publicKeyBytes = potentialPub;
            break;
          }
        }
      }
    }
  }
  
  if (!publicKeyBytes || publicKeyBytes.length !== 64) {
    throw new Error('Could not find public key in key structure');
  }
  
  const d = base64urlEncode(privateKeyBytes);
  const x = base64urlEncode(publicKeyBytes.slice(0, 32));
  const y = base64urlEncode(publicKeyBytes.slice(32, 64));
  
  return { kty: 'EC', crv: 'P-256', d, x, y };
}

async function generateJWT(keyName: string, privateKey: CryptoKey, method: string, path: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
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
  
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );
  
  return `${unsignedToken}.${base64urlEncode(new Uint8Array(signature))}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // === AUTH CHECK ===
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Unauthorized' }),
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
    console.log('[coinbase-balances] Auth failed:', claimsError?.message);
    return new Response(
      JSON.stringify({ ok: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const keyName = Deno.env.get('COINBASE_KEY_NAME');
  const privateKeyInput = Deno.env.get('COINBASE_PRIVATE_KEY');

  try {
    console.log('[coinbase-balances] Fetching account balances...');

    if (!keyName || !privateKeyInput) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing Coinbase credentials' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const keyBytes = parsePrivateKey(privateKeyInput);
    const jwk = derToJWK(keyBytes);
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    
    const method = 'GET';
    const path = '/api/v3/brokerage/accounts';
    const jwt = await generateJWT(keyName, privateKey, method, path);

    const response = await fetch(`https://api.coinbase.com${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[coinbase-balances] Error:', response.status, data);
      return new Response(
        JSON.stringify({ ok: false, error: data.message || `API error: ${response.status}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format the accounts for display
    const accounts = (data.accounts || []).map((acc: {
      uuid: string;
      name: string;
      currency: string;
      available_balance: { value: string; currency: string };
      hold: { value: string; currency: string };
      type: string;
    }) => ({
      id: acc.uuid,
      name: acc.name,
      currency: acc.currency,
      available: parseFloat(acc.available_balance?.value || '0'),
      hold: parseFloat(acc.hold?.value || '0'),
      total: parseFloat(acc.available_balance?.value || '0') + parseFloat(acc.hold?.value || '0'),
      type: acc.type,
    }));

    // Sort by total value (highest first), filter out zero balances optionally
    const sortedAccounts = accounts
      .filter((a: { total: number; currency: string }) => a.total > 0 || a.currency === 'USD')
      .sort((a: { total: number }, b: { total: number }) => b.total - a.total);

    console.log(`[coinbase-balances] Found ${sortedAccounts.length} accounts with balances`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        accounts: sortedAccounts,
        total_accounts: data.accounts?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch balances';
    console.error('[coinbase-balances] Error:', errorMessage);
    
    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
