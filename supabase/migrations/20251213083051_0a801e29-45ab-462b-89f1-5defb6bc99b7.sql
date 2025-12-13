-- Create enum types for EvoTrader
CREATE TYPE public.strategy_template AS ENUM ('trend_pullback', 'mean_reversion', 'breakout');
CREATE TYPE public.trade_side AS ENUM ('BUY', 'SELL');
CREATE TYPE public.trade_outcome AS ENUM ('success', 'failed', 'denied');
CREATE TYPE public.generation_termination_reason AS ENUM ('time', 'trades', 'drawdown');
CREATE TYPE public.agent_status AS ENUM ('elite', 'active', 'probation', 'removed');
CREATE TYPE public.system_status AS ENUM ('running', 'paused', 'stopped', 'error');

-- Generations table
CREATE TABLE public.generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_number INTEGER NOT NULL UNIQUE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  regime_tag TEXT,
  termination_reason public.generation_termination_reason,
  avg_fitness DECIMAL(10, 6),
  total_trades INTEGER NOT NULL DEFAULT 0,
  total_pnl DECIMAL(12, 2) NOT NULL DEFAULT 0,
  max_drawdown DECIMAL(6, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agents table
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  strategy_template public.strategy_template NOT NULL,
  genes JSONB NOT NULL,
  capital_allocation DECIMAL(10, 2) NOT NULL DEFAULT 40,
  is_elite BOOLEAN NOT NULL DEFAULT false,
  status public.agent_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trades table
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  symbol TEXT NOT NULL,
  side public.trade_side NOT NULL,
  intent_size DECIMAL(18, 8) NOT NULL,
  fill_price DECIMAL(18, 8) NOT NULL,
  fill_size DECIMAL(18, 8) NOT NULL,
  fees DECIMAL(10, 4) NOT NULL DEFAULT 0,
  outcome public.trade_outcome NOT NULL,
  pnl DECIMAL(12, 4) NOT NULL DEFAULT 0
);

-- Performance table
CREATE TABLE public.performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  fitness_score DECIMAL(10, 6) NOT NULL,
  net_pnl DECIMAL(12, 4) NOT NULL DEFAULT 0,
  sharpe_ratio DECIMAL(8, 4) NOT NULL DEFAULT 0,
  max_drawdown DECIMAL(6, 2) NOT NULL DEFAULT 0,
  profitable_days_ratio DECIMAL(4, 2) NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, generation_id)
);

-- System config table (single row)
CREATE TABLE public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- System state table (single row for current state)
CREATE TABLE public.system_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status public.system_status NOT NULL DEFAULT 'stopped',
  current_generation_id UUID REFERENCES public.generations(id),
  total_capital DECIMAL(12, 2) NOT NULL DEFAULT 10000,
  active_pool DECIMAL(12, 2) NOT NULL DEFAULT 4000,
  reserve DECIMAL(12, 2) NOT NULL DEFAULT 6000,
  today_trades INTEGER NOT NULL DEFAULT 0,
  today_pnl DECIMAL(12, 4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Market data table
CREATE TABLE public.market_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  price DECIMAL(18, 8) NOT NULL,
  change_24h DECIMAL(8, 4) NOT NULL DEFAULT 0,
  volume_24h DECIMAL(20, 2) NOT NULL DEFAULT 0,
  ema_50_slope DECIMAL(10, 6) NOT NULL DEFAULT 0,
  atr_ratio DECIMAL(8, 4) NOT NULL DEFAULT 1,
  regime TEXT NOT NULL DEFAULT 'Unknown',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_agents_generation_id ON public.agents(generation_id);
CREATE INDEX idx_agents_status ON public.agents(status);
CREATE INDEX idx_trades_generation_id ON public.trades(generation_id);
CREATE INDEX idx_trades_agent_id ON public.trades(agent_id);
CREATE INDEX idx_trades_timestamp ON public.trades(timestamp DESC);
CREATE INDEX idx_performance_generation_id ON public.performance(generation_id);

-- Enable RLS on all tables
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (dashboard is read-only for now)
-- These tables are monitoring data, not user-specific data
CREATE POLICY "Allow public read access on generations" ON public.generations FOR SELECT USING (true);
CREATE POLICY "Allow public read access on agents" ON public.agents FOR SELECT USING (true);
CREATE POLICY "Allow public read access on trades" ON public.trades FOR SELECT USING (true);
CREATE POLICY "Allow public read access on performance" ON public.performance FOR SELECT USING (true);
CREATE POLICY "Allow public read access on system_config" ON public.system_config FOR SELECT USING (true);
CREATE POLICY "Allow public read access on system_state" ON public.system_state FOR SELECT USING (true);
CREATE POLICY "Allow public read access on market_data" ON public.market_data FOR SELECT USING (true);

-- Enable realtime for trades (for live trade log updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_data;