
CREATE TABLE public.conversion_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  reviewed_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  comment TEXT,
  review_comment TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.conversion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reps can create conversion requests"
ON public.conversion_requests FOR INSERT
WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Reps see own requests"
ON public.conversion_requests FOR SELECT
USING (requested_by = auth.uid());

CREATE POLICY "Admins/managers see all requests"
ON public.conversion_requests FOR SELECT
USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can update requests"
ON public.conversion_requests FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_conversion_requests_updated_at
BEFORE UPDATE ON public.conversion_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
