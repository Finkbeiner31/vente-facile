CREATE POLICY "Admins/managers can create reports for any user"
ON public.visit_reports
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_manager(auth.uid()));