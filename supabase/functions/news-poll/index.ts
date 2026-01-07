import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate a hash for deduplication
function hashId(source: string, url: string): string {
  const str = `${source}:${url}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${source}_${Math.abs(hash).toString(36)}`;
}

// Extract symbols from title/text
function extractSymbols(text: string, knownSymbols: string[]): string[] {
  const found: string[] = [];
  const upperText = text.toUpperCase();
  
  for (const symbol of knownSymbols) {
    // Remove -USD suffix for matching
    const base = symbol.replace('-USD', '');
    // Match whole word only
    const regex = new RegExp(`\\b${base}\\b`, 'i');
    if (regex.test(upperText)) {
      found.push(symbol);
    }
  }
  
  return [...new Set(found)];
}

// Get 15-minute bucket start for correlation
function getBucketStart(date: Date): string {
  const minutes = Math.floor(date.getMinutes() / 15) * 15;
  const bucket = new Date(date);
  bucket.setMinutes(minutes, 0, 0);
  return bucket.toISOString();
}

interface CryptoPanicItem {
  id: number;
  title: string;
  url: string;
  published_at: string;
  source: { title: string };
  currencies?: { code: string }[];
  votes?: { positive: number; negative: number; important: number };
}

async function fetchCryptoPanic(apiKey: string): Promise<CryptoPanicItem[]> {
  try {
    const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&filter=hot&public=true`;
    console.log('[news-poll] Fetching CryptoPanic...');
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[news-poll] CryptoPanic error:', response.status);
      return [];
    }
    
    const data = await response.json();
    console.log(`[news-poll] CryptoPanic returned ${data.results?.length || 0} items`);
    return data.results || [];
  } catch (error) {
    console.error('[news-poll] CryptoPanic fetch error:', error);
    return [];
  }
}

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  tag?: string;
}

// Generic RSS parser
function parseRSSItems(text: string, maxItems = 20): RSSItem[] {
  const items: RSSItem[] = [];
  const itemMatches = text.match(/<item>[\s\S]*?<\/item>/g) || [];
  
  for (const itemXml of itemMatches.slice(0, maxItems)) {
    const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    const linkMatch = itemXml.match(/<link>(.*?)<\/link>|<link><!\[CDATA\[(.*?)\]\]><\/link>/);
    const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
    
    if (titleMatch && linkMatch) {
      items.push({
        title: (titleMatch[1] || titleMatch[2] || '').trim(),
        link: (linkMatch[1] || linkMatch[2] || '').trim(),
        pubDate: pubDateMatch?.[1] || new Date().toISOString(),
      });
    }
  }
  
  return items;
}

async function fetchCoinDesk(): Promise<RSSItem[]> {
  try {
    const url = 'https://www.coindesk.com/arc/outboundfeeds/rss/';
    console.log('[news-poll] Fetching CoinDesk RSS...');
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[news-poll] CoinDesk error:', response.status);
      return [];
    }
    
    const text = await response.text();
    const items = parseRSSItems(text, 20);
    
    console.log(`[news-poll] CoinDesk returned ${items.length} items`);
    return items;
  } catch (error) {
    console.error('[news-poll] CoinDesk fetch error:', error);
    return [];
  }
}

// Tag to symbol mapping for Cointelegraph
const TAG_TO_SYMBOL: Record<string, string> = {
  bitcoin: 'BTC-USD',
  ethereum: 'ETH-USD',
  solana: 'SOL-USD',
  xrp: 'XRP-USD',
  dogecoin: 'DOGE-USD',
  defi: '',       // Not a tradeable symbol
  regulation: '', // Not a tradeable symbol
};

// Cointelegraph RSS feeds
const COINTELEGRAPH_FEEDS = [
  { url: 'https://cointelegraph.com/rss', tag: null },
  { url: 'https://cointelegraph.com/rss/tag/bitcoin', tag: 'bitcoin' },
  { url: 'https://cointelegraph.com/rss/tag/ethereum', tag: 'ethereum' },
  { url: 'https://cointelegraph.com/rss/tag/solana', tag: 'solana' },
  { url: 'https://cointelegraph.com/rss/tag/xrp', tag: 'xrp' },
  { url: 'https://cointelegraph.com/rss/tag/defi', tag: 'defi' },
  { url: 'https://cointelegraph.com/rss/tag/regulation', tag: 'regulation' },
];

async function fetchCointelegraph(): Promise<RSSItem[]> {
  const allItems: RSSItem[] = [];
  const seenUrls = new Set<string>();
  
  for (const feed of COINTELEGRAPH_FEEDS) {
    try {
      console.log(`[news-poll] Fetching Cointelegraph ${feed.tag || 'global'}...`);
      
      const response = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' }
      });
      
      if (!response.ok) {
        console.error(`[news-poll] Cointelegraph ${feed.tag || 'global'} error:`, response.status);
        continue;
      }
      
      const text = await response.text();
      const items = parseRSSItems(text, 15);
      
      for (const item of items) {
        // Dedupe across tag feeds
        if (!seenUrls.has(item.link)) {
          seenUrls.add(item.link);
          allItems.push({ ...item, tag: feed.tag || undefined });
        }
      }
    } catch (error) {
      console.error(`[news-poll] Cointelegraph ${feed.tag || 'global'} fetch error:`, error);
    }
  }
  
  console.log(`[news-poll] Cointelegraph returned ${allItems.length} unique items`);
  return allItems;
}

async function fetchDecrypt(): Promise<RSSItem[]> {
  try {
    const url = 'https://decrypt.co/feed';
    console.log('[news-poll] Fetching Decrypt RSS...');
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' }
    });
    
    if (!response.ok) {
      console.error('[news-poll] Decrypt error:', response.status);
      return [];
    }
    
    const text = await response.text();
    const items = parseRSSItems(text, 20);
    
    console.log(`[news-poll] Decrypt returned ${items.length} items`);
    return items;
  } catch (error) {
    console.error('[news-poll] Decrypt fetch error:', error);
    return [];
  }
}

async function fetchTheBlock(): Promise<RSSItem[]> {
  try {
    const url = 'https://www.theblock.co/rss.xml';
    console.log('[news-poll] Fetching The Block RSS...');
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' }
    });
    
    if (!response.ok) {
      console.error('[news-poll] The Block error:', response.status);
      return [];
    }
    
    const text = await response.text();
    const items = parseRSSItems(text, 20);
    
    console.log(`[news-poll] The Block returned ${items.length} items`);
    return items;
  } catch (error) {
    console.error('[news-poll] The Block fetch error:', error);
    return [];
  }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check - supports JWT OR internal secret (for cron)
  const internalSecret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const hasInternalAuth = internalSecret && expectedSecret && internalSecret === expectedSecret;
  
  if (!hasInternalAuth) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[news-poll] No auth provided');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // For user calls, we just check header exists (service role handles actual auth)
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cryptoPanicKey = Deno.env.get('CRYPTOPANIC_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get known symbols from market_data
    const { data: marketData } = await supabase
      .from('market_data')
      .select('symbol');
    
    const knownSymbols = (marketData || []).map(m => m.symbol);
    console.log(`[news-poll] Known symbols: ${knownSymbols.length}`);
    
    const newsItems: Array<{
      id: string;
      source: string;
      outlet: string | null;
      title: string;
      url: string;
      published_at: string;
      symbols: string[];
      importance: number;
      raw: Record<string, unknown>;
    }> = [];
    
    // Fetch from CryptoPanic if API key available
    if (cryptoPanicKey) {
      const cpItems = await fetchCryptoPanic(cryptoPanicKey);
      
      for (const item of cpItems) {
        // Skip items without URL
        if (!item.url) {
          console.log(`[news-poll] Skipping CryptoPanic item without URL: ${item.title?.slice(0, 50)}`);
          continue;
        }
        
        const symbols = item.currencies?.map(c => `${c.code}-USD`) || [];
        const extractedSymbols = extractSymbols(item.title, knownSymbols);
        const allSymbols = [...new Set([...symbols, ...extractedSymbols])];
        
        const importance = item.votes 
          ? (item.votes.positive + item.votes.important) - item.votes.negative 
          : 0;
        
        newsItems.push({
          id: hashId('cryptopanic', item.url),
          source: 'cryptopanic',
          outlet: item.source?.title || null,
          title: item.title,
          url: item.url,
          published_at: item.published_at,
          symbols: allSymbols.filter(s => knownSymbols.includes(s)),
          importance,
          raw: item as unknown as Record<string, unknown>,
        });
      }
    } else {
      console.log('[news-poll] No CRYPTOPANIC_API_KEY, skipping...');
    }
    
    // Fetch from CoinDesk
    const cdItems = await fetchCoinDesk();
    
    for (const item of cdItems) {
      const symbols = extractSymbols(item.title, knownSymbols);
      
      newsItems.push({
        id: hashId('coindesk', item.link),
        source: 'coindesk',
        outlet: 'CoinDesk',
        title: item.title,
        url: item.link,
        published_at: new Date(item.pubDate).toISOString(),
        symbols,
        importance: 0,
        raw: {
          ...item,
          source_type: 'rss',
          ingest_cost: 'free',
          content_class: 'news',
        } as unknown as Record<string, unknown>,
      });
    }
    
    // Fetch from Cointelegraph
    const ctItems = await fetchCointelegraph();
    
    for (const item of ctItems) {
      const symbols = extractSymbols(item.title, knownSymbols);
      // Map tag to symbol using explicit mapping
      if (item.tag) {
        const mappedSymbol = TAG_TO_SYMBOL[item.tag];
        if (mappedSymbol && knownSymbols.includes(mappedSymbol) && !symbols.includes(mappedSymbol)) {
          symbols.push(mappedSymbol);
        }
      }
      
      newsItems.push({
        id: hashId('cointelegraph', item.link),
        source: 'cointelegraph',
        outlet: 'Cointelegraph',
        title: item.title,
        url: item.link,
        published_at: new Date(item.pubDate).toISOString(),
        symbols,
        importance: 0,
        raw: {
          ...item,
          source_type: 'rss',
          ingest_cost: 'free',
          content_class: 'news',
        } as unknown as Record<string, unknown>,
      });
    }
    
    // Fetch from Decrypt
    const dcItems = await fetchDecrypt();
    
    for (const item of dcItems) {
      const symbols = extractSymbols(item.title, knownSymbols);
      
      newsItems.push({
        id: hashId('decrypt', item.link),
        source: 'decrypt',
        outlet: 'Decrypt',
        title: item.title,
        url: item.link,
        published_at: new Date(item.pubDate).toISOString(),
        symbols,
        importance: 0,
        raw: {
          ...item,
          source_type: 'rss',
          ingest_cost: 'free',
          content_class: 'news',
        } as unknown as Record<string, unknown>,
      });
    }
    
    // Fetch from The Block
    const tbItems = await fetchTheBlock();
    
    for (const item of tbItems) {
      const symbols = extractSymbols(item.title, knownSymbols);
      
      newsItems.push({
        id: hashId('theblock', item.link),
        source: 'theblock',
        outlet: 'The Block',
        title: item.title,
        url: item.link,
        published_at: new Date(item.pubDate).toISOString(),
        symbols,
        importance: 0,
        raw: {
          ...item,
          source_type: 'rss',
          ingest_cost: 'free',
          content_class: 'news',
        } as unknown as Record<string, unknown>,
      });
    }
    
    // Global cap: keep newest 200 items to prevent DB bloat
    const MAX_ITEMS = 200;
    const sortedItems = newsItems
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      .slice(0, MAX_ITEMS);
    
    console.log(`[news-poll] Total items: ${newsItems.length}, capped to: ${sortedItems.length}`);
    
    // Upsert news items
    if (sortedItems.length > 0) {
      const { error: upsertError } = await supabase
        .from('news_items')
        .upsert(sortedItems, { onConflict: 'id' });
      
      if (upsertError) {
        console.error('[news-poll] Upsert error:', upsertError);
      }
    }
    
    // Create news_mentions for symbol correlation
    const mentions: Array<{
      news_id: string;
      symbol: string;
      bucket_start: string;
    }> = [];
    
    for (const item of sortedItems) {
      const bucket = getBucketStart(new Date(item.published_at));
      
      for (const symbol of item.symbols) {
        mentions.push({
          news_id: item.id,
          symbol,
          bucket_start: bucket,
        });
      }
    }
    
    if (mentions.length > 0) {
      const { error: mentionError } = await supabase
        .from('news_mentions')
        .upsert(mentions, { 
          onConflict: 'news_id,symbol,bucket_start',
          ignoreDuplicates: true 
        });
      
      if (mentionError) {
        console.error('[news-poll] Mentions upsert error:', mentionError);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[news-poll] Complete in ${duration}ms - ${sortedItems.length} items, ${mentions.length} mentions`);
    
    return new Response(JSON.stringify({
      success: true,
      items_count: sortedItems.length,
      mentions_count: mentions.length,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[news-poll] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: errMsg,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
