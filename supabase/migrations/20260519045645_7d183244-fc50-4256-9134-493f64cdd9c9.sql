
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'ranger', 'guide', 'hiker');

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  emergency_contact TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ROLES + has_role ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- new-user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'hiker');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ LOCATIONS ============
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  lgu TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  center_lat NUMERIC(10,7) NOT NULL DEFAULT 0,
  center_lng NUMERIC(10,7) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  entry_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  default_guide_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'PHP',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER locations_updated BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  UNIQUE (user_id, location_id)
);
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- ============ GUIDES ============
CREATE TABLE public.guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  specialty TEXT NOT NULL DEFAULT '',
  per_trip_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER guides_updated BEFORE UPDATE ON public.guides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ TRAIL ZONES ============
CREATE TABLE public.trail_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  coordinates_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  max_capacity INT NOT NULL DEFAULT 50,
  difficulty TEXT NOT NULL DEFAULT 'moderate',
  elevation_meters INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trail_zones ENABLE ROW LEVEL SECURITY;

-- ============ CHECKPOINTS ============
CREATE TABLE public.checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  latitude NUMERIC(10,7) NOT NULL DEFAULT 0,
  longitude NUMERIC(10,7) NOT NULL DEFAULT 0,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;

-- ============ BOOKINGS ============
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  booking_date DATE NOT NULL,
  group_size INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  qr_code_data TEXT NOT NULL DEFAULT '',
  emergency_contact_name TEXT NOT NULL DEFAULT '',
  emergency_contact_phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_bookings_user ON public.bookings(user_id);
CREATE INDEX idx_bookings_date ON public.bookings(booking_date);

-- ============ BOOKING ASSIGNMENTS ============
CREATE TABLE public.booking_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  guide_id UUID NOT NULL REFERENCES public.guides(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.booking_assignments ENABLE ROW LEVEL SECURITY;

-- ============ DAILY CAPACITY ============
CREATE TABLE public.daily_capacity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  max_capacity INT NOT NULL DEFAULT 100,
  current_count INT NOT NULL DEFAULT 0,
  UNIQUE (location_id, date)
);
ALTER TABLE public.daily_capacity ENABLE ROW LEVEL SECURITY;

-- ============ HIKER SESSIONS ============
CREATE TABLE public.hiker_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  trail_zone_id UUID REFERENCES public.trail_zones(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  total_distance_km NUMERIC(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hiker_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.hiker_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.hiker_sessions(id) ON DELETE CASCADE,
  latitude NUMERIC(10,7) NOT NULL,
  longitude NUMERIC(10,7) NOT NULL,
  altitude NUMERIC(7,2) NOT NULL DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hiker_locations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_hiker_locations_session ON public.hiker_locations(session_id);

-- ============ CHECKPOINT SURVEYS ============
CREATE TABLE public.checkpoint_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.hiker_sessions(id) ON DELETE CASCADE,
  checkpoint_id UUID NOT NULL REFERENCES public.checkpoints(id) ON DELETE CASCADE,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checkpoint_surveys ENABLE ROW LEVEL SECURITY;

-- ============ TRAIL REPORTS ============
CREATE TABLE public.trail_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ranger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES public.trail_zones(id) ON DELETE CASCADE,
  condition TEXT NOT NULL DEFAULT 'good',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trail_reports ENABLE ROW LEVEL SECURITY;

-- ============ REVIEWS ============
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL DEFAULT '',
  rating INT NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  trail_name TEXT NOT NULL DEFAULT '',
  review_text TEXT NOT NULL DEFAULT '',
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- ============ ADMIN LOGS ============
CREATE TABLE public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============

-- profiles: user owns; admins read all
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "profiles_admin_select" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- user_roles: self read; super_admin manages
CREATE POLICY "roles_self_select" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "roles_admin_select" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "roles_super_manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- locations: public read; super_admin manage
CREATE POLICY "locations_public_read" ON public.locations FOR SELECT USING (true);
CREATE POLICY "locations_super_manage" ON public.locations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- user_locations: self read; super_admin manage
CREATE POLICY "ul_self_select" ON public.user_locations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ul_admin_select" ON public.user_locations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ul_super_manage" ON public.user_locations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- guides: public read active; admin manage
CREATE POLICY "guides_public_read" ON public.guides FOR SELECT USING (is_active = true);
CREATE POLICY "guides_admin_read" ON public.guides FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR auth.uid() = user_id);
CREATE POLICY "guides_admin_manage" ON public.guides FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- trail_zones: public read; admin manage
CREATE POLICY "tz_public_read" ON public.trail_zones FOR SELECT USING (true);
CREATE POLICY "tz_admin_manage" ON public.trail_zones FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'ranger')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'ranger'));

-- checkpoints: public read; admin manage
CREATE POLICY "cp_public_read" ON public.checkpoints FOR SELECT USING (true);
CREATE POLICY "cp_admin_manage" ON public.checkpoints FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- bookings: user owns; admin manage; guide can read their assignments
CREATE POLICY "bk_self_select" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "bk_self_insert" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bk_self_update" ON public.bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "bk_admin_all" ON public.bookings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- booking_assignments
CREATE POLICY "ba_admin_all" ON public.booking_assignments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "ba_guide_select" ON public.booking_assignments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.guides g WHERE g.id = guide_id AND g.user_id = auth.uid()));
CREATE POLICY "ba_guide_update" ON public.booking_assignments FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.guides g WHERE g.id = guide_id AND g.user_id = auth.uid()));
CREATE POLICY "ba_user_select" ON public.booking_assignments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid()));
CREATE POLICY "ba_user_insert" ON public.booking_assignments FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid()));

-- daily_capacity: public read; admin manage
CREATE POLICY "dc_public_read" ON public.daily_capacity FOR SELECT USING (true);
CREATE POLICY "dc_admin_manage" ON public.daily_capacity FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- hiker_sessions: user owns; admin all
CREATE POLICY "hs_self_select" ON public.hiker_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "hs_self_insert" ON public.hiker_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hs_self_update" ON public.hiker_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "hs_admin_all" ON public.hiker_sessions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'ranger')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'ranger'));

-- hiker_locations: via session ownership
CREATE POLICY "hl_self_select" ON public.hiker_locations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.hiker_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "hl_self_insert" ON public.hiker_locations FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.hiker_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "hl_admin_select" ON public.hiker_locations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'ranger'));

-- checkpoint_surveys: via session ownership
CREATE POLICY "cs_self_select" ON public.checkpoint_surveys FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.hiker_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "cs_self_insert" ON public.checkpoint_surveys FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.hiker_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));
CREATE POLICY "cs_admin_select" ON public.checkpoint_surveys FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- trail_reports: rangers/admins
CREATE POLICY "tr_public_read" ON public.trail_reports FOR SELECT USING (true);
CREATE POLICY "tr_ranger_insert" ON public.trail_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = ranger_id AND (public.has_role(auth.uid(),'ranger') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')));
CREATE POLICY "tr_admin_update" ON public.trail_reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR auth.uid() = ranger_id);

-- reviews: approved public; user owns own; admin moderates
CREATE POLICY "rv_public_approved" ON public.reviews FOR SELECT USING (is_approved = true);
CREATE POLICY "rv_self_select" ON public.reviews FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "rv_self_insert" ON public.reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "rv_admin_all" ON public.reviews FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- admin_logs: admins
CREATE POLICY "al_admin_all" ON public.admin_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.hiker_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hiker_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_assignments;

-- ============ SEED ============
INSERT INTO public.locations (name, slug, lgu, region, address, center_lat, center_lng, entry_fee, default_guide_fee, description)
VALUES ('Mount Kalisungan', 'mt-kalisungan', 'Calauan', 'Laguna', 'Calauan, Laguna, Philippines', 14.1475, 121.3454, 50, 500, 'Mount Kalisungan (622m) in Calauan, Laguna.');

INSERT INTO public.trail_zones (location_id, name, description, difficulty, elevation_meters, max_capacity, coordinates_json)
SELECT id, 'Summit Trail', 'Steep ascent to 622m summit through forest canopy', 'hard', 622, 30, '[]'::jsonb FROM public.locations WHERE slug='mt-kalisungan'
UNION ALL
SELECT id, 'River Trail', 'Scenic riverside path, beginner-friendly', 'easy', 350, 50, '[]'::jsonb FROM public.locations WHERE slug='mt-kalisungan'
UNION ALL
SELECT id, 'Ridge Trail', 'Panoramic ridge views', 'moderate', 480, 40, '[]'::jsonb FROM public.locations WHERE slug='mt-kalisungan';
