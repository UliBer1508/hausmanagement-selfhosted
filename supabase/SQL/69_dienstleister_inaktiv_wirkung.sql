-- =============================================================================
-- 69_dienstleister_inaktiv_wirkung.sql
-- Dienstleister aktiv/inaktiv schalten — und je Dienstleister wählen, was
-- "inaktiv" bewirkt
-- =============================================================================
--
-- WARUM (09.11.2026):
-- Amela wird voraussichtlich nicht mehr putzen. Bisher war sie an mehreren
-- Stellen fest verdrahtet (u. a. create-cleaning-task-for-booking weist jeder
-- neuen Reinigung die Reinigungskraft "Amela" zu). Uli will in der Provider
-- Verwaltung je Dienstleister einen Aktiv-Schalter und selbst auswählen, was
-- ein inaktiver Dienstleister nicht mehr bekommt.
--
-- `service_providers.is_active` gibt es schon. Neu ist die Auswahlliste
-- `inaktiv_wirkung`. Sie gilt NUR, solange is_active = false ist:
--
--   keine_reinigungen  Automatik legt keine neuen Reinigungen mehr für ihn an
--                      (Reinigung entsteht dann OHNE Dienstleister, zum
--                      Zuweisen von Hand)
--   keine_nachrichten  keine Max-Terminfragen, Wäsche-Erinnerungen,
--                      E-Mail-Erinnerungen und Chat-Nachrichten von Max
--   nicht_waehlbar     beim Anlegen/Bearbeiten einer Reinigung und als
--                      Standard-Dienstleister nicht mehr auswählbar
--   portal_gesperrt    sein Portal zeigt nur noch "Zugang deaktiviert"
--
-- Standard für alle: die ersten drei. Die Portal-Sperre wählt Uli bewusst
-- selbst, weil sie dem Dienstleister auch den Blick auf alte Aufträge nimmt.
--
-- Bereits geplante Reinigungen bleiben unverändert (Uli-Entscheidung
-- 09.11.2026: "Stehen lassen").
--
-- Idempotent: mehrfaches Ausführen ändert nichts weiter.
-- =============================================================================

alter table public.service_providers
  add column if not exists inaktiv_wirkung text[] not null
    default array['keine_reinigungen', 'keine_nachrichten', 'nicht_waehlbar']::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'service_providers_inaktiv_wirkung_chk'
  ) then
    alter table public.service_providers
      add constraint service_providers_inaktiv_wirkung_chk
      check (inaktiv_wirkung <@ array['keine_reinigungen', 'keine_nachrichten', 'nicht_waehlbar', 'portal_gesperrt']::text[]);
  end if;
end $$;

comment on column public.service_providers.inaktiv_wirkung is
  'Was gilt, solange is_active = false: keine_reinigungen, keine_nachrichten, nicht_waehlbar, portal_gesperrt. Einstellbar in der Provider Verwaltung.';

-- is_active war bisher nullable; NULL wird überall als "aktiv" gelesen.
-- Hier nur vereinheitlichen, damit Filter mit is_active = true nichts verlieren.
update public.service_providers set is_active = true where is_active is null;


-- =============================================================================
-- KONTROLLE NACH DEM EINSPIELEN
-- =============================================================================
--
--   select name, is_active, inaktiv_wirkung, has_portal
--   from public.service_providers order by name;
--
-- Erwartet: alle Dienstleister mit is_active true/false und der Liste
-- {keine_reinigungen,keine_nachrichten,nicht_waehlbar}.

-- -----------------------------------------------------------------------------
-- Reinigungskraft Amela ihrem Dienstleister zuordnen
-- -----------------------------------------------------------------------------
-- create-cleaning-task-for-booking weist seit 09.11.2026 nicht mehr fest
-- "Amela" zu, sondern die aktive Reinigungskraft DES Dienstleisters
-- (cleaning_staff.service_provider_id). Damit Amelas Reinigungen weiter wie
-- bisher ihr zugeordnet werden, solange sie aktiv ist, wird die Verknüpfung
-- hier gesetzt, falls sie fehlt.
update public.cleaning_staff
set service_provider_id = '9de6e071-7e89-4d66-9433-a5f01acaa493'
where name ilike 'Amela' and service_provider_id is null;

--   select name, is_active, service_provider_id from public.cleaning_staff order by name;
