-- Create generation_agents join table for cohort tracking
CREATE TABLE public.generation_agents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generation_id uuid NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(generation_id, agent_id)
);

-- Enable RLS
ALTER TABLE public.generation_agents ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on generation_agents" 
ON public.generation_agents 
FOR SELECT 
USING (true);

-- Update start_new_generation to NOT touch agents table
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
  -- Get current generation info
  SELECT current_generation_id INTO prev_gen_id
  FROM public.system_state
  LIMIT 1;

  -- Get previous generation number (or start at 0)
  SELECT COALESCE(MAX(generation_number), 0) INTO prev_gen_number
  FROM public.generations;

  new_gen_number := prev_gen_number + 1;

  -- Close any active generation
  UPDATE public.generations
  SET is_active = false, end_time = now()
  WHERE is_active = true;

  -- Create new generation
  INSERT INTO public.generations (generation_number, is_active, start_time)
  VALUES (new_gen_number, true, now())
  RETURNING id INTO new_gen_id;

  -- Update system_state (DO NOT touch agents table - selection-breeding handles that)
  UPDATE public.system_state
  SET current_generation_id = new_gen_id,
      updated_at = now()
  WHERE id = (SELECT id FROM public.system_state LIMIT 1);

  -- Record all current agents as belonging to this generation
  INSERT INTO public.generation_agents (generation_id, agent_id)
  SELECT new_gen_id, id FROM public.agents;

  -- Log control event
  INSERT INTO public.control_events(action, metadata)
  VALUES ('generation_started', jsonb_build_object(
    'generation_id', new_gen_id,
    'generation_number', new_gen_number,
    'previous_generation_id', prev_gen_id
  ));

  RETURN new_gen_id;
END;
$function$;