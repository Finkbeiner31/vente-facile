
-- Add week_number column with default 0
ALTER TABLE public.weekly_zone_planning ADD COLUMN week_number integer NOT NULL DEFAULT 0;

-- Add check constraint
ALTER TABLE public.weekly_zone_planning ADD CONSTRAINT weekly_zone_planning_week_number_check CHECK (week_number >= 0 AND week_number <= 3);

-- Drop old unique constraint and create new one
ALTER TABLE public.weekly_zone_planning DROP CONSTRAINT weekly_zone_planning_user_id_day_of_week_key;
ALTER TABLE public.weekly_zone_planning ADD CONSTRAINT weekly_zone_planning_user_week_day_key UNIQUE (user_id, week_number, day_of_week);

-- Add policy for admins/managers to manage all planning (for impersonation)
CREATE POLICY "Admins/managers can manage all plannings"
ON public.weekly_zone_planning
FOR ALL
TO authenticated
USING (is_admin_or_manager(auth.uid()))
WITH CHECK (is_admin_or_manager(auth.uid()));
