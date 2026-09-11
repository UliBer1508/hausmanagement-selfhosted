-- ============================================================
-- 54_delta_guests_umstellung.sql
-- Umstellung `delta_guests`: absolute Ursprungszahl -> kumulierter Zuwachs
-- Stand 11.09.2026
--
-- Ausfuehrung im Supabase-SQL-Editor. NICHT `supabase db push`
-- (Migrations-Historie ist seit Lovable desynchron, siehe supabase/SQL/README.md).
--
-- Teil A (Migration) ist NICHT idempotent und laeuft genau einmal.
-- Teil B (Trigger) ist idempotent und darf beliebig oft laufen.
-- ============================================================


-- ============================================================
-- TEIL A — Datenmigration. NUR EINMAL AUSFUEHREN.
-- ============================================================
--
-- Vorher-Zustand (geprueft 11.09.2026):
--   123 Buchungen, davon 122 mit booked_guests = number_of_guests
--   und 1 mit Abweichung (Tal Yehuda, 6 -> 7).
-- Erwartetes Ergebnis:
--   122 x delta_guests = 0, 1 x delta_guests = 1.
--
-- Der Waechter verhindert einen zweiten Lauf. Ohne ihn wuerde die
-- Umrechnung `number_of_guests - delta_guests` bereits korrekte Werte
-- erneut umrechnen und dauerhaft verderben.

begin;

do $$
begin
  -- Waechter: nach dem ersten Lauf ist die Spalte NOT NULL.
  if (select is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name   = 'bookings'
        and column_name  = 'delta_guests') = 'NO' then
    raise exception
      'Migration wurde bereits ausgefuehrt (delta_guests ist NOT NULL) — Abbruch';
  end if;
end $$;

-- Absolute Ursprungszahl -> Zuwachs.
-- NULL bedeutet kuenftig "kein Zuwachs", nicht "unbekannt".
update public.bookings
set delta_guests = case
      when delta_guests is null then 0
      else number_of_guests - delta_guests
    end;

alter table public.bookings alter column delta_guests set default 0;
alter table public.bookings alter column delta_guests set not null;

comment on column public.bookings.delta_guests is
  'Kumulierter Zuwachs der Gaestezahl gegenueber der urspruenglichen Buchung '
  '(plus oder minus). Urspruengliche Zahl = number_of_guests - delta_guests. '
  'Wird AUSSCHLIESSLICH vom Trigger trg_fortschreiben_delta_guests gepflegt, '
  'nie von Anwendungscode. Hiess bis 11.09.2026 booked_guests und enthielt '
  'die absolute Ursprungszahl.';

commit;


-- ============================================================
-- TEIL B — Trigger. Idempotent.
-- ============================================================
--
-- Warum in der Datenbank und nicht im Formular:
-- `number_of_guests` und `delta_guests` entstehen im selben
-- Schreibvorgang und koennen deshalb nicht auseinanderlaufen — auch
-- nicht, wenn der Browser zwischen zwei Aufrufen abstuerzt.
--
-- Die `when`-Bedingung ist zwingend: ohne sie liefe der Trigger bei
-- jedem Update auf `bookings` und rechnete +0.

create or replace function public.fortschreiben_delta_guests()
returns trigger
language plpgsql
as $$
begin
  new.delta_guests := coalesce(old.delta_guests, 0)
                    + (new.number_of_guests - old.number_of_guests);
  return new;
end $$;

comment on function public.fortschreiben_delta_guests() is
  'Schreibt bookings.delta_guests fort, sobald sich number_of_guests aendert. '
  'Angelegt 11.09.2026 mit der Umstellung auf den Zuwachs-Wert.';

drop trigger if exists trg_fortschreiben_delta_guests on public.bookings;

create trigger trg_fortschreiben_delta_guests
  before update on public.bookings
  for each row
  when (old.number_of_guests is distinct from new.number_of_guests)
  execute function public.fortschreiben_delta_guests();


-- ============================================================
-- KONTROLLE — nach Teil A und B ausfuehren
-- ============================================================

-- 1. Migration gegen die Sicherung pruefen. Erwartung: KEINE Zeile.
select b.id, b.guest_name, b.number_of_guests, b.delta_guests,
       b.number_of_guests - b.delta_guests as ursprung_errechnet,
       s.booked_guests                     as ursprung_gesichert
from public.bookings b
join public.bookings_gaestezahl_backup_20260911 s on s.id = b.id
where b.number_of_guests - b.delta_guests
      is distinct from coalesce(s.booked_guests, b.number_of_guests);

-- 2. Verteilung. Erwartung: 123 gesamt, 122 x 0, 1 x 1 (Tal Yehuda).
select count(*)                                    as buchungen,
       count(*) filter (where delta_guests = 0)    as ohne_zuwachs,
       count(*) filter (where delta_guests > 0)    as erhoeht,
       count(*) filter (where delta_guests < 0)    as reduziert
from public.bookings;

-- 3. Trigger vorhanden?
select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.bookings'::regclass and not tgisinternal
order by tgname;


-- ============================================================
-- NOTFALL — Ruecksetzung, solange nichts weiter geaendert wurde
-- ============================================================
-- drop trigger if exists trg_fortschreiben_delta_guests on public.bookings;
-- alter table public.bookings alter column delta_guests drop not null;
-- alter table public.bookings alter column delta_guests drop default;
-- update public.bookings b
-- set delta_guests = s.booked_guests
-- from public.bookings_gaestezahl_backup_20260911 s
-- where s.id = b.id;
