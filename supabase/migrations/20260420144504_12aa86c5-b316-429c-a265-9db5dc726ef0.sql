-- Create tour_history table to archive completed/prepared tours
CREATE TABLE public.tour_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tour_date DATE NOT NULL,
  zone_id UUID NULL,
  zone_name TEXT NULL,
  zone_color TEXT NULL,
  week_number INTEGER NULL,
  day_of_week INTEGER NULL,
  departure JSONB NULL,
  arrival JSONB NULL,
  stops JSONB NOT NULL DEFAULT '[]'::jsonb,
  stops_count INTEGER NOT NULL DEFAULT 0,
  total_distance_km NUMERIC NULL,
  total_travel_min INTEGER NULL,
  total_visit_min INTEGER NULL,
  estimated_duration_min INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'prepared',
  source TEXT NOT NULL DEFAULT 'manual',
  used_real_routing BOOLEAN NOT NULL DEFAULT false,
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_tour_history_user_date ON public.tour_history(user_id, tour_date DESC);
CREATE INDEX idx_tour_history_zone ON public.tour_history(zone_id);

ALTER TABLE public.tour_history ENABLE ROW LEVEL SECURITY;

-- A rep sees their own history
CREATE POLICY "Reps see own tour history"
ON public.tour_history
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admins/managers see everything
CREATE POLICY "Admins see all tour history"
ON public.tour_history
FOR SELECT
TO authenticated
USING (public.is_admin_or_manager(auth.uid()));

-- Users can create entries for themselves
CREATE POLICY "Users insert own tour history"
ON public.tour_history
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Admins can also create on behalf (impersonation)
CREATE POLICY "Admins insert any tour history"
ON public.tour_history
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- Owner or admin can delete
CREATE POLICY "Owner or admin can delete tour history"
ON public.tour_history
FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));

-- No UPDATE policy on purpose: history is read-only