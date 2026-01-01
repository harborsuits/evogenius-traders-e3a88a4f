-- Add gate_profile to system_state for warmup vs strict gates
ALTER TABLE public.system_state 
ADD COLUMN IF NOT EXISTS gate_profile text NOT NULL DEFAULT 'warmup';

-- Create gate_profiles table for configurable thresholds
CREATE TABLE IF NOT EXISTS public.gate_profiles (
  name text PRIMARY KEY,
  config jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gate_profiles ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on gate_profiles"
ON public.gate_profiles
FOR SELECT
USING (true);

-- Seed warmup and strict profiles
INSERT INTO public.gate_profiles (name, config) VALUES
('warmup', '{
  "agent": {"min_trades": 3, "max_drawdown": 0.15, "min_pnl": -0.05, "min_sharpe": -999},
  "snapshot": {"min_qualified_agents": 3, "max_aggregate_drawdown": 0.15, "min_strategy_diversity": 1}
}'::jsonb),
('strict', '{
  "agent": {"min_trades": 20, "max_drawdown": 0.15, "min_pnl": 0.00, "min_sharpe": 0.30},
  "snapshot": {"min_qualified_agents": 5, "max_aggregate_drawdown": 0.10, "min_strategy_diversity": 2}
}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Add comment
COMMENT ON COLUMN public.system_state.gate_profile IS 'warmup = relaxed gates for early testing, strict = production gates';