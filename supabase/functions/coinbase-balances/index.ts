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

function sec1ToJWK(sec1Bytes: Uint8Array): JsonWebKey {
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
    const jwk = sec1ToJWK(keyBytes);
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
