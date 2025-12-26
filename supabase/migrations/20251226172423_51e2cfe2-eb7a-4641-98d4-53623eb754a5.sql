-- Allow public UPDATE access on system_state for trade mode toggling
CREATE POLICY "Allow public update on system_state" 
ON public.system_state 
FOR UPDATE 
USING (true)
WITH CHECK (true);