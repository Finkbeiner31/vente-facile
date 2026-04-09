
-- Add fleet breakdown and equipment type to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS fleet_pl integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fleet_vu integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fleet_remorque integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fleet_car_bus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equipment_type text;

-- Create vehicle type potentials config table
CREATE TABLE public.vehicle_type_potentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_type text NOT NULL UNIQUE,
  label text NOT NULL,
  annual_potential numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_type_potentials ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view
CREATE POLICY "Authenticated users can view potentials"
  ON public.vehicle_type_potentials FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage potentials"
  ON public.vehicle_type_potentials FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed default values
INSERT INTO public.vehicle_type_potentials (vehicle_type, label, annual_potential) VALUES
  ('poids_lourds', 'Poids lourds', 3500),
  ('vu', 'VU', 2500),
  ('remorque', 'Remorque', 2000),
  ('car_bus', 'CAR & BUS', 3000);

-- Trigger for updated_at
CREATE TRIGGER update_vehicle_type_potentials_updated_at
  BEFORE UPDATE ON public.vehicle_type_potentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
