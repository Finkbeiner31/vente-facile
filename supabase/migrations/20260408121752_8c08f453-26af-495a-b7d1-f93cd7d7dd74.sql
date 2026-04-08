-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'sales_rep', 'executive');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  team_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'sales_rep',
  UNIQUE(user_id, role)
);

-- Create customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  phone TEXT,
  email TEXT,
  website TEXT,
  activity_type TEXT,
  account_status TEXT NOT NULL DEFAULT 'active',
  customer_type TEXT NOT NULL DEFAULT 'prospect',
  sales_potential TEXT DEFAULT 'C',
  assigned_rep_id UUID REFERENCES auth.users(id),
  visit_frequency TEXT DEFAULT 'mensuelle',
  last_visit_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create contacts table
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create routes table
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES auth.users(id),
  route_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  total_distance_km DOUBLE PRECISION,
  estimated_duration_min INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create route_stops table
CREATE TABLE public.route_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  stop_order INTEGER NOT NULL,
  planned_time TIME,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create visit_reports table
CREATE TABLE public.visit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id UUID NOT NULL REFERENCES auth.users(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  route_stop_id UUID REFERENCES public.route_stops(id),
  contact_id UUID REFERENCES public.contacts(id),
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_purpose TEXT,
  summary TEXT,
  customer_needs TEXT,
  opportunities_detected TEXT,
  competitor_info TEXT,
  next_actions TEXT,
  follow_up_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_to UUID NOT NULL REFERENCES auth.users(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  visit_report_id UUID REFERENCES public.visit_reports(id),
  customer_id UUID REFERENCES public.customers(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create opportunities table
CREATE TABLE public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  rep_id UUID NOT NULL REFERENCES auth.users(id),
  visit_report_id UUID REFERENCES public.visit_reports(id),
  title TEXT NOT NULL,
  estimated_amount DECIMAL(12,2),
  stage TEXT NOT NULL DEFAULT 'prospection',
  expected_close_date DATE,
  probability INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create attachments table
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_report_id UUID REFERENCES public.visit_reports(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create activity_logs table
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function for role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Security definer: check if user is admin or manager
CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'manager')
  )
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_visit_reports_updated_at BEFORE UPDATE ON public.visit_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_opportunities_updated_at BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'sales_rep');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- PROFILES RLS
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins/managers can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- USER_ROLES RLS
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- CUSTOMERS RLS
CREATE POLICY "Reps see own customers" ON public.customers FOR SELECT USING (assigned_rep_id = auth.uid());
CREATE POLICY "Admins/managers see all customers" ON public.customers FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Reps can create customers" ON public.customers FOR INSERT WITH CHECK (assigned_rep_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Reps can update own customers" ON public.customers FOR UPDATE USING (assigned_rep_id = auth.uid() OR public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Admins can delete customers" ON public.customers FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- CONTACTS RLS
CREATE POLICY "Users can view contacts of their customers" ON public.contacts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.customers WHERE id = customer_id AND (assigned_rep_id = auth.uid() OR public.is_admin_or_manager(auth.uid())))
);
CREATE POLICY "Users can manage contacts of their customers" ON public.contacts FOR ALL USING (
  EXISTS (SELECT 1 FROM public.customers WHERE id = customer_id AND (assigned_rep_id = auth.uid() OR public.is_admin_or_manager(auth.uid())))
);

-- ROUTES RLS
CREATE POLICY "Reps see own routes" ON public.routes FOR SELECT USING (rep_id = auth.uid());
CREATE POLICY "Admins/managers see all routes" ON public.routes FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Reps can manage own routes" ON public.routes FOR ALL USING (rep_id = auth.uid());

-- ROUTE_STOPS RLS
CREATE POLICY "Users can view stops of their routes" ON public.route_stops FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.routes WHERE id = route_id AND (rep_id = auth.uid() OR public.is_admin_or_manager(auth.uid())))
);
CREATE POLICY "Users can manage stops of their routes" ON public.route_stops FOR ALL USING (
  EXISTS (SELECT 1 FROM public.routes WHERE id = route_id AND rep_id = auth.uid())
);

-- VISIT_REPORTS RLS
CREATE POLICY "Reps see own reports" ON public.visit_reports FOR SELECT USING (rep_id = auth.uid());
CREATE POLICY "Admins/managers see all reports" ON public.visit_reports FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Reps can create reports" ON public.visit_reports FOR INSERT WITH CHECK (rep_id = auth.uid());
CREATE POLICY "Reps can update own reports" ON public.visit_reports FOR UPDATE USING (rep_id = auth.uid());

-- TASKS RLS
CREATE POLICY "Users see own tasks" ON public.tasks FOR SELECT USING (assigned_to = auth.uid() OR created_by = auth.uid());
CREATE POLICY "Admins/managers see all tasks" ON public.tasks FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Users can create tasks" ON public.tasks FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "Users can update own tasks" ON public.tasks FOR UPDATE USING (assigned_to = auth.uid() OR created_by = auth.uid());

-- OPPORTUNITIES RLS
CREATE POLICY "Reps see own opportunities" ON public.opportunities FOR SELECT USING (rep_id = auth.uid());
CREATE POLICY "Admins/managers see all opportunities" ON public.opportunities FOR SELECT USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Reps can manage own opportunities" ON public.opportunities FOR ALL USING (rep_id = auth.uid());

-- ATTACHMENTS RLS
CREATE POLICY "Users can view attachments of their reports" ON public.attachments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.visit_reports WHERE id = visit_report_id AND (rep_id = auth.uid() OR public.is_admin_or_manager(auth.uid())))
);
CREATE POLICY "Users can upload attachments" ON public.attachments FOR INSERT WITH CHECK (uploaded_by = auth.uid());

-- ACTIVITY_LOGS RLS
CREATE POLICY "Users see own logs" ON public.activity_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins see all logs" ON public.activity_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can create logs" ON public.activity_logs FOR INSERT WITH CHECK (user_id = auth.uid());

-- Indexes for performance
CREATE INDEX idx_customers_assigned_rep ON public.customers(assigned_rep_id);
CREATE INDEX idx_customers_type ON public.customers(customer_type);
CREATE INDEX idx_routes_rep_date ON public.routes(rep_id, route_date);
CREATE INDEX idx_visit_reports_rep ON public.visit_reports(rep_id);
CREATE INDEX idx_visit_reports_customer ON public.visit_reports(customer_id);
CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_to, status);
CREATE INDEX idx_opportunities_rep ON public.opportunities(rep_id);
CREATE INDEX idx_opportunities_customer ON public.opportunities(customer_id);
CREATE INDEX idx_activity_logs_user ON public.activity_logs(user_id, created_at DESC);