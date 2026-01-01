-- Drop and recreate to make spend_arm_session idempotent
DROP FUNCTION IF EXISTS public.spend_arm_session(uuid, uuid);

CREATE FUNCTION public.spend_arm_session(request_id uuid, session_id uuid)
RETURNS TABLE(success boolean, reason text, session_mode text, orders_remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_row arm_sessions%ROWTYPE;
BEGIN
  -- Lock the row for update
  SELECT * INTO session_row
  FROM arm_sessions
  WHERE id = session_id
  FOR UPDATE;

  -- Session not found
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'SESSION_NOT_FOUND'::text, ''::text, 0;
    RETURN;
  END IF;

  -- Idempotency: if this exact request already spent it, treat as success
  IF session_row.spent_at IS NOT NULL AND session_row.spent_by_request_id = request_id THEN
    RETURN QUERY SELECT true, 'OK_IDEMPOTENT'::text, session_row.mode, 0;
    RETURN;
  END IF;

  -- Already spent by a different request
  IF session_row.spent_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'CANARY_ALREADY_CONSUMED'::text, session_row.mode, 0;
    RETURN;
  END IF;

  -- Session expired
  IF session_row.expires_at < now() THEN
    RETURN QUERY SELECT false, 'SESSION_EXPIRED'::text, session_row.mode, 0;
    RETURN;
  END IF;

  -- Spend the session
  UPDATE arm_sessions
  SET 
    spent_at = now(),
    spent_by_request_id = request_id,
    orders_executed = orders_executed + 1
  WHERE id = session_id;

  RETURN QUERY SELECT true, 'OK'::text, session_row.mode, (session_row.max_live_orders - session_row.orders_executed - 1);
END;
$$;