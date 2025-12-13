-- Create market_poll_runs table for observability
CREATE TABLE public.market_poll_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('success', 'skipped', 'error')),
  updated_count INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER
);

-- Enable RLS
ALTER TABLE public.market_poll_runs ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on market_poll_runs"
ON public.market_poll_runs
FOR SELECT
USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_poll_runs;

-- Create exchange_connections table for Coinbase integration
CREATE TABLE public.exchange_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'coinbase',
  label TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  is_paper BOOLEAN NOT NULL DEFAULT true,
  permissions JSONB DEFAULT '[]'::jsonb,
  last_auth_check TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.exchange_connections ENABLE ROW LEVEL SECURITY;

-- Allow public read access (secrets never stored here)
CREATE POLICY "Allow public read access on exchange_connections"
ON public.exchange_connections
FOR SELECT
USING (true);

-- Index for faster lookups
CREATE INDEX idx_market_poll_runs_ran_at ON public.market_poll_runs(ran_at DESC);