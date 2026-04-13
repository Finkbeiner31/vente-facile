
-- Daily tours table
CREATE TABLE public.daily_tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tour_date date NOT NULL,
  zone_id uuid REFERENCES public.commercial_zones(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tour_date)
);

ALTER TABLE public.daily_tours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily tours" ON public.daily_tours FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage own daily tours" ON public.daily_tours FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Admins can view all daily tours" ON public.daily_tours FOR SELECT USING (is_admin_or_manager(auth.uid()));

CREATE TRIGGER update_daily_tours_updated_at BEFORE UPDATE ON public.daily_tours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Daily tour stops table
CREATE TABLE public.daily_tour_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_tour_id uuid NOT NULL REFERENCES public.daily_tours(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  stop_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned',
  visit_duration_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_tour_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tour stops" ON public.daily_tour_stops FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.daily_tours WHERE daily_tours.id = daily_tour_stops.daily_tour_id AND daily_tours.user_id = auth.uid()));
CREATE POLICY "Users can manage own tour stops" ON public.daily_tour_stops FOR ALL
  USING (EXISTS (SELECT 1 FROM public.daily_tours WHERE daily_tours.id = daily_tour_stops.daily_tour_id AND daily_tours.user_id = auth.uid()));
CREATE POLICY "Admins can view all tour stops" ON public.daily_tour_stops FOR SELECT
  USING (is_admin_or_manager(auth.uid()));

CREATE INDEX idx_daily_tours_user_date ON public.daily_tours(user_id, tour_date);
CREATE INDEX idx_daily_tour_stops_tour ON public.daily_tour_stops(daily_tour_id);
