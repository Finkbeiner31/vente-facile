ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS equipment_types text[] DEFAULT '{}'::text[];