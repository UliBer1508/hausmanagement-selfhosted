
-- 1. Fix trigger: use CURRENT_DATE instead of order_date
CREATE OR REPLACE FUNCTION public.create_draft_invoice_for_linen_order()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    CURRENT_DATE,
    0, 'offen', 'Teuni Wäscheservice',
    'Auto-erstellt für ' || COALESCE(house_name, 'Unbekannt') || ' - Bestellung vom ' || NEW.order_date
  )
  RETURNING id INTO new_invoice_id;
  
  NEW.laundry_invoice_id := new_invoice_id;
  
  RETURN NEW;
END;
$function$;

-- 2. Fix existing draft invoices: set rechnungsdatum from linked linen_order.order_date
UPDATE public.laundry_invoices li
SET rechnungsdatum = lo.order_date
FROM public.linen_orders lo
WHERE lo.laundry_invoice_id = li.id
  AND li.rechnungsnummer LIKE 'ENTWURF-%'
  AND li.bruttobetrag = 0;
