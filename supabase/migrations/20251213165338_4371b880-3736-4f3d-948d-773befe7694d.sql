-- Fix search_path security for both functions
CREATE OR REPLACE FUNCTION public.start_new_generation()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Update system_state
  UPDATE public.system_state
  SET current_generation_id = new_gen_id,
      updated_at = now()
  WHERE id = (SELECT id FROM public.system_state LIMIT 1);

  -- Link all agents to new generation
  UPDATE public.agents
  SET generation_id = new_gen_id;

  -- Log control event
  INSERT INTO public.control_events(action, metadata)
  VALUES ('generation_started', jsonb_build_object(
    'generation_id', new_gen_id,
    'generation_number', new_gen_number,
    'previous_generation_id', prev_gen_id
  ));

  RETURN new_gen_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_generation(
  gen_id uuid,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.generations
  SET is_active = false,
      end_time = now(),
      termination_reason = reason::generation_termination_reason
  WHERE id = gen_id;

  INSERT INTO public.control_events(action, metadata)
  VALUES ('generation_ended', jsonb_build_object(
    'generation_id', gen_id,
    'reason', reason
  ));
END;
$$;