-- 64_waescherechnung_abgleich.sql
-- Protokoll des Abgleichs Teuni-Rechnung <-> Waeschebestellung (03.10.2026).
-- Je Rechnungszeile: gleich / angeglichen / akzeptiert (mit Begruendung).
-- Jede Anweisung einzeln im Supabase SQL-Editor ausfuehren.

alter table public.laundry_invoices add column if not exists abgleich jsonb;

comment on column public.laundry_invoices.abgleich is
  'Abgleich Rechnung gegen Bestellung beim Ablegen (lib/rechnungsAbgleich.ts, Protokoll version 1). null = vor dem 03.10.2026 angelegt.';

-- Kontrolle: muss eine Zeile liefern
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'laundry_invoices' and column_name = 'abgleich';
