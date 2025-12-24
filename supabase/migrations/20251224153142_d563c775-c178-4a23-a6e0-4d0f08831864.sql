-- Shadow trades table for counterfactual learning
CREATE TABLE public.shadow_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id),
  generation_id UUID NOT NULL REFERENCES public.generations(id),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  
  -- Entry details
  entry_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  entry_price NUMERIC NOT NULL,
  intended_qty NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  
  -- Strategy parameters at time of shadow trade
  stop_price NUMERIC,
  target_price NUMERIC,
  trailing_stop_pct NUMERIC,
  
  -- Outcome tracking (filled by shadow-outcome-calc)
  outcome_calculated_at TIMESTAMP WITH TIME ZONE,
  exit_time TIMESTAMP WITH TIME ZONE,
  exit_price NUMERIC,
  simulated_pnl NUMERIC,
  simulated_pnl_pct NUMERIC,
  hit_stop BOOLEAN DEFAULT false,
  hit_target BOOLEAN DEFAULT false,
  outcome_status TEXT DEFAULT 'pending' CHECK (outcome_status IN ('pending', 'calculated', 'expired')),
  
  -- Context
  regime TEXT,
  regime_match BOOLEAN,
  decision_reason TEXT,
  market_data JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shadow_trades ENABLE ROW LEVEL SECURITY;

-- Read-only public access (same pattern as other tables)
CREATE POLICY "Allow public read access on shadow_trades"
ON public.shadow_trades
FOR SELECT
USING (true);

-- Indexes for common queries
CREATE INDEX idx_shadow_trades_agent ON public.shadow_trades(agent_id);
CREATE INDEX idx_shadow_trades_generation ON public.shadow_trades(generation_id);
CREATE INDEX idx_shadow_trades_pending ON public.shadow_trades(outcome_status) WHERE outcome_status = 'pending';
CREATE INDEX idx_shadow_trades_regime ON public.shadow_trades(regime);
CREATE INDEX idx_shadow_trades_entry_time ON public.shadow_trades(entry_time DESC);

-- Add shadow trading config to system_config
COMMENT ON TABLE public.shadow_trades IS 'Counterfactual trades for learning without capital risk. Tracks what would have happened if trades were executed.';

-- Enable realtime for shadow trades monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.shadow_trades;