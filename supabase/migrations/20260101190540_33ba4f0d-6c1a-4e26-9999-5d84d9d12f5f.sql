-- Create table for live brain snapshots (frozen elite sets)
CREATE TABLE public.live_brain_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_number INTEGER NOT NULL,
  promoted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  promoted_by TEXT DEFAULT 'manual',
  source_generation_id UUID REFERENCES public.generations(id),
  agent_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  performance_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Only one snapshot can be active at a time
CREATE UNIQUE INDEX idx_live_brain_active ON public.live_brain_snapshots (is_active) WHERE is_active = true;

-- Index for quick lookups
CREATE INDEX idx_live_brain_version ON public.live_brain_snapshots (version_number DESC);
CREATE INDEX idx_live_brain_promoted ON public.live_brain_snapshots (promoted_at DESC);

-- Enable RLS
ALTER TABLE public.live_brain_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on live_brain_snapshots"
ON public.live_brain_snapshots
FOR SELECT
USING (true);

-- Add column to system_state to track active brain version
ALTER TABLE public.system_state 
ADD COLUMN IF NOT EXISTS active_brain_version_id UUID REFERENCES public.live_brain_snapshots(id);