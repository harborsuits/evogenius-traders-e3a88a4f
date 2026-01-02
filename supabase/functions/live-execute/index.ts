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
function derToJWK(derBytes: Uint8Array): JsonWebKey {
  let privateKeyBytes: Uint8Array | null = null;
  let publicKeyBytes: Uint8Array | null = null;
  
  // Pattern 1: OCTET STRING with length 32 (0x04 0x20)
  let idx = findSequence(derBytes, [0x04, 0x20]);
  if (idx !== -1 && idx + 34 <= derBytes.length) {
    privateKeyBytes = derBytes.slice(idx + 2, idx + 34);
  }
  
  // Pattern 2: For PKCS8, look for P-256 OID
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
  
  // Pattern 3: Scan for any 32-byte sequence after 0x04 0x20
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
      throw new Error(`Could not find private key (length: ${derBytes.length})`);
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
  // NEW: Canary hard-lock fields
  arm_session_id?: string;
  request_id?: string;
  // NEW: Direct USD quote for BUY orders (avoids qty*price calculation)
  quote_usd?: number;
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

    // Generate request_id if not provided (for idempotency)
    const requestId = body.request_id || crypto.randomUUID();
    console.log(`[live-execute] Request ID: ${requestId}`);

    // ============= GATE 0: Validate credentials exist =============
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
        request_id: requestId,
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

    // ============= GATE 1: Verify system is armed for live =============
    // IMPORTANT: Check ARM status BEFORE spending session to avoid wasting sessions
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
        request_id: requestId,
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

    // ============= GATE 2: CANARY HARD-LOCK (ONE ORDER PER ARM) =============
    // This is the non-negotiable atomic spend check
    // Now happens AFTER ARM check so sessions aren't wasted on expired ARM
    
    if (!body.arm_session_id) {
      const reason = 'BLOCKED_NO_SESSION';
      console.log(`[live-execute] ${reason}: arm_session_id is required`);
      
      await logLiveEvent(supabase, 'live_trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: reason,
        request_id: requestId,
      });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          blocked: true, 
          reason,
          error: 'Missing arm_session_id. ARM the system first to get a session token.'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atomically spend the ARM session using the database function
    console.log(`[live-execute] Attempting to spend ARM session: ${body.arm_session_id}`);
    
    const { data: spendResult, error: spendError } = await supabase
      .rpc('spend_arm_session', {
        session_id: body.arm_session_id,
        request_id: requestId,
      });

    if (spendError) {
      console.error('[live-execute] Spend RPC error:', spendError);
      throw spendError;
    }

    const spendRow = spendResult?.[0];
    console.log('[live-execute] Spend result:', spendRow);

    if (!spendRow?.success) {
      const reason = spendRow?.reason || 'CANARY_SPEND_FAILED';
      console.log(`[live-execute] ${reason}`);
      
      await logLiveEvent(supabase, 'live_trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: reason,
        arm_session_id: body.arm_session_id,
        request_id: requestId,
      });

      // Use 409 Conflict for already-consumed canary
      const statusCode = reason === 'CANARY_ALREADY_CONSUMED' ? 409 : 403;
      
      return new Response(
        JSON.stringify({ 
          ok: false, 
          blocked: true, 
          reason,
          error: reason === 'CANARY_ALREADY_CONSUMED' 
            ? 'This ARM session has already been used. Disarm and re-ARM for a new order.'
            : reason === 'SESSION_EXPIRED'
            ? 'ARM session has expired. Re-ARM to continue.'
            : 'ARM session validation failed.'
        }),
        { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[live-execute] ✅ ARM session spent successfully. Proceeding with order...');

    // ============= GATE 3: Get live cap + canary limits from config =============
    const { data: configData } = await supabase
      .from('system_config')
      .select('config')
      .limit(1)
      .maybeSingle();

    const config = configData?.config as Record<string, unknown> | null;
    const liveCapUsd = (config?.live_cap_usd as number) ?? DEFAULT_LIVE_CAP_USD;
    
    // Canary limits
    const canaryLimits = (config?.canary_limits as Record<string, unknown>) ?? {};
    const maxUsdPerTrade = (canaryLimits.max_usd_per_trade as number) ?? 5;
    const autoDisarmAfterTrade = (canaryLimits.auto_disarm_after_trade as boolean) ?? true;
    const maxTradesPerDay = (canaryLimits.max_trades_per_day as number) ?? 3;
    
    console.log(`[live-execute] Live cap: $${liveCapUsd}, Max per trade: $${maxUsdPerTrade}, Auto-disarm: ${autoDisarmAfterTrade}`);

    // ============= GATE 3b: Daily trade limit check =============
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const { count: todayTradeCount } = await supabase
      .from('control_events')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'live_trade_executed')
      .gte('triggered_at', todayStart.toISOString());
    
    if ((todayTradeCount ?? 0) >= maxTradesPerDay) {
      const reason = 'BLOCKED_DAILY_LIMIT';
      console.log(`[live-execute] ${reason}: ${todayTradeCount}/${maxTradesPerDay} trades today`);
      
      await logLiveEvent(supabase, 'live_trade_blocked', {
        symbol: body.symbol,
        side: body.side,
        qty: body.qty,
        block_reason: reason,
        trades_today: todayTradeCount,
        daily_limit: maxTradesPerDay,
        request_id: requestId,
      });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          blocked: true, 
          reason,
          error: `Daily limit reached. ${todayTradeCount}/${maxTradesPerDay} trades executed today.`,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NEW: If quote_usd is provided, use it directly (for BUY canary orders)
    const useQuoteUsd = body.side === 'buy' && body.quote_usd && body.quote_usd > 0;
    if (useQuoteUsd) {
      console.log(`[live-execute] Using quote_usd mode: $${body.quote_usd}`);
    }

    // ============= GATE 4: Fetch Coinbase balances =============
    console.log('[live-execute] Fetching Coinbase account balances...');
    
    const keyBytes = parsePrivateKey(privateKeyInput);
    const jwk = derToJWK(keyBytes);
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
        request_id: requestId,
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
        request_id: requestId,
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

    // Calculate truly available cash (minus holds, cap, AND per-trade limit)
    const maxAllowedByBalance = availableCash - holdCash;
    const maxAllowedByCap = liveCapUsd;
    const maxAllowedByCanary = maxUsdPerTrade;
    const maxAllowed = Math.min(maxAllowedByBalance, maxAllowedByCap, maxAllowedByCanary);
    
    console.log(`[live-execute] Max allowed: balance=$${maxAllowedByBalance.toFixed(2)}, cap=$${maxAllowedByCap}, canary=$${maxAllowedByCanary}, final=$${maxAllowed.toFixed(2)}`);

    // Calculate order cost with slippage buffer
    // NEW: If quote_usd is provided, use it directly instead of qty * price
    const slippageBuffer = 1 + MAX_SLIPPAGE_PCT;
    let orderCost: number;
    let finalQuoteSize: number;

    if (useQuoteUsd && body.quote_usd) {
      // Clamp quote_usd to maxAllowed (respects canary limit)
      finalQuoteSize = Math.min(body.quote_usd, maxAllowed);
      orderCost = finalQuoteSize;
      console.log(`[live-execute] Quote USD mode: requested=$${body.quote_usd}, clamped to canary limit=$${finalQuoteSize}`);
    } else if (body.side === 'buy') {
      const estimatedPrice = currentPrice * slippageBuffer;
      orderCost = body.qty * estimatedPrice;
      // Also clamp to canary limit
      if (orderCost > maxAllowed) {
        console.log(`[live-execute] Order cost $${orderCost.toFixed(2)} exceeds canary limit $${maxAllowed.toFixed(2)}, clamping...`);
        orderCost = maxAllowed;
      }
      finalQuoteSize = orderCost;
    } else {
      orderCost = 0; // Sells don't require cash
      finalQuoteSize = 0;
    }

    const feeBuffer = orderCost * FEE_BUFFER_PCT;
    const totalRequired = orderCost + feeBuffer;

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
        request_id: requestId,
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
          request_id: requestId,
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
    // For BUY with quote_usd, use the clamped finalQuoteSize directly
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
              // For BUY: use finalQuoteSize (which is clamped quote_usd or calculated from qty)
              quote_size: body.side === 'buy' ? finalQuoteSize.toFixed(2) : undefined,
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
        request_id: requestId,
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
      arm_session_id: body.arm_session_id,
      request_id: requestId,
    });

    // Auto-track for loss-reaction logic
    // Note: For live trades, we can't know PnL immediately (market order fills async)
    // We track it as a "live trade event" - the PnL will be calculated when position closes
    // For BUY orders, this is just tracking that a trade happened
    // For SELL orders, we'd need fill data from Coinbase to calculate PnL
    // For now, we log the execution and the loss-reaction will be updated when fills arrive
    try {
      // Only call loss-reaction for SELL orders (closing positions)
      // BUY orders don't have immediate PnL
      if (body.side === 'sell') {
        // Estimate PnL from order cost for immediate feedback
        // This is imprecise but better than nothing for safety brakes
        await supabase.functions.invoke('loss-reaction', {
          body: {
            action: 'trade_completed',
            pnl: 0, // Will be updated when fill data arrives
            symbol: body.symbol,
            trade_id: orderId,
          },
        });
        console.log('[live-execute] Loss-reaction notified of sell order');
      }
    } catch (lrErr) {
      console.error('[live-execute] Failed to notify loss-reaction:', lrErr);
    }

    // ============= AUTO-DISARM after successful trade =============
    if (autoDisarmAfterTrade) {
      console.log('[live-execute] Auto-disarm enabled. Disarming system...');
      try {
        await supabase
          .from('system_state')
          .update({ live_armed_until: null })
          .eq('id', (await supabase.from('system_state').select('id').single()).data?.id);
        
        await logLiveEvent(supabase, 'live_auto_disarmed', {
          reason: 'trade_completed',
          order_id: orderId,
          arm_session_id: body.arm_session_id,
        });
        console.log('[live-execute] System auto-disarmed after trade');
      } catch (disarmErr) {
        console.error('[live-execute] Failed to auto-disarm:', disarmErr);
      }
    }

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
        arm_session_id: body.arm_session_id,
        request_id: requestId,
        auto_disarmed: autoDisarmAfterTrade,
        trades_today: (todayTradeCount ?? 0) + 1,
        daily_limit: maxTradesPerDay,
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