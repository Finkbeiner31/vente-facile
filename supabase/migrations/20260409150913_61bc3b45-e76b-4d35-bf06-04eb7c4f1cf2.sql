
-- Add zone assignment tracking columns to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS assignment_mode text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS assignment_source text,
  ADD COLUMN IF NOT EXISTS zone_status text DEFAULT 'assigned';

-- Set existing clients with a zone to 'manual' mode
UPDATE public.customers SET assignment_mode = 'manual' WHERE zone IS NOT NULL AND assignment_mode IS NULL;

-- Set existing clients without a zone to 'outside'
UPDATE public.customers SET zone_status = 'outside' WHERE zone IS NULL;
