-- Enable RLS on critical tables for ConnectedBookingView
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleaning_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_order_items ENABLE ROW LEVEL SECURITY;

-- Create permissive policies to allow read access to all users for now
CREATE POLICY "Allow read access to bookings" ON public.bookings FOR SELECT USING (true);
CREATE POLICY "Allow read access to service_tasks" ON public.service_tasks FOR SELECT USING (true);
CREATE POLICY "Allow read access to laundry_orders" ON public.laundry_orders FOR SELECT USING (true);
CREATE POLICY "Allow read access to houses" ON public.houses FOR SELECT USING (true);
CREATE POLICY "Allow read access to service_providers" ON public.service_providers FOR SELECT USING (true);
CREATE POLICY "Allow read access to cleaning_staff" ON public.cleaning_staff FOR SELECT USING (true);
CREATE POLICY "Allow read access to laundry_staff" ON public.laundry_staff FOR SELECT USING (true);
CREATE POLICY "Allow read access to laundry_order_items" ON public.laundry_order_items FOR SELECT USING (true);