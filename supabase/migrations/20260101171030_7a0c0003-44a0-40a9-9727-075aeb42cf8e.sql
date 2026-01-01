-- Create arm_sessions table for canary hard-lock (one order per ARM window)
CREATE TABLE public.arm_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'live',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  spent_at timestamptz DEFAULT NULL,
  spent_by_request_id uuid DEFAULT NULL,
  max_live_orders integer NOT NULL DEFAULT 1,
  orders_executed integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.arm_sessions ENABLE ROW LEVEL SECURITY;

-- Allow public read (for UI to check session state)
CREATE POLICY "Allow public read access on arm_sessions" 
ON public.arm_sessions 
FOR SELECT 
USING (true);

-- Create function to atomically spend an ARM session (prevents race conditions)
CREATE OR REPLACE FUNCTION public.spend_arm_session(
  session_id uuid,
  request_id uuid
)
RETURNS TABLE(
  success boolean,
  reason text,
  session_mode text,
  orders_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_row arm_sessions%ROWTYPE;
  updated_count integer;
BEGIN
  -- Lock the row for update to prevent race conditions
  SELECT * INTO session_row
  FROM arm_sessions
  WHERE id = session_id
  FOR UPDATE;
  
  -- Session doesn't exist
  IF session_row IS NULL THEN
    RETURN QUERY SELECT false, 'SESSION_NOT_FOUND'::text, NULL::text, 0;
    RETURN;
  END IF;
  
  -- Session already spent
  IF session_row.spent_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'CANARY_ALREADY_CONSUMED'::text, session_row.mode, 0;
    RETURN;
  END IF;
  
  -- Session expired
  IF session_row.expires_at < now() THEN
    RETURN QUERY SELECT false, 'SESSION_EXPIRED'::text, session_row.mode, 0;
    RETURN;
  END IF;
  
  -- All checks passed - atomically spend the session
  UPDATE arm_sessions
  SET 
    spent_at = now(),
    spent_by_request_id = request_id,
    orders_executed = orders_executed + 1
  WHERE id = session_id;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  IF updated_count = 1 THEN
    RETURN QUERY SELECT true, 'OK'::text, session_row.mode, (session_row.max_live_orders - session_row.orders_executed - 1);
  ELSE
    RETURN QUERY SELECT false, 'UPDATE_FAILED'::text, session_row.mode, 0;
  END IF;
END;
$$;