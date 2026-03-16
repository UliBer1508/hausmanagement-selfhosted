
-- 1. Neue Spalte linen_order_id zur bestehenden laundry_invoices Tabelle
ALTER TABLE public.laundry_invoices 
ADD COLUMN linen_order_id UUID REFERENCES public.linen_orders(id) ON DELETE SET NULL UNIQUE;

-- 2. Trigger-Funktion: Erstellt automatisch Entwurfs-Rechnung bei neuer Wäschebestellung
CREATE OR REPLACE FUNCTION public.create_draft_invoice_for_linen_order()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  house_name TEXT;
BEGIN
  -- Haus-Name für Notizen laden
  SELECT name INTO house_name FROM public.houses WHERE id = NEW.house_id;

  INSERT INTO public.laundry_invoices (
    external_rechnung_id,
    rechnungsnummer,
    rechnungsdatum,
    bruttobetrag,
    status,
    linen_order_id,
    kunde_name,
    notes
  ) VALUES (
    gen_random_uuid()::text,
    'ENTWURF-' || LEFT(NEW.id::text, 8),
    NEW.order_date,
    0,
    'offen',
    NEW.id,
    'Teuni Wäscheservice',
    'Auto-Entwurf für Bestellung ' || COALESCE(house_name, 'Unbekannt') || ' (' || NEW.order_date || ')'
  );

  RETURN NEW;
END;
$function$;

-- 3. Trigger auf linen_orders
CREATE TRIGGER create_invoice_on_linen_order
  AFTER INSERT ON public.linen_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.create_draft_invoice_for_linen_order();
