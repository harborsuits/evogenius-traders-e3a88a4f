-- =====================================================
-- EVOGENIUS FULL SCHEMA MIGRATION
-- Paste this entire file into Supabase SQL Editor and run
-- =====================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- =====================================================
-- ENUM TYPES
-- =====================================================
CREATE TYPE public.strategy_template AS ENUM ('trend_pullback', 'mean_reversion', 'breakout');
CREATE TYPE public.trade_side AS ENUM ('BUY', 'SELL');
CREATE TYPE public.trade_outcome AS ENUM ('success', 'failed', 'denied');
CREATE TYPE public.generation_termination_reason AS ENUM ('time', 'trades', 'drawdown', 'drought');
CREATE TYPE public.agent_status AS ENUM ('elite', 'active', 'probation', 'removed');
CREATE TYPE public.system_status AS ENUM ('running', 'paused', 'stopped', 'error');
CREATE TYPE public.paper_order_side AS ENUM ('buy', 'sell');
CREATE TYPE public.paper_order_type AS ENUM ('market', 'limit');
CREATE TYPE public.paper_order_status AS ENUM ('pending', 'filled', 'rejected', 'cancelled');
CREATE TYPE public.agent_role AS ENUM ('core', 'explorer');

-- =====================================================
-- CORE TABLES
-- =====================================================

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
  role public.agent_role NOT NULL DEFAULT 'core',
  is_active BOOLEAN DEFAULT true,
  preferred_regime TEXT DEFAULT 'any',
  disabled_at TIMESTAMPTZ,
  disabled_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Generation agents (cohort tracking)
CREATE TABLE public.generation_agents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generation_id uuid NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(generation_id, agent_id)
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
  CONSTRAINT performance_agent_generation_unique UNIQUE(agent_id, generation_id)
);

-- Shadow trades (counterfactual learning)
CREATE TABLE public.shadow_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id),
  generation_id UUID NOT NULL REFERENCES public.generations(id),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  entry_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  entry_price NUMERIC NOT NULL,
  intended_qty NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  stop_price NUMERIC,
  target_price NUMERIC,
  trailing_stop_pct NUMERIC,
  outcome_calculated_at TIMESTAMP WITH TIME ZONE,
  exit_time TIMESTAMP WITH TIME ZONE,
  exit_price NUMERIC,
  simulated_pnl NUMERIC,
  simulated_pnl_pct NUMERIC,
  hit_stop BOOLEAN DEFAULT false,
  hit_target BOOLEAN DEFAULT false,
  outcome_status TEXT DEFAULT 'pending' CHECK (outcome_status IN ('pending', 'calculated', 'expired')),
  regime TEXT,
  regime_match BOOLEAN,
  decision_reason TEXT,
  market_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =====================================================
-- SYSTEM TABLES
-- =====================================================

-- System config table
CREATE TABLE public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Live brain snapshots
CREATE TABLE public.live_brain_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_number INTEGER NOT NULL,
  promoted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  promoted_by TEXT DEFAULT 'manual',
  source_generation_id UUID REFERENCES public.generations(id),
  agent_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  performance_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  gates_passed JSONB DEFAULT '{}'::jsonb,
  gates_validated_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- System state table
CREATE TABLE public.system_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status public.system_status NOT NULL DEFAULT 'stopped',
  current_generation_id UUID REFERENCES public.generations(id),
  active_brain_version_id UUID REFERENCES public.live_brain_snapshots(id),
  total_capital DECIMAL(12, 2) NOT NULL DEFAULT 10000,
  active_pool DECIMAL(12, 2) NOT NULL DEFAULT 4000,
  reserve DECIMAL(12, 2) NOT NULL DEFAULT 6000,
  today_trades INTEGER NOT NULL DEFAULT 0,
  today_pnl DECIMAL(12, 4) NOT NULL DEFAULT 0,
  trade_mode TEXT NOT NULL DEFAULT 'paper' CHECK (trade_mode IN ('paper', 'live')),
  live_armed_until TIMESTAMPTZ,
  gate_profile TEXT NOT NULL DEFAULT 'warmup',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gate profiles
CREATE TABLE public.gate_profiles (
  name TEXT PRIMARY KEY,
  config JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Control events (audit trail)
CREATE TABLE public.control_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- ARM sessions
CREATE TABLE public.arm_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'live',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  spent_at timestamptz DEFAULT NULL,
  spent_by_request_id uuid DEFAULT NULL,
  max_live_orders integer NOT NULL DEFAULT 1,
  orders_executed integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Performance alerts
CREATE TABLE public.performance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  scope text NOT NULL,
  scope_id text NOT NULL,
  severity text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_ack boolean NOT NULL DEFAULT false,
  acked_at timestamptz NULL
);

-- =====================================================
-- MARKET DATA TABLES
-- =====================================================

-- Market data
CREATE TABLE public.market_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  price DECIMAL(18, 8) NOT NULL,
  change_24h DECIMAL(8, 4) NOT NULL DEFAULT 0,
  volume_24h DECIMAL(20, 2) NOT NULL DEFAULT 0,
  ema_50_slope DECIMAL(10, 6) NOT NULL DEFAULT 0,
  atr_ratio DECIMAL(8, 4) NOT NULL DEFAULT 1,
  regime TEXT NOT NULL DEFAULT 'Unknown',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT market_data_symbol_unique UNIQUE (symbol)
);

-- Market poll runs
CREATE TABLE public.market_poll_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL,
  updated_count INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER
);

-- Exchange connections
CREATE TABLE public.exchange_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'coinbase',
  label TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  is_paper BOOLEAN NOT NULL DEFAULT true,
  permissions JSONB DEFAULT '[]'::jsonb,
  last_auth_check TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT exchange_connections_provider_key UNIQUE (provider)
);

-- =====================================================
-- PAPER TRADING TABLES
-- =====================================================

-- Paper accounts
CREATE TABLE public.paper_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Paper',
  base_currency TEXT NOT NULL DEFAULT 'USD',
  starting_cash NUMERIC NOT NULL DEFAULT 1000,
  cash NUMERIC NOT NULL DEFAULT 1000,
  peak_equity NUMERIC NOT NULL DEFAULT 1000,
  peak_equity_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Paper positions
CREATE TABLE public.paper_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.paper_accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 0,
  avg_entry_price NUMERIC NOT NULL DEFAULT 0,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(account_id, symbol)
);

-- Paper orders
CREATE TABLE public.paper_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.paper_accounts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  generation_id UUID REFERENCES public.generations(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  side public.paper_order_side NOT NULL,
  order_type public.paper_order_type NOT NULL DEFAULT 'market',
  qty NUMERIC NOT NULL,
  limit_price NUMERIC,
  status public.paper_order_status NOT NULL DEFAULT 'pending',
  filled_price NUMERIC,
  filled_qty NUMERIC,
  slippage_pct NUMERIC,
  reason TEXT,
  tags JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  filled_at TIMESTAMP WITH TIME ZONE
);

-- Paper fills
CREATE TABLE public.paper_fills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.paper_orders(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side public.paper_order_side NOT NULL,
  qty NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =====================================================
-- NEWS TABLES
-- =====================================================

-- News items
CREATE TABLE public.news_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  outlet TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL,
  symbols TEXT[] DEFAULT '{}',
  importance INTEGER DEFAULT 0,
  raw JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- News mentions
CREATE TABLE public.news_mentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id TEXT NOT NULL REFERENCES public.news_items(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  bucket_start TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(news_id, symbol, bucket_start)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_agents_generation_id ON public.agents(generation_id);
CREATE INDEX idx_agents_status ON public.agents(status);
CREATE INDEX idx_trades_generation_id ON public.trades(generation_id);
CREATE INDEX idx_trades_agent_id ON public.trades(agent_id);
CREATE INDEX idx_trades_timestamp ON public.trades(timestamp DESC);
CREATE INDEX idx_performance_generation_id ON public.performance(generation_id);
CREATE INDEX idx_market_poll_runs_ran_at ON public.market_poll_runs(ran_at DESC);
CREATE INDEX idx_paper_orders_tags ON public.paper_orders USING GIN(tags);
CREATE INDEX idx_news_items_published_at ON public.news_items(published_at DESC);
CREATE INDEX idx_news_items_source ON public.news_items(source);
CREATE INDEX idx_news_items_symbols ON public.news_items USING GIN(symbols);
CREATE INDEX idx_news_mentions_symbol_bucket ON public.news_mentions(symbol, bucket_start DESC);
CREATE INDEX idx_news_mentions_bucket ON public.news_mentions(bucket_start DESC);
CREATE INDEX idx_shadow_trades_agent ON public.shadow_trades(agent_id);
CREATE INDEX idx_shadow_trades_generation ON public.shadow_trades(generation_id);
CREATE INDEX idx_shadow_trades_pending ON public.shadow_trades(outcome_status) WHERE outcome_status = 'pending';
CREATE INDEX idx_shadow_trades_regime ON public.shadow_trades(regime);
CREATE INDEX idx_shadow_trades_entry_time ON public.shadow_trades(entry_time DESC);
CREATE UNIQUE INDEX idx_live_brain_active ON public.live_brain_snapshots (is_active) WHERE is_active = true;
CREATE INDEX idx_live_brain_version ON public.live_brain_snapshots (version_number DESC);
CREATE INDEX idx_live_brain_promoted ON public.live_brain_snapshots (promoted_at DESC);
CREATE INDEX idx_brain_snapshots_status ON public.live_brain_snapshots(status);

-- =====================================================
-- ENABLE RLS ON ALL TABLES
-- =====================================================

ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_brain_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arm_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_poll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_mentions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES (Authenticated access only)
-- =====================================================

CREATE POLICY "Authenticated read access on agents" ON public.agents FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on generations" ON public.generations FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on generation_agents" ON public.generation_agents FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on trades" ON public.trades FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on performance" ON public.performance FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on shadow_trades" ON public.shadow_trades FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on system_config" ON public.system_config FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on system_state" ON public.system_state FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access on system_state" ON public.system_state FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on live_brain_snapshots" ON public.live_brain_snapshots FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on gate_profiles" ON public.gate_profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on control_events" ON public.control_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on arm_sessions" ON public.arm_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on performance_alerts" ON public.performance_alerts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert access on performance_alerts" ON public.performance_alerts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update access on performance_alerts" ON public.performance_alerts FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on market_data" ON public.market_data FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on market_poll_runs" ON public.market_poll_runs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on exchange_connections" ON public.exchange_connections FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on paper_accounts" ON public.paper_accounts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on paper_positions" ON public.paper_positions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on paper_orders" ON public.paper_orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on paper_fills" ON public.paper_fills FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on news_items" ON public.news_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated read access on news_mentions" ON public.news_mentions FOR SELECT USING (auth.role() = 'authenticated');

-- =====================================================
-- ENABLE REALTIME
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_data;
ALTER PUBLICATION supabase_realtime ADD TABLE public.control_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.paper_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.paper_positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_poll_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.performance_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.news_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shadow_trades;

-- =====================================================
-- DATABASE FUNCTIONS
-- =====================================================

-- Start new generation function
CREATE OR REPLACE FUNCTION public.start_new_generation()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_gen_id uuid;
  prev_gen_id uuid;
  prev_gen_number integer;
  new_gen_number integer;
BEGIN
  SELECT current_generation_id INTO prev_gen_id FROM public.system_state LIMIT 1;
  SELECT COALESCE(MAX(generation_number), 0) INTO prev_gen_number FROM public.generations;
  new_gen_number := prev_gen_number + 1;
  UPDATE public.generations SET is_active = false, end_time = now() WHERE is_active = true;
  INSERT INTO public.generations (generation_number, is_active, start_time)
  VALUES (new_gen_number, true, now())
  RETURNING id INTO new_gen_id;
  UPDATE public.system_state SET current_generation_id = new_gen_id, updated_at = now()
  WHERE id = (SELECT id FROM public.system_state LIMIT 1);
  INSERT INTO public.control_events(action, metadata)
  VALUES ('generation_started', jsonb_build_object(
    'generation_id', new_gen_id, 'generation_number', new_gen_number, 'previous_generation_id', prev_gen_id
  ));
  RETURN new_gen_id;
END;
$function$;

-- End generation function
CREATE OR REPLACE FUNCTION public.end_generation(gen_id uuid, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.generations SET is_active = false, end_time = now(), termination_reason = reason::generation_termination_reason WHERE id = gen_id;
  INSERT INTO public.control_events(action, metadata)
  VALUES ('generation_ended', jsonb_build_object('generation_id', gen_id, 'reason', reason));
END;
$function$;

-- Mutate genes function
CREATE OR REPLACE FUNCTION public.mutate_genes(base_genes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB := base_genes;
  key TEXT;
  val NUMERIC;
  mutation_factor NUMERIC;
BEGIN
  FOR key IN SELECT jsonb_object_keys(base_genes) LOOP
    val := (base_genes->>key)::NUMERIC;
    mutation_factor := 0.95 + (RANDOM() * 0.10);
    result := jsonb_set(result, ARRAY[key], to_jsonb(ROUND((val * mutation_factor)::numeric, 4)));
  END LOOP;
  RETURN result;
END;
$function$;

-- Spend ARM session function
CREATE OR REPLACE FUNCTION public.spend_arm_session(request_id uuid, session_id uuid)
RETURNS TABLE(success boolean, reason text, session_mode text, orders_remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  session_row arm_sessions%ROWTYPE;
BEGIN
  SELECT * INTO session_row FROM arm_sessions WHERE id = session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'SESSION_NOT_FOUND'::text, ''::text, 0;
    RETURN;
  END IF;
  IF session_row.spent_at IS NOT NULL AND session_row.spent_by_request_id = request_id THEN
    RETURN QUERY SELECT true, 'OK_IDEMPOTENT'::text, session_row.mode, 0;
    RETURN;
  END IF;
  IF session_row.spent_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'CANARY_ALREADY_CONSUMED'::text, session_row.mode, 0;
    RETURN;
  END IF;
  IF session_row.expires_at < now() THEN
    RETURN QUERY SELECT false, 'SESSION_EXPIRED'::text, session_row.mode, 0;
    RETURN;
  END IF;
  UPDATE arm_sessions SET spent_at = now(), spent_by_request_id = request_id, orders_executed = orders_executed + 1 WHERE id = session_id;
  RETURN QUERY SELECT true, 'OK'::text, session_row.mode, (session_row.max_live_orders - session_row.orders_executed - 1);
END;
$function$;

-- =====================================================
-- SEED DATA
-- =====================================================

-- Insert default paper account
INSERT INTO public.paper_accounts (name, base_currency, starting_cash, cash, peak_equity)
VALUES ('Paper', 'USD', 1000, 1000, 1000);

-- Insert gate profiles
INSERT INTO public.gate_profiles (name, config) VALUES
('warmup', '{
  "agent": {"min_trades": 3, "max_drawdown": 0.15, "min_pnl": -0.05, "min_sharpe": -999},
  "snapshot": {"min_qualified_agents": 3, "max_aggregate_drawdown": 0.15, "min_strategy_diversity": 1}
}'::jsonb),
('strict', '{
  "agent": {"min_trades": 20, "max_drawdown": 0.15, "min_pnl": 0.00, "min_sharpe": 0.30},
  "snapshot": {"min_qualified_agents": 5, "max_aggregate_drawdown": 0.10, "min_strategy_diversity": 2}
}'::jsonb);

-- Insert default system config
INSERT INTO public.system_config (config) VALUES (
  jsonb_build_object(
    'trading', jsonb_build_object('symbols', ARRAY['BTC-USD', 'ETH-USD'], 'decision_interval_minutes', 60),
    'capital', jsonb_build_object('total', 10000, 'active_pool_pct', 0.4),
    'population', jsonb_build_object('size', 100, 'elite_count', 10, 'parent_count', 15),
    'generation', jsonb_build_object('max_days', 7, 'max_trades', 100, 'max_drawdown_pct', 0.15),
    'risk', jsonb_build_object(
      'max_trades_per_agent_per_day', 5,
      'max_trades_per_symbol_per_day', 50,
      'paper', jsonb_build_object(
        'max_position_pct', 0.25,
        'max_trade_pct', 0.10,
        'slippage_min_pct', 0.001,
        'slippage_max_pct', 0.005,
        'fee_pct', 0.006
      )
    )
  )
);

-- Insert default system state
INSERT INTO public.system_state (status, trade_mode, gate_profile)
VALUES ('stopped', 'paper', 'warmup');

-- =====================================================
-- DONE! Your schema is ready.
-- =====================================================
