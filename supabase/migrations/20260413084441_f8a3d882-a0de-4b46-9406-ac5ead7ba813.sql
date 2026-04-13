
-- Add rep_assignment_mode to track commercial assignment method
ALTER TABLE public.customers 
  ADD COLUMN rep_assignment_mode text NOT NULL DEFAULT 'automatic';
