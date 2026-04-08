
-- Create promotions table
CREATE TABLE public.promotions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  product_or_category TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  promotion_type TEXT NOT NULL DEFAULT 'discount_percent',
  discount_value NUMERIC,
  image_url TEXT,
  pdf_url TEXT,
  target_customer_type TEXT,
  target_region TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view promotions"
ON public.promotions FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins/managers can create promotions"
ON public.promotions FOR INSERT TO authenticated
WITH CHECK (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins/managers can update promotions"
ON public.promotions FOR UPDATE TO authenticated
USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins/managers can delete promotions"
ON public.promotions FOR DELETE TO authenticated
USING (is_admin_or_manager(auth.uid()));

-- Add promotion fields to visit_reports
ALTER TABLE public.visit_reports
ADD COLUMN promotion_presented BOOLEAN DEFAULT false,
ADD COLUMN promotion_id UUID REFERENCES public.promotions(id);
