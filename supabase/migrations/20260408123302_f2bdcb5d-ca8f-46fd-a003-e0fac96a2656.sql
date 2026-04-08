
ALTER TABLE public.visit_reports ADD COLUMN IF NOT EXISTS visit_status text NOT NULL DEFAULT 'planned';
ALTER TABLE public.visit_reports ADD COLUMN IF NOT EXISTS quick_outcome text;
ALTER TABLE public.visit_reports ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.visit_reports ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS next_action_date date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS next_action_description text;
