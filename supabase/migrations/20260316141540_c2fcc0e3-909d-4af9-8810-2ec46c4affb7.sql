-- 1. Add laundry_invoice_id to linen_orders (n:1 relationship)
ALTER TABLE public.linen_orders 
  ADD COLUMN laundry_invoice_id UUID REFERENCES public.laundry_invoices(id) ON DELETE SET NULL;

-- 2. Migrate existing links
UPDATE public.linen_orders lo
SET laundry_invoice_id = li.id
FROM public.laundry_invoices li
WHERE li.linen_order_id = lo.id;

-- 3. Update trigger to BEFORE INSERT so we can set NEW.laundry_invoice_id
DROP TRIGGER IF EXISTS create_invoice_on_linen_order ON public.linen_orders;

CREATE OR REPLACE FUNCTION public.create_draft_invoice_for_linen_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  house_name TEXT;
  new_invoice_id UUID;
BEGIN
  SELECT name INTO house_name FROM public.houses WHERE id = NEW.house_id;
  
  INSERT INTO public.laundry_invoices (
    external_rechnung_id, rechnungsnummer, rechnungsdatum,
    bruttobetrag, status, kunde_name, notes
  ) VALUES (
    gen_random_uuid(),
    'ENTWURF-' || LEFT(NEW.id::text, 8),
    NEW.order_date,
    0, 'offen', 'Teuni Wäscheservice',
    'Auto-erstellt für ' || COALESCE(house_name, 'Unbekannt') || ' - Bestellung vom ' || NEW.order_date
  )
  RETURNING id INTO new_invoice_id;
  
  NEW.laundry_invoice_id := new_invoice_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_invoice_on_linen_order
  BEFORE INSERT ON public.linen_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.create_draft_invoice_for_linen_order();

-- 4. Drop old column from laundry_invoices
ALTER TABLE public.laundry_invoices DROP COLUMN IF EXISTS linen_order_id;