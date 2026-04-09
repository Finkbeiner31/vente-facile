
-- Add user_id to commercial_zones
ALTER TABLE public.commercial_zones ADD COLUMN user_id UUID DEFAULT NULL;

-- Drop old policies
DROP POLICY IF EXISTS "All authenticated users can view zones" ON public.commercial_zones;
DROP POLICY IF EXISTS "Admins can manage zones" ON public.commercial_zones;

-- New policies: admins see all, reps see own
CREATE POLICY "Admins can view all zones"
  ON public.commercial_zones FOR SELECT TO authenticated
  USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Reps can view own zones"
  ON public.commercial_zones FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all zones"
  ON public.commercial_zones FOR ALL TO authenticated
  USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Reps can manage own zones"
  ON public.commercial_zones FOR ALL TO authenticated
  USING (user_id = auth.uid());
