
-- Commercial zones table
CREATE TABLE public.commercial_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.commercial_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view zones"
  ON public.commercial_zones FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage zones"
  ON public.commercial_zones FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add zone column to customers
ALTER TABLE public.customers ADD COLUMN zone TEXT DEFAULT NULL;

-- Weekly zone planning per user
CREATE TABLE public.weekly_zone_planning (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  zone_id UUID REFERENCES public.commercial_zones(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, day_of_week)
);

ALTER TABLE public.weekly_zone_planning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own planning"
  ON public.weekly_zone_planning FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins/managers can view all plannings"
  ON public.weekly_zone_planning FOR SELECT TO authenticated
  USING (is_admin_or_manager(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_commercial_zones_updated_at
  BEFORE UPDATE ON public.commercial_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_weekly_zone_planning_updated_at
  BEFORE UPDATE ON public.weekly_zone_planning
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
