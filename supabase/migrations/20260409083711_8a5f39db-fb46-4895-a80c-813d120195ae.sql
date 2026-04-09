
-- Monthly revenue history per customer
CREATE TABLE public.monthly_revenues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  monthly_revenue NUMERIC NOT NULL DEFAULT 0,
  imported_by UUID NOT NULL,
  import_batch_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (customer_id, month, year)
);

ALTER TABLE public.monthly_revenues ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins can manage monthly revenues"
  ON public.monthly_revenues FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Managers can view all
CREATE POLICY "Managers can view monthly revenues"
  ON public.monthly_revenues FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role));

-- Reps can view for their customers
CREATE POLICY "Reps can view own customer revenues"
  ON public.monthly_revenues FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.customers
    WHERE customers.id = monthly_revenues.customer_id
    AND customers.assigned_rep_id = auth.uid()
  ));

CREATE INDEX idx_monthly_revenues_customer ON public.monthly_revenues(customer_id);
CREATE INDEX idx_monthly_revenues_period ON public.monthly_revenues(year DESC, month DESC);

CREATE TRIGGER update_monthly_revenues_updated_at
  BEFORE UPDATE ON public.monthly_revenues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Import logs
CREATE TABLE public.revenue_import_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  rows_matched INTEGER NOT NULL DEFAULT 0,
  rows_created INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  rows_errors INTEGER NOT NULL DEFAULT 0,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.revenue_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage import logs"
  ON public.revenue_import_logs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
