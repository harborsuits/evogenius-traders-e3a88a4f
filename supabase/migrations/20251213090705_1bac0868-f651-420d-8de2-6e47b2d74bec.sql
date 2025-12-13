-- Create control_events table for audit trail
CREATE TABLE public.control_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.control_events ENABLE ROW LEVEL SECURITY;

-- Allow public read access (monitoring dashboard)
CREATE POLICY "Allow public read access on control_events"
ON public.control_events
FOR SELECT
USING (true);

-- Add to realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.control_events;