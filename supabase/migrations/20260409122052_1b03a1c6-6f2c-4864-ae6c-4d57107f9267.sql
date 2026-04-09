ALTER TABLE public.commercial_zones
  ADD COLUMN cities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN postal_codes text[] NOT NULL DEFAULT '{}';