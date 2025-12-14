-- Add INSERT policy for client-side alert creation
CREATE POLICY "Allow public insert on performance_alerts"
ON public.performance_alerts
FOR INSERT
WITH CHECK (true);

-- Add UPDATE policy for acknowledging alerts
CREATE POLICY "Allow public update on performance_alerts"
ON public.performance_alerts
FOR UPDATE
USING (true)
WITH CHECK (true);