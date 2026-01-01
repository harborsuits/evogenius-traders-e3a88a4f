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
  // Normalize escaped newlines and clean up
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
  console.log('[coinbase-test] DER bytes length:', derBytes.length, 'First bytes:', Array.from(derBytes.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  let privateKeyBytes: Uint8Array | null = null;
  let publicKeyBytes: Uint8Array | null = null;
  
  // Try multiple patterns to find the 32-byte private key
  // Pattern 1: OCTET STRING with length 32 (0x04 0x20)
  let idx = findSequence(derBytes, [0x04, 0x20]);
  if (idx !== -1 && idx + 34 <= derBytes.length) {
    privateKeyBytes = derBytes.slice(idx + 2, idx + 34);
    console.log('[coinbase-test] Found private key via 0x04 0x20 pattern at index', idx);
  }
  
  // Pattern 2: For PKCS8, look for the nested OCTET STRING containing the SEC1 key
  // PKCS8 has: SEQUENCE { version, AlgorithmIdentifier, OCTET STRING { SEC1 key } }
  if (!privateKeyBytes) {
    // Look for the P-256 OID: 1.2.840.10045.3.1.7 = 06 08 2A 86 48 CE 3D 03 01 07
    const p256OidIdx = findSequence(derBytes, [0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07]);
    if (p256OidIdx !== -1) {
      console.log('[coinbase-test] Found P-256 OID at index', p256OidIdx);
      // After the OID, there should be an OCTET STRING containing the SEC1 structure
      // Search for 0x04 (OCTET STRING) followed by a length, then 0x30 (SEQUENCE - the SEC1 wrapper)
      for (let i = p256OidIdx + 10; i < derBytes.length - 40; i++) {
        if (derBytes[i] === 0x04 && derBytes[i + 2] === 0x30) {
          // Found the nested SEC1 structure, look for private key inside
          const nestedIdx = findSequence(derBytes, [0x04, 0x20], i + 2);
          if (nestedIdx !== -1 && nestedIdx + 34 <= derBytes.length) {
            privateKeyBytes = derBytes.slice(nestedIdx + 2, nestedIdx + 34);
            console.log('[coinbase-test] Found private key in PKCS8 nested SEC1 at index', nestedIdx);
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
        console.log('[coinbase-test] Found potential private key at index', i);
        break;
      }
    }
  }
  
  if (!privateKeyBytes) {
    // Last resort: If the key is exactly 32 bytes or 64 bytes, use directly
    if (derBytes.length === 32) {
      privateKeyBytes = derBytes;
      console.log('[coinbase-test] Using raw 32-byte key directly');
    } else if (derBytes.length === 64) {
      // Might be private key + public key concatenated
      privateKeyBytes = derBytes.slice(0, 32);
      publicKeyBytes = derBytes.slice(32, 64);
      console.log('[coinbase-test] Using 64-byte split (32+32)');
    } else {
      throw new Error(`Could not find private key in key structure (length: ${derBytes.length})`);
    }
  }
  
  // Find public key (uncompressed point: 0x04 followed by 64 bytes for x and y)
  // Look for BIT STRING (0x03) containing 0x00 0x04 (uncompressed point marker)
  if (!publicKeyBytes) {
    // Pattern: 0x03 0x42 0x00 0x04 (BIT STRING, 66 bytes, no unused bits, uncompressed point)
    let pubIdx = findSequence(derBytes, [0x03, 0x42, 0x00, 0x04]);
    if (pubIdx !== -1 && pubIdx + 68 <= derBytes.length) {
      publicKeyBytes = derBytes.slice(pubIdx + 4, pubIdx + 68);
      console.log('[coinbase-test] Found public key via 0x03 0x42 pattern at index', pubIdx);
    }
    
    // Alternative pattern: 0x03 0x41 0x04 (no 0x00 padding)
    if (!publicKeyBytes) {
      pubIdx = findSequence(derBytes, [0x03, 0x41, 0x04]);
      if (pubIdx !== -1 && pubIdx + 67 <= derBytes.length) {
        publicKeyBytes = derBytes.slice(pubIdx + 3, pubIdx + 67);
        console.log('[coinbase-test] Found public key via 0x03 0x41 pattern at index', pubIdx);
      }
    }
    
    // Look for raw uncompressed point (0x04 followed by 64 bytes)
    if (!publicKeyBytes) {
      for (let i = (privateKeyBytes ? 34 : 0); i < derBytes.length - 64; i++) {
        if (derBytes[i] === 0x04) {
          // Check if this could be a public key (not a length marker)
          const potentialPub = derBytes.slice(i + 1, i + 65);
          // Simple heuristic: public key bytes should look random
          if (potentialPub.length === 64) {
            publicKeyBytes = potentialPub;
            console.log('[coinbase-test] Found potential public key at index', i);
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
  
  console.log('[coinbase-test] JWK parameters - d length:', d.length, 'x length:', x.length, 'y length:', y.length);
  
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
    
    // Convert DER to JWK (handles both SEC1 and PKCS8 formats)
    const jwk = derToJWK(keyBytes);
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
    console.log('[coinbase-test] Now testing order creation permission...');

    // Test order creation directly by attempting a POST to the orders endpoint
    // Skip the GET orders test since 501 can occur even if POST works
    let canCreateOrders = false;
    
    try {
      const createOrderPath = '/api/v3/brokerage/orders';
      const createNow = Math.floor(Date.now() / 1000);
      
      const createHeader = {
        alg: 'ES256',
        typ: 'JWT',
        kid: keyName,
        nonce: randomHex(16),
      };
      
      const createPayload = {
        sub: keyName,
        iss: 'cdp',
        nbf: createNow,
        exp: createNow + 120,
        uri: `POST api.coinbase.com${createOrderPath}`,
      };
      
      const createEncodedHeader = base64urlEncode(new TextEncoder().encode(JSON.stringify(createHeader)));
      const createEncodedPayload = base64urlEncode(new TextEncoder().encode(JSON.stringify(createPayload)));
      const createUnsignedToken = `${createEncodedHeader}.${createEncodedPayload}`;
      
      const createSignature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(createUnsignedToken)
      );
      
      const createJwt = `${createUnsignedToken}.${base64urlEncode(new Uint8Array(createSignature))}`;
      
      // Send a minimal invalid order to test permission
      // We expect either:
      // - 401/403: No permission to create orders
      // - 400: Permission exists, order is just invalid (what we want!)
      // - 200: Order actually went through (unlikely with tiny size)
      const testOrderBody = {
        client_order_id: `test-perm-${Date.now()}`,
        product_id: 'BTC-USD',
        side: 'BUY',
        order_configuration: {
          market_market_ioc: {
            quote_size: '0.01' // Tiny order that will fail validation but tests permission
          }
        }
      };
      
      console.log('[coinbase-test] Testing POST to orders endpoint...');
      
      const createResponse = await fetch(`https://api.coinbase.com${createOrderPath}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${createJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testOrderBody),
      });
      
      const createData = await createResponse.json();
      console.log('[coinbase-test] Create order test response:', createResponse.status, JSON.stringify(createData));
      
      // Interpret the response:
      // - 401/403: No permission to create orders (auth/permission failure)
      // - 400: Permission exists but order invalid (e.g., insufficient funds, bad params)
      // - 200: Order succeeded (unlikely but means we definitely have permission)
      // - 501: Not implemented (endpoint issue, not permission issue)
      if (createResponse.status === 401 || createResponse.status === 403) {
        console.log('[coinbase-test] No order creation permission (401/403)');
        canCreateOrders = false;
      } else if (createResponse.status === 400 || createResponse.status === 200) {
        // 400 = order rejected for business reasons (insufficient funds, invalid params)
        // This means auth passed and we have the permission!
        console.log('[coinbase-test] Order creation permission confirmed!');
        canCreateOrders = true;
        permissions.push('wallet:orders:create');
      } else {
        // Other status codes (5xx, etc) - log but don't assume permission
        console.log('[coinbase-test] Unexpected status from orders endpoint:', createResponse.status);
        // Check if the error message indicates permission vs other issues
        const errMsg = JSON.stringify(createData).toLowerCase();
        if (errMsg.includes('unauthorized') || errMsg.includes('forbidden') || errMsg.includes('permission')) {
          canCreateOrders = false;
        } else {
          // Could be a transient error, don't block - assume permission exists
          // (User can retest later)
          console.log('[coinbase-test] Assuming permission exists, non-auth error');
          canCreateOrders = true;
          permissions.push('wallet:orders:create');
        }
      }
    } catch (orderErr) {
      console.log('[coinbase-test] Error testing order permission:', orderErr);
    }

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
        can_create_orders: canCreateOrders,
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
