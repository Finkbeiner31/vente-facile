-- Table for caching AI-generated client report syntheses
CREATE TABLE public.client_report_syntheses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  summary TEXT NOT NULL,
  sentiment TEXT NOT NULL,
  potential TEXT NOT NULL,
  opportunities TEXT,
  risks TEXT,
  next_actions TEXT,
  reports_count INTEGER NOT NULL DEFAULT 0,
  latest_report_date DATE,
  generated_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(customer_id)
);

ALTER TABLE public.client_report_syntheses ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated who can see the client can see the synthesis
CREATE POLICY "Users can view syntheses for accessible customers"
ON public.client_report_syntheses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.customers
    WHERE customers.id = client_report_syntheses.customer_id
    AND (
      customers.assigned_rep_id = auth.uid()
      OR (customers.exceptional_commercial_id = auth.uid() AND customers.management_mode = 'exceptional')
      OR public.is_admin_or_manager(auth.uid())
    )
  )
);

CREATE POLICY "Users can insert syntheses for accessible customers"
ON public.client_report_syntheses
FOR INSERT
TO authenticated
WITH CHECK (
  generated_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.customers
    WHERE customers.id = client_report_syntheses.customer_id
    AND (
      customers.assigned_rep_id = auth.uid()
      OR (customers.exceptional_commercial_id = auth.uid() AND customers.management_mode = 'exceptional')
      OR public.is_admin_or_manager(auth.uid())
    )
  )
);

CREATE POLICY "Users can update syntheses for accessible customers"
ON public.client_report_syntheses
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.customers
    WHERE customers.id = client_report_syntheses.customer_id
    AND (
      customers.assigned_rep_id = auth.uid()
      OR (customers.exceptional_commercial_id = auth.uid() AND customers.management_mode = 'exceptional')
      OR public.is_admin_or_manager(auth.uid())
    )
  )
);

CREATE INDEX idx_client_report_syntheses_customer ON public.client_report_syntheses(customer_id);

CREATE TRIGGER update_client_report_syntheses_updated_at
BEFORE UPDATE ON public.client_report_syntheses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();