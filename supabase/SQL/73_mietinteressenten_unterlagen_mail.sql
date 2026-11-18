-- 73 — Wohnen auf Zeit, Teil 2: Selbstauskunft + Unterlagen, „Als Mieter übernehmen“, E-Mail an Uli
-- Projekt: Hausverwaltung usblrulkcgucxtkhugck. Stand 18.11.2026. Baut auf SQL 72 auf.
-- Das Skript darf mehrfach laufen. Keine Personendaten in diese Datei (Repo ist öffentlich).
--
-- Was hier passiert:
--  1. Dokumenttyp „Mieterunterlagen“ + Zuordnungsart 'mietangebot' in document_links
--     (Ausweis, Einkommensnachweis … landen in der Dokumentenverwaltung/OneDrive, verknüpft mit
--     dem Angebot). Upload über die Edge Function rental-portal (Kunde ist nicht angemeldet,
--     Prüfung über den Angebots-Token).
--  2. rental_applications — Selbstauskunft des Kunden (eine je Angebot). Nur Admin lesbar;
--     geschrieben ausschließlich von rental-portal (service_role).
--  3. Spalten für „gemeldet“ (E-Mail verschickt) und „übernommen“ (Mieter eingetragen).
--  4. get_rental_offer liefert zusätzlich, ob Selbstauskunft/Unterlagen schon da sind.
--  5. Trigger → pg_net → rental-portal (Aktion notify) → E-Mail an steinbockchalets@gmail.com
--     bei neuer Mietanfrage, Antwort auf ein Angebot und eingegangener Selbstauskunft.
--     Die Function verschickt je Ereignis höchstens einmal (Spalten *_notified_at).

-- 1) Dokumenttyp + Zuordnungsart ------------------------------------------------------
insert into public.document_types (name, folder_name, color, is_active, sort_order, pruefung)
select 'Mieterunterlagen', 'Mieterunterlagen', '#8b5cf6', true,
       coalesce((select max(sort_order) from public.document_types), 0) + 1, 'keine'
where not exists (select 1 from public.document_types where lower(name) = 'mieterunterlagen');

alter table public.document_links drop constraint if exists document_links_entity_type_check;
alter table public.document_links add constraint document_links_entity_type_check
  check (entity_type = any (array['haus','provider','vendor','portal','buchung','reinigung',
                                  'waesche','verfahren','mietangebot']));

-- 2) Selbstauskunft ------------------------------------------------------------------------
create table if not exists public.rental_applications (
  id                     uuid primary key default gen_random_uuid(),
  offer_id               uuid not null unique references public.rental_offers(id) on delete cascade,
  full_name              text not null check (length(trim(full_name)) between 2 and 120),
  birth_date             date,
  current_address        text check (length(current_address) <= 300),
  occupation             text check (length(occupation) <= 120),
  employer               text check (length(employer) <= 160),
  employed_since         text check (length(employed_since) <= 40),
  net_income_month       numeric(10,2) check (net_income_month is null or net_income_month >= 0),
  adults                 integer check (adults is null or adults between 1 and 20),
  children               integer check (children is null or children between 0 and 20),
  pets                   text check (length(pets) <= 200),
  previous_landlord      text check (length(previous_landlord) <= 200),
  no_debt_enforcement    boolean not null default false, -- keine laufenden Exekutions-/Insolvenzverfahren (Eigenangabe)
  consent_privacy        boolean not null check (consent_privacy),  -- Einwilligung Datenschutz Pflicht
  remarks                text check (length(remarks) <= 2000),
  notified_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.rental_applications is
  'Selbstauskunft Mietinteressent (je Angebot). Nur Admin; geschrieben von Edge Function rental-portal.';

drop trigger if exists update_rental_applications_updated_at on public.rental_applications;
create trigger update_rental_applications_updated_at before update on public.rental_applications
  for each row execute function update_updated_at_column();

alter table public.rental_applications enable row level security;
drop policy if exists "Admin full access" on public.rental_applications;
create policy "Admin full access" on public.rental_applications
  for all to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

revoke all on public.rental_applications from anon;
grant select, insert, update, delete on public.rental_applications to authenticated;
grant select, insert, update, delete on public.rental_applications to service_role;

-- 3) Gemeldet / übernommen --------------------------------------------------------------------
alter table public.rental_inquiries add column if not exists notified_at timestamptz;
alter table public.rental_offers    add column if not exists response_notified_at timestamptz;
alter table public.rental_offers    add column if not exists converted_at timestamptz;  -- „Als Mieter übernehmen“

-- 4) get_rental_offer: zusätzlich Stand der Unterlagen --------------------------------------------
create or replace function public.get_rental_offer(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.rental_offers;
  h public.houses;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select * into o from public.rental_offers
  where token = p_token and status in ('released','viewed','accepted','question');
  if not found then
    return null;
  end if;

  if o.viewed_at is null and not coalesce(has_role(auth.uid(), 'admin'::app_role), false) then
    update public.rental_offers
      set viewed_at = now(),
          status = case when status = 'released' then 'viewed' else status end
      where id = o.id
      returning * into o;
  end if;

  select * into h from public.houses where id = o.house_id;

  return json_build_object(
    'house_name', h.name,
    'house_location', h.address,
    'guest_name', o.guest_name,
    'language', o.language,
    'rent_month', o.rent_month,
    'utilities_month', o.utilities_month,
    'utilities_mode', o.utilities_mode,
    'deposit', o.deposit,
    'final_cleaning_fee', o.final_cleaning_fee,
    'move_in', o.move_in,
    'duration_months', o.duration_months,
    'conditions_de', o.conditions_de,
    'conditions_en', o.conditions_en,
    'valid_until', o.valid_until,
    'expired', o.valid_until < current_date,
    'status', o.status,
    'responded_at', o.responded_at,
    'application_submitted', exists (select 1 from public.rental_applications a where a.offer_id = o.id),
    'documents', (select coalesce(json_agg(json_build_object('name', d.file_name, 'at', d.created_at)
                                           order by d.created_at), '[]'::json)
                  from public.document_links l
                  join public.documents d on d.id = l.document_id
                  where l.entity_type = 'mietangebot' and l.entity_id = o.id)
  );
end;
$$;

revoke all on function public.get_rental_offer(text) from public;
grant execute on function public.get_rental_offer(text) to anon, authenticated, service_role;

-- 5) Benachrichtigung per E-Mail über die Edge Function rental-portal --------------------------
-- Die Function liest die Zeile selbst nach und verschickt nur, wenn *_notified_at leer ist.
create or replace function public.notify_rental_portal(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://usblrulkcgucxtkhugck.supabase.co/functions/v1/rental-portal',
    body := jsonb_build_object('action', 'notify', 'kind', p_kind, 'id', p_id),
    -- anon-Key wie in SQL 68 (öffentlich): nur für das Gateway, die Function prüft selbst.
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzYmxydWxrY2d1Y3h0a2h1Z2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5NjI4MDMsImV4cCI6MjA2OTUzODgwM30.yvF7KPN9_xhOidfRzAdiYEJASycMPLbQCoXJyAJObwI'
    )
  );
exception when others then
  -- Mail ist Zusatz: Ein Fehler hier darf die Anfrage/Antwort nie verhindern.
  raise warning 'notify_rental_portal % %: %', p_kind, p_id, sqlerrm;
end;
$$;

revoke all on function public.notify_rental_portal(text, uuid) from public, anon, authenticated;

create or replace function public.trg_rental_inquiry_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_rental_portal('inquiry', new.id);
  return new;
end;
$$;

create or replace function public.trg_rental_offer_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('accepted','question')
     and new.responded_at is distinct from old.responded_at then
    perform public.notify_rental_portal('response', new.id);
  end if;
  return new;
end;
$$;

create or replace function public.trg_rental_application_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_rental_portal('application', new.id);
  return new;
end;
$$;

drop trigger if exists rental_inquiry_notify on public.rental_inquiries;
create trigger rental_inquiry_notify after insert on public.rental_inquiries
  for each row execute function public.trg_rental_inquiry_notify();

drop trigger if exists rental_offer_notify on public.rental_offers;
create trigger rental_offer_notify after update on public.rental_offers
  for each row execute function public.trg_rental_offer_notify();

drop trigger if exists rental_application_notify on public.rental_applications;
create trigger rental_application_notify after insert on public.rental_applications
  for each row execute function public.trg_rental_application_notify();

-- Kontrolle
select (select count(*) from public.document_types where name = 'Mieterunterlagen') as dokumenttyp,
       (select count(*) from information_schema.tables where table_name = 'rental_applications') as selbstauskunft;
