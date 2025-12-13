-- Paper Trading System Tables

-- Enum for order side
CREATE TYPE paper_order_side AS ENUM ('buy', 'sell');

-- Enum for order type
CREATE TYPE paper_order_type AS ENUM ('market', 'limit');

-- Enum for order status
CREATE TYPE paper_order_status AS ENUM ('pending', 'filled', 'rejected', 'cancelled');

-- Paper accounts table
CREATE TABLE public.paper_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Paper',
  base_currency TEXT NOT NULL DEFAULT 'USD',
  starting_cash NUMERIC NOT NULL DEFAULT 1000,
  cash NUMERIC NOT NULL DEFAULT 1000,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Paper positions table
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

-- Paper orders table
CREATE TABLE public.paper_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.paper_accounts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  generation_id UUID REFERENCES public.generations(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  side paper_order_side NOT NULL,
  order_type paper_order_type NOT NULL DEFAULT 'market',
  qty NUMERIC NOT NULL,
  limit_price NUMERIC,
  status paper_order_status NOT NULL DEFAULT 'pending',
  filled_price NUMERIC,
  filled_qty NUMERIC,
  slippage_pct NUMERIC,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  filled_at TIMESTAMP WITH TIME ZONE
);

-- Paper fills table
CREATE TABLE public.paper_fills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.paper_orders(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side paper_order_side NOT NULL,
  qty NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  fee NUMERIC NOT NULL DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add trade_mode to system_state
ALTER TABLE public.system_state 
ADD COLUMN trade_mode TEXT NOT NULL DEFAULT 'paper' 
CHECK (trade_mode IN ('paper', 'live'));

-- Enable RLS on all paper tables
ALTER TABLE public.paper_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_fills ENABLE ROW LEVEL SECURITY;

-- Public read access policies
CREATE POLICY "Allow public read access on paper_accounts" 
ON public.paper_accounts FOR SELECT USING (true);

CREATE POLICY "Allow public read access on paper_positions" 
ON public.paper_positions FOR SELECT USING (true);

CREATE POLICY "Allow public read access on paper_orders" 
ON public.paper_orders FOR SELECT USING (true);

CREATE POLICY "Allow public read access on paper_fills" 
ON public.paper_fills FOR SELECT USING (true);

-- Enable realtime for paper_orders and paper_positions
ALTER PUBLICATION supabase_realtime ADD TABLE public.paper_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.paper_positions;

-- Insert default paper account with $1,000 and enabled symbols
INSERT INTO public.paper_accounts (name, base_currency, starting_cash, cash)
VALUES ('Paper', 'USD', 1000, 1000);

-- Add paper risk config to system_config if exists, otherwise create
INSERT INTO public.system_config (config)
SELECT jsonb_build_object(
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
WHERE NOT EXISTS (SELECT 1 FROM public.system_config LIMIT 1);

-- Update existing config to add paper risk settings if config exists
UPDATE public.system_config
SET config = config || jsonb_build_object(
  'risk', COALESCE(config->'risk', '{}'::jsonb) || jsonb_build_object(
    'paper', jsonb_build_object(
      'max_position_pct', 0.25,
      'max_trade_pct', 0.10,
      'slippage_min_pct', 0.001,
      'slippage_max_pct', 0.005,
      'fee_pct', 0.006
    )
  )
),
updated_at = now()
WHERE EXISTS (SELECT 1 FROM public.system_config LIMIT 1);