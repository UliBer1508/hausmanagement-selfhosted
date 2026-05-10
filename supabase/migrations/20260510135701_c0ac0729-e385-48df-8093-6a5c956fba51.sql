
-- =====================================================
-- HYBRID RLS: Admin-only für sensible Tabellen
-- =====================================================
-- Operative Tabellen (bookings, guests, houses, service_tasks, linen_orders,
-- service_providers, cleaning_staff, laundry_staff, provider_messages) bleiben
-- offen, weil externe Portal-Apps direkten DB-Zugriff brauchen.

-- Helper: Admin-only SELECT + ALL Policy via has_role
-- (has_role existiert bereits als SECURITY DEFINER)

-- ---------- system_settings ----------
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.system_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- house_ical_sources ----------
ALTER TABLE public.house_ical_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.house_ical_sources
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- user_profiles ----------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can insert profiles" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete profiles" ON public.user_profiles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------- profiles ----------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- user_roles ----------
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can modify roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------- tenant_payments ----------
ALTER TABLE public.tenant_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.tenant_payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- linen_automation_settings ----------
ALTER TABLE public.linen_automation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.linen_automation_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- utility_statements / utility_costs / utility_settings ----------
ALTER TABLE public.utility_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.utility_statements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.utility_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.utility_costs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.utility_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.utility_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- notification_preferences ----------
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- boris_notification_preferences ----------
DROP POLICY IF EXISTS "Boris notification preferences public access" ON public.boris_notification_preferences;
ALTER TABLE public.boris_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.boris_notification_preferences
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- laundry_invoices ----------
ALTER TABLE public.laundry_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.laundry_invoices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- house_additional_fees ----------
ALTER TABLE public.house_additional_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON public.house_additional_fees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- booking_inquiries: bestehende kaputte Policies ersetzen ----------
DROP POLICY IF EXISTS "Anyone can insert booking inquiries" ON public.booking_inquiries;
DROP POLICY IF EXISTS "Authenticated users can read booking inquiries" ON public.booking_inquiries;
DROP POLICY IF EXISTS "Authenticated users can update booking inquiries" ON public.booking_inquiries;

ALTER TABLE public.booking_inquiries ENABLE ROW LEVEL SECURITY;

-- Anonyme Buchungsanfragen vom Public-Site weiterhin erlaubt
CREATE POLICY "Public can submit inquiries" ON public.booking_inquiries
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Nur Admins lesen/bearbeiten
CREATE POLICY "Admin can read inquiries" ON public.booking_inquiries
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update inquiries" ON public.booking_inquiries
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete inquiries" ON public.booking_inquiries
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- STORAGE: tenant-receipts (privat) + house-images (Schreiben nur Admin)
-- =====================================================

-- tenant-receipts → privat machen
UPDATE storage.buckets SET public = false WHERE id = 'tenant-receipts';

-- Alte Policies auf storage.objects für tenant-receipts entfernen (best-effort)
DO $$ DECLARE pol record; BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname ILIKE '%tenant-receipts%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "tenant-receipts admin select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'tenant-receipts' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tenant-receipts admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tenant-receipts' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tenant-receipts admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'tenant-receipts' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'tenant-receipts' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "tenant-receipts admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'tenant-receipts' AND public.has_role(auth.uid(), 'admin'));

-- house-images: alte Schreib-Policies ersetzen, lesen bleibt öffentlich
DO $$ DECLARE pol record; BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname ILIKE '%house-images%'
      AND cmd IN ('INSERT','UPDATE','DELETE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "house-images admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'house-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "house-images admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'house-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'house-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "house-images admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'house-images' AND public.has_role(auth.uid(), 'admin'));
