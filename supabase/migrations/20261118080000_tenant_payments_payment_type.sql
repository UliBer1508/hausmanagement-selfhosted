-- Sonderzahlungen in tenant_payments (18.11.2026)
--
-- Anlass: Mieter Winthirstrasse hat nach fünf offenen Monaten einen Pauschalbetrag
-- (12.447 €) überwiesen, der zu keiner einzelnen Monatsmiete passt.
--
-- 'rent'    = Monatsmiete (bisheriges Verhalten, Standard für alle bestehenden Zeilen)
-- 'special' = Sonderzahlung: ein Geldeingang, der (noch) keinem Monat zugeordnet ist.
--             Bei einer Sonderzahlung gilt: status = 'paid',
--             due_date = payment_date = Eingangsdatum.
--
-- Spätere Zuordnung zu Monaten ist vorbereitet, aber bewusst NICHT Teil dieser
-- Migration: geplant ist eine eigene Tabelle tenant_payment_allocations
-- (special_payment_id → rent_payment_id, amount). Die Sonderzahlung bleibt dabei
-- als eine Zeile erhalten (= Kontoauszug), die Zuordnung kommt dazu.
--
-- Keine neue Tabelle → keine GRANTs nötig (Regel ab 30.10.2026 gilt nur für CREATE TABLE).

alter table public.tenant_payments
  add column if not exists payment_type text not null default 'rent';

alter table public.tenant_payments
  drop constraint if exists tenant_payments_payment_type_check;

alter table public.tenant_payments
  add constraint tenant_payments_payment_type_check
  check (payment_type in ('rent', 'special'));

comment on column public.tenant_payments.payment_type is
  'rent = Monatsmiete, special = Sonderzahlung (Pauschalbetrag, keinem Monat zugeordnet)';
