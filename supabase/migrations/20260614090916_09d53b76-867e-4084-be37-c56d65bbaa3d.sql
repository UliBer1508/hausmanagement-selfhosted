DROP POLICY IF EXISTS "Authenticated users full access" ON public.booking_charges;
DROP POLICY IF EXISTS "Authenticated users full access" ON public.payments;

CREATE POLICY "Admin full access" ON public.booking_charges
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin full access" ON public.payments
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));