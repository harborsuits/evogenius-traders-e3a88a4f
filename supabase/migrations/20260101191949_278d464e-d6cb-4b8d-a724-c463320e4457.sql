-- Add status column for candidate vs active snapshots
ALTER TABLE public.live_brain_snapshots 
ADD COLUMN status text NOT NULL DEFAULT 'active';

-- Add gate validation results
ALTER TABLE public.live_brain_snapshots 
ADD COLUMN gates_passed jsonb DEFAULT '{}'::jsonb;

-- Add gate validation timestamp  
ALTER TABLE public.live_brain_snapshots 
ADD COLUMN gates_validated_at timestamp with time zone;

-- Update existing snapshots to have 'active' status if is_active=true
UPDATE public.live_brain_snapshots 
SET status = CASE WHEN is_active = true THEN 'active' ELSE 'inactive' END;

-- Create index for quick candidate lookups
CREATE INDEX idx_brain_snapshots_status ON public.live_brain_snapshots(status);

-- Add comment for documentation
COMMENT ON COLUMN public.live_brain_snapshots.status IS 'candidate = pending activation, active = live brain, inactive = historical';