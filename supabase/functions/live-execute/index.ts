import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= SAFETY CONSTANTS =============
// These are non-negotiable hard limits

// Maximum USD to risk in live trading (can be overridden in system_config)
const DEFAULT_LIVE_CAP_USD = 100;

// Fee buffer percentage (leave room for trading fees)
const FEE_BUFFER_PCT = 0.01; // 1%

// Maximum allowed slippage percentage
const MAX_SLIPPAGE_PCT = 0.005; // 0.5%

// ============= COINBASE JWT HELPERS =============

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

// ============= INTERFACES =============

interface ExecuteTradeRequest {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  orderType?: 'market' | 'limit';
  limitPrice?: number;
  agentId?: string;
  generationId?: string;
  tags?: Record<string, unknown>;
}

interface CoinbaseAccount {
  uuid: string;
  currency: string;
  available_balance: { value: string; currency: string };
  hold: { value: string; currency: string };
}

interface LiveSafetyCheck {
  passed: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

// ============= LOGGING =============

async function logLiveEvent(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  action: string,
  metadata: Record<string, unknown>
) {
  try {
    await supabase.from('control_events').insert({
      action,
      metadata: { ...metadata, execution_mode: 'live' },
      triggered_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[live-execute] Failed to log event:', err);
  }
}

// ============= MAIN HANDLER =============

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const body: ExecuteTradeRequest = await req.json();
    console.log('[live-execute] Received live trade request:', body);

    // ============= GATE 1: Validate credentials exist =============
    const keyName = Deno.env.get('COINBASE_KEY_NAME');
    const privateKeyInput = Deno.env.get('COINBASE_PRIVATE_KEY');

    if (!keyName || !privateKeyInput) {
      const reason = 'BLOCKED_NO_CREDENTIALS';
      console.log(`[live-execute] ${reason}`);
      
      await logLiveEvent(supabase, 'live_trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: reason,
      });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          blocked: true, 
          reason,
          error: 'Coinbase API credentials not configured'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= GATE 2: Verify system is armed for live =============
    const { data: systemState } = await supabase
      .from('system_state')
      .select('trade_mode, live_armed_until, current_generation_id')
      .limit(1)
      .single();

    const liveArmedUntil = systemState?.live_armed_until;
    const isArmed = liveArmedUntil && new Date(liveArmedUntil) > new Date();

    if (!isArmed) {
      const reason = 'BLOCKED_LIVE_NOT_ARMED';
      console.log(`[live-execute] ${reason}`);
      
      await logLiveEvent(supabase, 'live_trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: reason,
        armed_until: liveArmedUntil,
      });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          blocked: true, 
          reason,
          error: 'Live trading requires ARM. System is not armed.'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= GATE 3: Get live cap from config =============
    const { data: configData } = await supabase
      .from('system_config')
      .select('config')
      .limit(1)
      .maybeSingle();

    const config = configData?.config as Record<string, unknown> | null;
    const liveCapUsd = (config?.live_cap_usd as number) ?? DEFAULT_LIVE_CAP_USD;
    console.log(`[live-execute] Live cap: $${liveCapUsd}`);

    // ============= GATE 4: Fetch Coinbase balances =============
    console.log('[live-execute] Fetching Coinbase account balances...');
    
    const keyBytes = parsePrivateKey(privateKeyInput);
    const jwk = sec1ToJWK(keyBytes);
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );

    const accountsPath = '/api/v3/brokerage/accounts';
    const accountsJwt = await generateJWT(keyName, privateKey, 'GET', accountsPath);

    const accountsResponse = await fetch(`https://api.coinbase.com${accountsPath}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accountsJwt}`,
        'Content-Type': 'application/json',
      },
    });

    if (!accountsResponse.ok) {
      const errorData = await accountsResponse.json();
      console.error('[live-execute] Failed to fetch accounts:', errorData);
      
      await logLiveEvent(supabase, 'live_trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: 'BLOCKED_COINBASE_ERROR',
        error: errorData.message || accountsResponse.statusText,
      });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          blocked: true, 
          reason: 'BLOCKED_COINBASE_ERROR',
          error: 'Failed to verify account balances'
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accountsData = await accountsResponse.json();
    const accounts: CoinbaseAccount[] = accountsData.accounts || [];

    // Find USD account
    const usdAccount = accounts.find(a => a.currency === 'USD');
    const availableCash = parseFloat(usdAccount?.available_balance?.value || '0');
    const holdCash = parseFloat(usdAccount?.hold?.value || '0');

    console.log(`[live-execute] USD balance: available=$${availableCash}, hold=$${holdCash}`);

    // ============= GATE 5: CASH-ONLY GUARD (CRITICAL) =============
    // This is the non-negotiable "never spend more than cash" rule

    // Get current market price
    const { data: marketData } = await supabase
      .from('market_data')
      .select('price')
      .eq('symbol', body.symbol)
      .single();

    const currentPrice = marketData?.price || 0;
    if (!currentPrice) {
      const reason = 'BLOCKED_NO_PRICE';
      console.log(`[live-execute] ${reason}: No price for ${body.symbol}`);
      
      await logLiveEvent(supabase, 'live_trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: reason,
      });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          blocked: true, 
          reason,
          error: 'Cannot execute without current market price'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate order cost with slippage buffer
    const slippageBuffer = 1 + MAX_SLIPPAGE_PCT;
    const estimatedPrice = currentPrice * slippageBuffer;
    const orderCost = body.side === 'buy' ? body.qty * estimatedPrice : 0;
    const feeBuffer = orderCost * FEE_BUFFER_PCT;
    const totalRequired = orderCost + feeBuffer;

    // Calculate truly available cash (minus holds and cap)
    const maxAllowedByBalance = availableCash - holdCash;
    const maxAllowedByCap = liveCapUsd;
    const maxAllowed = Math.min(maxAllowedByBalance, maxAllowedByCap);

    console.log(`[live-execute] Cash guard: orderCost=$${orderCost.toFixed(2)}, feeBuffer=$${feeBuffer.toFixed(2)}, totalRequired=$${totalRequired.toFixed(2)}, maxAllowed=$${maxAllowed.toFixed(2)}`);

    if (body.side === 'buy' && totalRequired > maxAllowed) {
      const reason = 'BLOCKED_INSUFFICIENT_CASH';
      console.log(`[live-execute] ${reason}: Need $${totalRequired.toFixed(2)}, have $${maxAllowed.toFixed(2)}`);
      
      await logLiveEvent(supabase, 'live_trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: reason,
        order_cost: orderCost,
        fee_buffer: feeBuffer,
        total_required: totalRequired,
        available_cash: availableCash,
        hold_cash: holdCash,
        live_cap: liveCapUsd,
        max_allowed: maxAllowed,
      });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          blocked: true, 
          reason,
          error: `Insufficient cash. Need $${totalRequired.toFixed(2)}, max allowed is $${maxAllowed.toFixed(2)}`,
          details: {
            order_cost: orderCost,
            available_cash: availableCash,
            hold_cash: holdCash,
            live_cap: liveCapUsd,
          }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For sells, check we have the asset
    if (body.side === 'sell') {
      const baseCurrency = body.symbol.split('-')[0];
      const assetAccount = accounts.find(a => a.currency === baseCurrency);
      const availableQty = parseFloat(assetAccount?.available_balance?.value || '0');

      if (body.qty > availableQty) {
        const reason = 'BLOCKED_INSUFFICIENT_ASSET';
        console.log(`[live-execute] ${reason}: Need ${body.qty} ${baseCurrency}, have ${availableQty}`);
        
        await logLiveEvent(supabase, 'live_trade_blocked', {
          symbol: body.symbol,
          side: body.side,
          qty: body.qty,
          block_reason: reason,
          available_qty: availableQty,
          base_currency: baseCurrency,
        });

        return new Response(
          JSON.stringify({ 
            ok: false, 
            blocked: true, 
            reason,
            error: `Insufficient ${baseCurrency}. Need ${body.qty}, have ${availableQty}`
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============= GATE 6: Check API has trade permission =============
    // Note: This will fail if the key doesn't have wallet:orders:create permission
    // We'll detect this by attempting the order and checking the response

    // ============= ALL GATES PASSED - EXECUTE LIVE ORDER =============
    console.log('[live-execute] All safety gates passed. Placing live order...');

    // Convert symbol format (BTC-USD -> BTC-USD is already correct for Coinbase Advanced Trade)
    const orderPayload = {
      client_order_id: `live_${Date.now()}_${randomHex(4)}`,
      product_id: body.symbol,
      side: body.side.toUpperCase(),
      order_configuration: body.orderType === 'limit' && body.limitPrice
        ? {
            limit_limit_gtc: {
              base_size: body.qty.toString(),
              limit_price: body.limitPrice.toString(),
            }
          }
        : {
            market_market_ioc: {
              quote_size: body.side === 'buy' ? totalRequired.toString() : undefined,
              base_size: body.side === 'sell' ? body.qty.toString() : undefined,
            }
          }
    };

    console.log('[live-execute] Order payload:', JSON.stringify(orderPayload));

    const orderPath = '/api/v3/brokerage/orders';
    const orderJwt = await generateJWT(keyName, privateKey, 'POST', orderPath);

    const orderResponse = await fetch(`https://api.coinbase.com${orderPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orderJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    const orderData = await orderResponse.json();
    console.log('[live-execute] Coinbase response:', JSON.stringify(orderData));

    if (!orderResponse.ok) {
      // Check if it's a permission error
      const isPermissionError = orderData.error === 'PERMISSION_DENIED' || 
                                orderData.message?.includes('permission') ||
                                orderResponse.status === 403;

      const reason = isPermissionError ? 'BLOCKED_NO_TRADE_PERMISSION' : 'BLOCKED_ORDER_REJECTED';
      
      await logLiveEvent(supabase, 'live_trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: reason,
        coinbase_error: orderData.message || orderData.error,
        http_status: orderResponse.status,
      });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          blocked: true, 
          reason,
          error: isPermissionError 
            ? 'API key does not have trade permission. Update Coinbase API key with wallet:orders:create permission.'
            : orderData.message || 'Order rejected by Coinbase',
          coinbase_response: orderData,
        }),
        { status: orderResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= SUCCESS - LOG AND RETURN =============
    const orderId = orderData.success_response?.order_id || orderData.order_id;
    
    await logLiveEvent(supabase, 'live_trade_executed', {
      symbol: body.symbol,
      side: body.side,
      qty: body.qty,
      order_id: orderId,
      order_cost: orderCost,
      agent_id: body.agentId,
      generation_id: systemState?.current_generation_id,
      coinbase_response: orderData,
    });

    console.log(`[live-execute] ✅ Live order placed successfully: ${orderId}`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        mode: 'live',
        order_id: orderId,
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        estimated_cost: orderCost,
        coinbase_response: orderData,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[live-execute] Unexpected error:', error);
    
    await logLiveEvent(supabase, 'live_trade_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error instanceof Error ? error.message : 'Unexpected error in live execution'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
