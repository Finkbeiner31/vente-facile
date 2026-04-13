
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS entreprise_address text,
  ADD COLUMN IF NOT EXISTS entreprise_lat double precision,
  ADD COLUMN IF NOT EXISTS entreprise_lng double precision,
  ADD COLUMN IF NOT EXISTS domicile_address text,
  ADD COLUMN IF NOT EXISTS domicile_lat double precision,
  ADD COLUMN IF NOT EXISTS domicile_lng double precision,
  ADD COLUMN IF NOT EXISTS autre_address text,
  ADD COLUMN IF NOT EXISTS autre_lat double precision,
  ADD COLUMN IF NOT EXISTS autre_lng double precision;
