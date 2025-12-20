-- Add role enum and column to agents table for explorer agent support (Pass 3A)
CREATE TYPE public.agent_role AS ENUM ('core', 'explorer');

ALTER TABLE public.agents 
ADD COLUMN role public.agent_role NOT NULL DEFAULT 'core';

-- Add comment for documentation
COMMENT ON COLUMN public.agents.role IS 'Agent role: core (conservative, normal mode) or explorer (drought mode, smaller size, learning-focused)';