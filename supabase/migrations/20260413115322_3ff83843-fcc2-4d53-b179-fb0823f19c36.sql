
CREATE TABLE public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  label text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage settings" ON public.app_settings
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.app_settings (setting_key, setting_value, label) VALUES
  ('visit_duration_client', '30', 'Temps estimé visite client (min)'),
  ('visit_duration_prospect', '20', 'Temps estimé visite prospect (min)'),
  ('visit_duration_prospect_qualifie', '30', 'Temps estimé visite prospect qualifié (min)');
