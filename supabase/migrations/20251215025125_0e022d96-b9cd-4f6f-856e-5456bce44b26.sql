-- News items table (normalized feed, deduped)
CREATE TABLE public.news_items (
  id TEXT PRIMARY KEY, -- hash of source + url
  source TEXT NOT NULL, -- 'coindesk' | 'cryptopanic'
  outlet TEXT, -- original outlet name if from aggregator
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL,
  symbols TEXT[] DEFAULT '{}', -- extracted symbols like ['BTC', 'ETH']
  importance INTEGER DEFAULT 0, -- votes/hot ranking if available
  raw JSONB DEFAULT '{}', -- original payload
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for efficient querying
CREATE INDEX idx_news_items_published_at ON public.news_items(published_at DESC);
CREATE INDEX idx_news_items_source ON public.news_items(source);
CREATE INDEX idx_news_items_symbols ON public.news_items USING GIN(symbols);

-- Enable RLS
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on news_items"
ON public.news_items
FOR SELECT
USING (true);

-- News mentions table (linking news to time buckets for correlation)
CREATE TABLE public.news_mentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id TEXT NOT NULL REFERENCES public.news_items(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  bucket_start TIMESTAMP WITH TIME ZONE NOT NULL, -- 15-min or hour bucket
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(news_id, symbol, bucket_start)
);

-- Index for correlation queries
CREATE INDEX idx_news_mentions_symbol_bucket ON public.news_mentions(symbol, bucket_start DESC);
CREATE INDEX idx_news_mentions_bucket ON public.news_mentions(bucket_start DESC);

-- Enable RLS
ALTER TABLE public.news_mentions ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on news_mentions"
ON public.news_mentions
FOR SELECT
USING (true);

-- Enable realtime for UI updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.news_items;