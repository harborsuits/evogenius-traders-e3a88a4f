-- Add preferred_regime column to agents for regime-based gating
-- Values: 'trend' (trend_pullback, breakout), 'range' (mean_reversion), 'dead' (capital protection), 'any' (no preference)
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS preferred_regime text DEFAULT 'any';

-- Add a comment for documentation
COMMENT ON COLUMN public.agents.preferred_regime IS 'Preferred market regime: trend, range, dead, or any';

-- Update existing agents based on their strategy template defaults
UPDATE public.agents SET preferred_regime = 'trend' WHERE strategy_template IN ('trend_pullback', 'breakout');
UPDATE public.agents SET preferred_regime = 'range' WHERE strategy_template = 'mean_reversion';