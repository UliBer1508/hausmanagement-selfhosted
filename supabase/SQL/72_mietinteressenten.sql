-- 72 — Mietinteressenten „Wohnen auf Zeit“ (Langzeitvermietung ab 6 Monaten)
-- Projekt: Hausverwaltung usblrulkcgucxtkhugck. Stand 18.11.2026.
--
-- Ablauf: Website-Formular (steinbockchalets.com) → rental_inquiries
--         → Uli: Kontakt, Besichtigung → Kalkulation (rental_calculations)
--         → persönliches Angebot (rental_offers) → Freigabe → Kunde sieht es über den Link
--           steinbockchalets.com/angebot/<token> (Funktion get_rental_offer)
--         → Kunde nimmt an / fragt nach (Funktion respond_rental_offer)
--
-- Bewusst NICHT booking_inquiries: das ist die Urlaubsanfrage (check_in/check_out Pflicht),
-- und Max' accept_booking_inquiry legt daraus eine Buchung an. Mietinteressenten dürfen
-- weder eine Buchung erzeugen noch von Max angenommen oder mit Preisen beantwortet werden.
--
-- Preise sind NIE öffentlich lesbar: rental_calculations und rental_offers nur Admin.
-- Kunden kommen ausschließlich über die beiden security-definer-Funktionen an IHR Angebot.
-- Keine Personendaten in diese Datei (Repo ist öffentlich).
-- Das Skript darf mehrfach laufen.

-- 1) Anfragen ------------------------------------------------------------------------
create table if not exists public.rental_inquiries (
  id                     uuid primary key default gen_random_uuid(),
  house_id               uuid not null references public.houses(id) on delete cascade,
  guest_name             text not null check (length(trim(guest_name)) between 2 and 100),
  guest_email            text not null check (length(guest_email) <= 255),
  guest_phone            text not null check (length(guest_phone) <= 40),
  move_in                date not null,
  duration_months        integer check (duration_months is null or duration_months between 1 and 120), -- leer = offen
  persons                integer not null check (persons between 1 and 20),
  purpose                text check (purpose in ('work','home_office','other')),
  purpose_detail         text check (length(purpose_detail) <= 300),
  pets                   boolean not null default false,
  registration_confirmed boolean not null default false,  -- Anmeldung bei der Gemeinde zugesagt
  message                text check (length(message) <= 2000),
  language               text not null default 'de' check (language in ('de','en')),
  source                 text not null default 'website',
  status                 text not null default 'new'
                         check (status in ('new','contacted','viewing','offer','rejected','closed')),
  seen_at                timestamptz,          -- von Uli im Hinweis-Banner als gesehen markiert
  admin_note             text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists rental_inquiries_created_idx on public.rental_inquiries (created_at desc);
create index if not exists rental_inquiries_house_idx on public.rental_inquiries (house_id);

comment on table public.rental_inquiries is
  'Mietinteressenten „Wohnen auf Zeit“ von der Website. Tab Mieter → Interessenten. Keine Buchungsanfrage.';

-- 2) Interne Kalkulation je Haus (Beträge € pro Jahr) ---------------------------------
create table if not exists public.rental_calculations (
  house_id              uuid primary key references public.houses(id) on delete cascade,
  insurance             numeric(10,2) not null default 0,
  property_tax          numeric(10,2) not null default 0,
  municipal_fees        numeric(10,2) not null default 0,  -- Kanal, Müll, Wasser (NK)
  internet              numeric(10,2) not null default 0,  -- (NK)
  financing             numeric(10,2) not null default 0,
  depreciation          numeric(10,2) not null default 0,  -- AfA
  electricity           numeric(10,2) not null default 0,  -- nach PV-Anteil (NK)
  heating               numeric(10,2) not null default 0,  -- nach PV-Anteil (NK)
  maintenance           numeric(10,2) not null default 0,
  furniture_wear        numeric(10,2) not null default 0,
  management            numeric(10,2) not null default 0,
  cleaning              numeric(10,2) not null default 0,
  extra_costs           jsonb not null default '[]'::jsonb, -- [{ "name", "amount", "utility" }]
  vacancy_months        numeric(4,1) not null default 1 check (vacancy_months >= 0 and vacancy_months < 12),
  profit_target         numeric(10,2) not null default 0,
  deposit_months        numeric(3,1) not null default 2 check (deposit_months >= 0 and deposit_months <= 3),
  final_cleaning_fee    numeric(10,2) not null default 0,
  utilities_mode        text not null default 'flat' check (utilities_mode in ('flat','advance')),
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.rental_calculations is
  'Interne Mietkalkulation Wohnen auf Zeit je Haus. Nur Admin. Rechenweg: src/lib/rentalCalc.ts.';

-- 3) Persönliche Angebote --------------------------------------------------------------
create table if not exists public.rental_offers (
  id                 uuid primary key default gen_random_uuid(),
  inquiry_id         uuid references public.rental_inquiries(id) on delete set null,
  house_id           uuid not null references public.houses(id) on delete cascade,
  token              text not null unique
                     default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  guest_name         text not null,
  guest_email        text,
  language           text not null default 'de' check (language in ('de','en')),
  rent_month         numeric(10,2) not null check (rent_month >= 0),   -- Grundmiete (kalt) pro Monat
  utilities_month    numeric(10,2) not null default 0 check (utilities_month >= 0),
  utilities_mode     text not null default 'flat' check (utilities_mode in ('flat','advance')),
  deposit            numeric(10,2) not null default 0 check (deposit >= 0),
  final_cleaning_fee numeric(10,2) not null default 0 check (final_cleaning_fee >= 0),
  move_in            date not null,
  duration_months    integer check (duration_months is null or duration_months between 1 and 120),
  conditions_de      text,
  conditions_en      text,
  valid_until        date not null,
  status             text not null default 'draft'
                     check (status in ('draft','released','viewed','accepted','question','withdrawn')),
  released_at        timestamptz,
  viewed_at          timestamptz,
  responded_at       timestamptz,
  response_seen_at   timestamptz,          -- Uli hat die Antwort im Hinweis-Banner gesehen
  guest_message      text check (length(guest_message) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists rental_offers_inquiry_idx on public.rental_offers (inquiry_id);

comment on table public.rental_offers is
  'Persönliche Angebote Wohnen auf Zeit. Nur Admin; Kunde nur über get_rental_offer(token).';

-- updated_at ------------------------------------------------------------------------------
drop trigger if exists update_rental_inquiries_updated_at on public.rental_inquiries;
create trigger update_rental_inquiries_updated_at before update on public.rental_inquiries
  for each row execute function update_updated_at_column();
drop trigger if exists update_rental_calculations_updated_at on public.rental_calculations;
create trigger update_rental_calculations_updated_at before update on public.rental_calculations
  for each row execute function update_updated_at_column();
drop trigger if exists update_rental_offers_updated_at on public.rental_offers;
create trigger update_rental_offers_updated_at before update on public.rental_offers
  for each row execute function update_updated_at_column();

-- RLS ---------------------------------------------------------------------------------------
alter table public.rental_inquiries enable row level security;
alter table public.rental_calculations enable row level security;
alter table public.rental_offers enable row level security;

-- Website (anon) darf Anfragen nur ANLEGEN, nie lesen.
drop policy if exists "Public can submit rental inquiries" on public.rental_inquiries;
create policy "Public can submit rental inquiries" on public.rental_inquiries
  for insert to anon, authenticated
  with check (status = 'new' and admin_note is null and seen_at is null);

drop policy if exists "Admin full access" on public.rental_inquiries;
create policy "Admin full access" on public.rental_inquiries
  for all to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists "Admin full access" on public.rental_calculations;
create policy "Admin full access" on public.rental_calculations
  for all to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

drop policy if exists "Admin full access" on public.rental_offers;
create policy "Admin full access" on public.rental_offers
  for all to authenticated
  using (has_role((select auth.uid()), 'admin'::app_role))
  with check (has_role((select auth.uid()), 'admin'::app_role));

-- GRANTs (PROJEKT-REGELN: Pflicht für neue Tabellen). anon NUR insert auf Anfragen.
-- Supabase vergibt in diesem Projekt (Stand 18.11.2026) noch Standardrechte an anon —
-- deshalb zuerst alles entziehen (RLS würde zwar sperren, aber doppelt hält besser).
revoke all on public.rental_inquiries from anon;
revoke all on public.rental_calculations from anon;
revoke all on public.rental_offers from anon;
grant insert on public.rental_inquiries to anon;
grant select, insert, update, delete on public.rental_inquiries to authenticated;
grant select, insert, update, delete on public.rental_inquiries to service_role;
grant select, insert, update, delete on public.rental_calculations to authenticated;
grant select, insert, update, delete on public.rental_calculations to service_role;
grant select, insert, update, delete on public.rental_offers to authenticated;
grant select, insert, update, delete on public.rental_offers to service_role;

-- 4) Kunde liest SEIN Angebot ------------------------------------------------------------------
-- Nur freigegebene Angebote. Erster Aufruf durch einen Nicht-Admin setzt viewed_at
-- und released → viewed. Ruft Uli den Link auf, zählt das nicht.
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
    'responded_at', o.responded_at
  );
end;
$$;

-- 5) Kunde antwortet: annehmen oder Rückfrage -------------------------------------------------
create or replace function public.respond_rental_offer(p_token text, p_response text, p_message text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.rental_offers;
begin
  if p_response not in ('accept','question') then
    return 'invalid';
  end if;

  select * into o from public.rental_offers
  where token = p_token and status in ('released','viewed','question');
  if not found then
    return 'not_found';
  end if;

  if o.valid_until < current_date then
    return 'expired';
  end if;

  update public.rental_offers
    set status = case when p_response = 'accept' then 'accepted' else 'question' end,
        responded_at = now(),
        response_seen_at = null,
        -- leere Nachricht beim Annehmen überschreibt eine frühere Rückfrage nicht
        guest_message = coalesce(nullif(left(coalesce(p_message, ''), 2000), ''), guest_message),
        viewed_at = coalesce(viewed_at, now())
    where id = o.id;

  return 'ok';
end;
$$;

revoke all on function public.get_rental_offer(text) from public;
revoke all on function public.respond_rental_offer(text, text, text) from public;
grant execute on function public.get_rental_offer(text) to anon, authenticated, service_role;
grant execute on function public.respond_rental_offer(text, text, text) to anon, authenticated, service_role;

-- Kontrolle
select
  (select count(*) from public.rental_inquiries)    as anfragen,
  (select count(*) from public.rental_calculations) as kalkulationen,
  (select count(*) from public.rental_offers)       as angebote;
