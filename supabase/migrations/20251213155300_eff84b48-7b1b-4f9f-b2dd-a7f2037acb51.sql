-- Add tags column to paper_orders for trade attribution
ALTER TABLE public.paper_orders 
ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add index for querying by strategy/regime
CREATE INDEX IF NOT EXISTS idx_paper_orders_tags ON public.paper_orders USING GIN(tags);