-- Add live_armed_until column to system_state
ALTER TABLE public.system_state 
ADD COLUMN live_armed_until timestamptz DEFAULT NULL;