-- Add unique constraint for performance upsert (agent_id + generation_id)
ALTER TABLE public.performance 
ADD CONSTRAINT performance_agent_generation_unique 
UNIQUE (agent_id, generation_id);