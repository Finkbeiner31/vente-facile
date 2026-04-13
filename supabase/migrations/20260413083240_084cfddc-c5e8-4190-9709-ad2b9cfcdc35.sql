
-- Add exceptional management fields to customers
ALTER TABLE public.customers 
  ADD COLUMN management_mode text NOT NULL DEFAULT 'standard',
  ADD COLUMN exceptional_commercial_id uuid NULL,
  ADD COLUMN exceptional_reason text NULL;

-- Allow exceptional commercial to see the client
CREATE POLICY "Exceptional commercial can see assigned clients"
ON public.customers
FOR SELECT
TO authenticated
USING (exceptional_commercial_id = auth.uid() AND management_mode = 'exceptional');

-- Allow exceptional commercial to update the client
CREATE POLICY "Exceptional commercial can update assigned clients"
ON public.customers
FOR UPDATE
TO authenticated
USING (exceptional_commercial_id = auth.uid() AND management_mode = 'exceptional');
