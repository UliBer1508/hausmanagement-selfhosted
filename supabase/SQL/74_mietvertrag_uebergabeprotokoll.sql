-- 74 — Wohnen auf Zeit, Paket D: Mietvertrag, Übergabeprotokoll, Inventarliste
-- Projekt: Hausverwaltung usblrulkcgucxtkhugck. Stand 18.11.2026. Baut auf SQL 72/73 auf.
-- Das Skript darf mehrfach laufen. Keine Personendaten in diese Datei (Repo ist öffentlich):
-- Vermieter, Konto (IBAN) usw. trägt Uli in der App ein (Mieter → Interessenten → Vertragsdaten).
--
-- Was hier passiert:
--  1. rental_contract_templates — Vertragstext (DE/EN) mit Platzhaltern {{…}}. Eine Standardvorlage
--     (house_id leer), optional eine eigene je Haus. Startinhalt = Ulis Kurzfassung
--     „Mietvertrag Venedigersiedlung 316 kurz DE-EN“, hausneutral gemacht + Energieausweis,
--     Höchstzahl Bewohner, Haftung Mitbewohner/Besucher, Mülltrennung, Hinweis Datenschutz.
--  2. rental_contract_house_data — alles Hausbezogene für den Vertrag: Vermieter, Konto, Objekt-
--     beschreibung, MRG-Hinweis, Gemeinde + Anleitung Anmeldung, Hausregeln, Energieausweis,
--     Zähler/Schlüssel/Räume fürs Übergabeprotokoll. Startwerte: Venediger aus der Kurzfassung,
--     Wald nur Adresse/Gemeinde (Rest leer — siehe Hinweis MRG in docs/Konzept-Wohnen-auf-Zeit.md).
--  3. rental_contracts — ein Vertrag je Angebot (Entwurf → ausgefertigt → unterschrieben;
--     storniert). Speichert die eingesetzten Werte und eine KOPIE von Text, Protokoll-Zeilen und
--     Inventar (house_inventory ohne Mustereinträge) zum Zeitpunkt der Ausfertigung.
--     PDFs liegen in der Dokumentenverwaltung (Typ „Mieterunterlagen“, document_links 'mietangebot').
--  Alle drei Tabellen: nur Admin (RLS), anon ohne Rechte.

-- 1) Vorlage ---------------------------------------------------------------------------------
create table if not exists public.rental_contract_templates (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid references public.houses(id) on delete cascade,   -- leer = Standardvorlage
  name        text not null default 'Mietvertrag Wohnen auf Zeit',
  content     jsonb not null,   -- {title_de,title_en,annex_de,annex_en,protocol_items[],sections[{title_de,title_en,paragraphs[{de,en,when?,type?}]}]}
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists rental_contract_templates_house_uq
  on public.rental_contract_templates (coalesce(house_id, '00000000-0000-0000-0000-000000000000'::uuid));

comment on table public.rental_contract_templates is
  'Mietvertrag-Vorlage DE/EN mit Platzhaltern {{schluessel}}; house_id leer = Standard. Paket D, SQL 74.';

-- 2) Vertragsdaten je Haus -------------------------------------------------------------------
create table if not exists public.rental_contract_house_data (
  house_id              uuid primary key references public.houses(id) on delete cascade,
  landlord_name         text,
  landlord_address      text,
  landlord_email        text,
  landlord_phone        text,
  account_holder        text,
  iban                  text,
  bic                   text,
  object_title          text,   -- Kopfzeile, z. B. „Einfamilienhaus …, 5741 Neukirchen am Großvenediger“
  object_short          text,   -- Verwendungszweck, z. B. „VS 316“
  object_de             text,   -- „das Einfamilienhaus …, ca. 140 m² Wohnfläche, möbliert, mit …“
  object_en             text,
  mrg_note_de           text,   -- rechtliche Einordnung (Vollausnahme MRG) — je Haus prüfen!
  mrg_note_en           text,
  municipality_de       text,   -- „Marktgemeinde Neukirchen“
  municipality_en       text,
  registration_hint_de  text,   -- Anleitung Meldezettel
  registration_hint_en  text,
  house_rules_de        text,   -- Hausbesonderheiten (Heizungs-/PV-Steuerung, Sauna, Kamin …)
  house_rules_en        text,
  max_occupants         integer check (max_occupants is null or max_occupants between 1 and 30),
  vat_note_de           text,   -- „keine (Kleinunternehmer)“ / „zzgl. 10 % USt“
  vat_note_en           text,
  small_repair_case     numeric(10,2) default 100,
  small_repair_year     numeric(10,2) default 400,
  winter_service        text check (winter_service is null or winter_service in ('tenant','landlord')),
  notice_after_months   integer not null default 6,
  notice_period_months  integer not null default 3,
  payment_day           integer not null default 3 check (payment_day between 1 and 28),
  energy_hwb            numeric(8,1),
  energy_fgee           numeric(5,2),
  energy_class          text,
  energy_issued_on      date,
  meters                jsonb not null default '[]'::jsonb,  -- [{de,en,no?}] Zähler fürs Protokoll
  keys                  jsonb not null default '[]'::jsonb,  -- [{de,en}]
  rooms                 jsonb not null default '[]'::jsonb,  -- [{de,en}]
  updated_at            timestamptz not null default now()
);

comment on table public.rental_contract_house_data is
  'Hausbezogene Angaben für Mietvertrag/Übergabeprotokoll (Wohnen auf Zeit). Nur Admin. SQL 74.';

-- 3) Verträge --------------------------------------------------------------------------------
create table if not exists public.rental_contracts (
  id                     uuid primary key default gen_random_uuid(),
  offer_id               uuid not null references public.rental_offers(id) on delete cascade,
  house_id               uuid not null references public.houses(id) on delete cascade,
  template_id            uuid references public.rental_contract_templates(id) on delete set null,
  status                 text not null default 'draft'
                           check (status in ('draft','issued','signed','cancelled')),
  "values"               jsonb not null default '{}'::jsonb,  -- eingesetzte Werte inkl. positions[]
  sections               jsonb,   -- Kopie des Vertragstexts (nach Änderungen im Dialog)
  protocol               jsonb,   -- Kopie meters/keys/rooms/protocol_items
  inventory              jsonb,   -- Kopie house_inventory (ohne Mustereinträge) bei Ausfertigung
  contract_document_id   uuid references public.documents(id) on delete set null,
  protocol_document_id   uuid references public.documents(id) on delete set null,
  signed_document_id     uuid references public.documents(id) on delete set null,
  issued_at              timestamptz,
  signed_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index if not exists rental_contracts_offer_active_uq
  on public.rental_contracts (offer_id) where status <> 'cancelled';
create index if not exists rental_contracts_house_idx on public.rental_contracts (house_id);

comment on table public.rental_contracts is
  'Mietvertrag je Angebot (Wohnen auf Zeit): Werte + Kopie von Text, Protokoll, Inventar; PDFs in documents. SQL 74.';

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['rental_contract_templates','rental_contract_house_data','rental_contracts'] loop
    execute format('drop trigger if exists update_%1$s_updated_at on public.%1$s', t);
    execute format('create trigger update_%1$s_updated_at before update on public.%1$s
                    for each row execute function update_updated_at_column()', t);
  end loop;
end $$;

-- Rechte: nur Admin --------------------------------------------------------------------------
alter table public.rental_contract_templates  enable row level security;
alter table public.rental_contract_house_data enable row level security;
alter table public.rental_contracts           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['rental_contract_templates','rental_contract_house_data','rental_contracts'] loop
    execute format('drop policy if exists "Admin full access" on public.%I', t);
    execute format('create policy "Admin full access" on public.%I for all to authenticated
                    using (has_role((select auth.uid()), ''admin''::app_role))
                    with check (has_role((select auth.uid()), ''admin''::app_role))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- Startinhalt: Standardvorlage (nur wenn noch keine da ist) ----------------------------------
insert into public.rental_contract_templates (house_id, name, content)
select null, 'Mietvertrag Wohnen auf Zeit (Kurzfassung DE/EN)', $tpl${
 "title_de": "MIETVERTRAG",
 "title_en": "LEASE AGREEMENT",
 "annex_de": "Anhang 1: Übergabe- und Rückgabeprotokoll mit Zählerständen · Anhang 2: Inventarliste · Kopie Aufenthaltsnachweis (falls zutreffend)",
 "annex_en": "Annex 1: Handover and return protocol with meter readings · Annex 2: Inventory list · Copy of residence permit (if applicable)",
 "protocol_items": [
  {
   "de": "Fotodokumentation erstellt (Anzahl, Ablage): ____________________",
   "en": "Photos taken (number, storage): ____________________"
  },
  {
   "de": "Bedienungsanleitungen (Heizung, Sauna, Kamin, Geräte) übergeben",
   "en": "Operating instructions (heating, sauna, fireplace, appliances) handed over"
  },
  {
   "de": "Energieausweis übergeben (Original oder vollständige Kopie)",
   "en": "Energy performance certificate handed over (original or complete copy)"
  },
  {
   "de": "Auszug: Haus geräumt und gereinigt, Abmeldebestätigung vorgelegt",
   "en": "Move-out: house vacated and clean, deregistration confirmation presented"
  }
 ],
 "sections": [
  {
   "title_de": "§ 1 Vertragsparteien",
   "title_en": "Parties",
   "paragraphs": [
    {
     "de": "Vermieter: {{vermieter_name}}, {{vermieter_anschrift}}, {{vermieter_email}}, {{vermieter_telefon}}",
     "en": "Landlord: {{vermieter_name}}, {{vermieter_anschrift}}, {{vermieter_email}}, {{vermieter_telefon}}"
    },
    {
     "de": "Mieter: {{mieter_name}}, geb. {{mieter_geburtsdatum}}, {{mieter_email}}, {{mieter_telefon}}",
     "en": "Tenant: {{mieter_name}}, born {{mieter_geburtsdatum}}, {{mieter_email}}, {{mieter_telefon}}"
    },
    {
     "de": "Staatsangehörigkeit {{mieter_staatsangehoerigkeit}}, Ausweis-Nr. {{mieter_ausweis}}.",
     "en": "Nationality {{mieter_staatsangehoerigkeit}}, ID no. {{mieter_ausweis}}.",
     "when": "mieter_ausweis"
    },
    {
     "de": "Weitere Bewohner: {{weitere_bewohner}}. Das Haus darf von höchstens {{max_bewohner}} Personen bewohnt werden; weitere Personen nur mit schriftlicher Zustimmung des Vermieters. Der Mieter haftet für Mitbewohner und Besucher wie für sich selbst.",
     "en": "Other occupants: {{weitere_bewohner}}. The house may be occupied by no more than {{max_bewohner}} persons; additional persons only with the Landlord's written consent. The Tenant is liable for co-occupants and visitors as for himself."
    },
    {
     "de": "Der Mieter legt einen gültigen Aufenthaltsnachweis vor (Kopie liegt bei).",
     "en": "The Tenant presents valid proof of his right of residence (copy attached).",
     "when": "aufenthaltsnachweis"
    }
   ]
  },
  {
   "title_de": "§ 2 Mietgegenstand und Dauer",
   "title_en": "Property and Term",
   "paragraphs": [
    {
     "de": "Vermietet wird {{objekt}}. Inventar, Zustand, Schlüssel und Zählerstände werden im Übergabeprotokoll (Anhang 1) und in der Inventarliste (Anhang 2) festgehalten.",
     "en": "The Landlord lets {{objekt}}. Inventory, condition, keys and meter readings are recorded in the handover protocol (Annex 1) and the inventory list (Annex 2)."
    },
    {
     "de": "Das Mietverhältnis beginnt am {{beginn}} und endet nach {{dauer_monate}} Monaten am {{ende}}, ohne dass es einer Kündigung bedarf. Eine Verlängerung bedarf der Schriftform; § 1114 ABGB wird ausgeschlossen. Der Mieter kann nach {{kuendigung_ab_monate}} Monaten mit {{kuendigung_frist_monate}} Monaten Frist zum Monatsletzten schriftlich kündigen.",
     "en": "The tenancy begins on {{beginn}} and ends after {{dauer_monate}} months on {{ende}} without notice. Any extension must be in writing; tacit renewal (s. 1114 ABGB) is excluded. After {{kuendigung_ab_monate}} months the Tenant may terminate in writing with {{kuendigung_frist_monate}} months' notice to the end of a month.",
     "when": "befristet"
    },
    {
     "de": "Das Mietverhältnis beginnt am {{beginn}} und wird auf unbestimmte Zeit geschlossen. Beide Seiten können mit {{kuendigung_frist_monate}} Monaten Frist zum Monatsletzten schriftlich kündigen, der Mieter frühestens nach {{kuendigung_ab_monate}} Monaten.",
     "en": "The tenancy begins on {{beginn}} and is concluded for an indefinite period. Either party may terminate in writing with {{kuendigung_frist_monate}} months' notice to the end of a month, the Tenant no earlier than after {{kuendigung_ab_monate}} months.",
     "when": "!befristet"
    },
    {
     "de": "{{mrg_hinweis}}",
     "en": "{{mrg_hinweis}}",
     "when": "mrg_hinweis"
    }
   ]
  },
  {
   "title_de": "§ 3 Hauptwohnsitz – Meldepflicht",
   "title_en": "Primary Residence – Registration",
   "paragraphs": [
    {
     "de": "Das Haus wird ausschließlich als Hauptwohnsitz des Mieters vermietet. Der Mieter verpflichtet sich, sich innerhalb von 3 Tagen nach Einzug bei der {{gemeinde}} mit Hauptwohnsitz anzumelden und dem Vermieter binnen 14 Tagen die Meldebestätigung vorzulegen. Er verlegt seinen Lebensmittelpunkt in das Haus.",
     "en": "The house is let exclusively as the Tenant's primary residence (Hauptwohnsitz). The Tenant undertakes to register his primary residence with the {{gemeinde}} within 3 days of moving in and to provide the Landlord with the registration confirmation within 14 days. He moves the centre of his life to the house."
    },
    {
     "de": "So geht die Anmeldung: {{anmeldung_hinweis}}",
     "en": "How to register: {{anmeldung_hinweis}}",
     "when": "anmeldung_hinweis"
    },
    {
     "de": "Nutzung als Zweit-, Ferien- oder Wochenendwohnsitz sowie jede Untervermietung oder touristische Vermietung (z. B. Airbnb, Booking.com) sind verboten. Ein Verstoß ist ein wichtiger Grund zur sofortigen Vertragsauflösung (§ 1118 ABGB); Strafen und Kosten, die dem Vermieter daraus entstehen, trägt der Mieter. Nach Auszug meldet sich der Mieter binnen 3 Tagen ab.",
     "en": "Use as a secondary, holiday or weekend home and any subletting or tourist letting (e.g. Airbnb, Booking.com) are prohibited. A breach is good cause for immediate termination (s. 1118 ABGB); the Tenant bears any fines and costs incurred by the Landlord as a result. The Tenant deregisters within 3 days of moving out."
    }
   ]
  },
  {
   "title_de": "§ 4 Miete und Nebenkosten",
   "title_en": "Rent and Operating Costs",
   "paragraphs": [
    {
     "de": "Monatlicher Betrag:",
     "en": "Monthly amount:",
     "type": "positions"
    },
    {
     "de": "Umsatzsteuer: {{ust_hinweis}}.",
     "en": "VAT: {{ust_hinweis}}."
    },
    {
     "de": "Betriebskosten: Wasser, Kanal, Müll, Grundsteuer, Gebäudeversicherung, Rauchfangkehrer, ggf. Schneeräumung. Strom und Heizung werden nach dem Verbrauch laut Zähler zum Tarif des Energieversorgers abgerechnet. Abrechnung bei Vertragsende; Nachzahlung oder Guthaben binnen 30 Tagen. Der Hauptmietzins bleibt während der Laufzeit unverändert. ORF-Beitrag und Haushaltsversicherung trägt der Mieter selbst.",
     "en": "Operating costs: water, sewage, waste, property tax, building insurance, chimney sweep, snow clearing if applicable. Electricity and heating are charged on actual consumption per meter at the utility's tariff. Settlement at the end of the tenancy; balance due within 30 days. The base rent stays fixed for the term. The Tenant pays the ORF broadcasting fee and his contents insurance himself.",
     "when": "nk_vorauszahlung"
    },
    {
     "de": "Die Nebenkosten sind mit dem oben genannten Pauschalbetrag abgegolten; eine Abrechnung erfolgt nicht. Der Hauptmietzins bleibt während der Laufzeit unverändert. ORF-Beitrag und Haushaltsversicherung trägt der Mieter selbst.",
     "en": "Operating costs are covered by the flat amount stated above; no settlement takes place. The base rent stays fixed for the term. The Tenant pays the ORF broadcasting fee and his contents insurance himself.",
     "when": "!nk_vorauszahlung"
    }
   ]
  },
  {
   "title_de": "§ 5 Zahlung",
   "title_en": "Payment",
   "paragraphs": [
    {
     "de": "Die Miete ist monatlich im Voraus spätestens am {{zahltag}}. eines jeden Monats fällig und muss bis dahin auf dem Konto des Vermieters eingegangen sein: Kontoinhaber {{kontoinhaber}}, IBAN {{iban}}, BIC {{bic}}, Verwendungszweck „Miete {{objekt_kurz}} + Monat“. Der Mieter richtet einen Dauerauftrag ein; Barzahlung ist ausgeschlossen.",
     "en": "Rent is due monthly in advance no later than day {{zahltag}} of each month and must have reached the Landlord's account by then: account holder {{kontoinhaber}}, IBAN {{iban}}, BIC {{bic}}, reference \"Rent {{objekt_kurz}} + month\". The Tenant sets up a standing order; cash payment is excluded."
    },
    {
     "de": "Erste Monatsmiete und Kaution sind vor der Schlüsselübergabe zu zahlen (bei Beginn während eines Monats anteilig). Bei Verzug fallen 4 % Zinsen p. a. und Mahnspesen von 10 € je Mahnung an. Ein Rückstand von mindestens einer Monatsmiete nach Mahnung berechtigt zur Auflösung nach § 1118 ABGB.",
     "en": "The first month's rent and the deposit are payable before the keys are handed over (pro rata if the tenancy starts mid-month). Late payment incurs 4 % interest p.a. and a reminder fee of EUR 10 per reminder. Arrears of at least one month's rent after a reminder entitle the Landlord to terminate under s. 1118 ABGB."
    }
   ]
  },
  {
   "title_de": "§ 6 Kaution",
   "title_en": "Security Deposit",
   "paragraphs": [
    {
     "de": "Der Mieter zahlt vor Schlüsselübergabe eine Kaution von {{kaution}}{{kaution_hinweis}} auf das Konto in § 5. Die Kaution wird nicht verzinst. Der Vermieter darf offene Mieten jederzeit mit der Kaution verrechnen; der Mieter füllt die Kaution dann binnen 14 Tagen wieder auf.",
     "en": "Before key handover the Tenant pays a deposit of {{kaution}}{{kaution_hinweis}} to the account in s. 5. The deposit bears no interest. The Landlord may offset unpaid rent against the deposit at any time; the Tenant then tops the deposit up within 14 days."
    },
    {
     "de": "Rückzahlung binnen 30 Tagen nach Rückgabe aller Schlüssel und gemeinsamer Abnahme, frühestens nach Vorlage der Abmeldebestätigung. Abgezogen werden nur berechtigte Forderungen, belegt durch Rechnung oder Kostenvoranschlag:",
     "en": "Repayment within 30 days after return of all keys and joint inspection, but not before the deregistration confirmation is presented. Only justified claims, supported by invoice or quote, may be deducted:"
    },
    {
     "de": "a) offene Miete, Betriebskosten oder Strom-Nachzahlung; b) Schäden über die gewöhnliche Abnutzung hinaus – maßgeblich ist der Vergleich der Protokolle bei Ein- und Auszug; c) fehlendes oder beschädigtes Inventar (Zeitwert); d) Endreinigung, wenn das Haus nicht gereinigt übergeben wird; e) fehlende Schlüssel bzw. nötiger Schlosstausch; f) Räumung zurückgelassener Gegenstände.",
     "en": "a) unpaid rent, operating costs or electricity balance; b) damage beyond normal wear and tear – based on comparing the move-in and move-out protocols; c) missing or damaged inventory (current value); d) final cleaning if the house is not returned clean; e) missing keys or necessary lock replacement; f) removal of items left behind."
    },
    {
     "de": "Gewöhnliche Abnutzung geht zulasten des Vermieters. Der Strom wird bei Auszug am Zähler abgelesen und sofort abgerechnet. Für eine noch offene Betriebskostenabrechnung dürfen höchstens 500 € für maximal 3 Monate einbehalten werden.",
     "en": "Normal wear and tear is borne by the Landlord. Electricity is read at move-out and settled immediately. For a pending operating cost statement at most EUR 500 may be retained for up to 3 months."
    }
   ]
  },
  {
   "title_de": "§ 7 Gebrauch und Rückgabe",
   "title_en": "Use and Return",
   "paragraphs": [
    {
     "de": "Der Mieter behandelt Haus und Einrichtung pfleglich, reinigt selbst, lüftet und heizt ausreichend und meldet Schäden sofort. Kleinreparaturen trägt er bis {{kleinreparatur_fall}} je Fall, höchstens {{kleinreparatur_jahr}} pro Jahr.",
     "en": "The Tenant treats the house and furnishings with care, cleans himself, ventilates and heats adequately and reports damage immediately. He bears minor repairs up to {{kleinreparatur_fall}} per case, max. {{kleinreparatur_jahr}} per year."
    },
    {
     "de": "{{hausregeln}}",
     "en": "{{hausregeln}}",
     "when": "hausregeln"
    },
    {
     "de": "Rauchverbot im Haus; Haustiere nur mit schriftlicher Zustimmung. Müll ist nach den Vorgaben der Gemeinde getrennt zu entsorgen; die Hausordnung (falls übergeben) ist einzuhalten. Winterdienst: {{winterdienst}}. Der Mieter hält eine Haushalts- und Privathaftpflichtversicherung. Zutritt des Vermieters nach 48 h Ankündigung, bei Gefahr jederzeit.",
     "en": "No smoking inside; pets only with written consent. Waste is to be separated according to the municipality's rules; the house rules (if handed over) are to be observed. Snow clearing: {{winterdienst}}. The Tenant holds contents and personal liability insurance. Landlord access with 48 h notice, in an emergency at any time."
    },
    {
     "de": "Bei Vertragsende gibt der Mieter das Haus geräumt, gereinigt, mit allen Schlüsseln und vollständigem Inventar zurück. Die Rückgabe wird im Anhang 1 (Spalte Auszug) mit Zählerständen festgehalten.",
     "en": "At the end of the tenancy the Tenant returns the house vacated, clean, with all keys and complete inventory. The return is recorded in Annex 1 (move-out column) with meter readings."
    }
   ]
  },
  {
   "title_de": "§ 8 Energieausweis",
   "title_en": "Energy Performance Certificate",
   "paragraphs": [
    {
     "de": "Der Vermieter hat dem Mieter vor Vertragsabschluss einen Energieausweis vorgelegt (Heizwärmebedarf HWB {{energie_hwb}} kWh/m²a, fGEE {{energie_fgee}}, Klasse {{energie_klasse}}, ausgestellt am {{energie_datum}}) und händigt ihm diesen oder eine vollständige Kopie spätestens 14 Tage nach Vertragsabschluss aus.",
     "en": "Before conclusion of this agreement the Landlord presented an energy performance certificate to the Tenant (heating demand HWB {{energie_hwb}} kWh/m²a, fGEE {{energie_fgee}}, class {{energie_klasse}}, issued on {{energie_datum}}) and hands it or a complete copy over no later than 14 days after conclusion of the agreement."
    }
   ]
  },
  {
   "title_de": "§ 9 Schlussbestimmungen",
   "title_en": "Final Provisions",
   "paragraphs": [
    {
     "de": "Änderungen bedürfen der Schriftform; mündliche Nebenabreden bestehen nicht. Es gilt österreichisches Recht; Gerichtsstand ist das für das Mietobjekt zuständige Gericht. Ist eine Bestimmung unwirksam, bleibt der Rest gültig. Bei Abweichungen gilt die deutsche Fassung. Daten werden nur zur Vertragsdurchführung verarbeitet (Einzelheiten: Datenschutzerklärung auf steinbockchalets.com). Zwei Ausfertigungen.",
     "en": "Amendments must be in writing; there are no oral side agreements. Austrian law applies; the court competent for the property has jurisdiction. If a provision is invalid, the rest remains valid. In case of discrepancies the German version prevails. Data is processed only to perform this agreement (details: privacy policy at steinbockchalets.com). Two counterparts."
    }
   ]
  }
 ]
}$tpl$::jsonb
where not exists (select 1 from public.rental_contract_templates where house_id is null);

-- Startwerte Venediger (aus der Kurzfassung) — nur wenn noch nicht angelegt --------------------
insert into public.rental_contract_house_data (
  house_id, object_title, object_short, object_de, object_en, mrg_note_de, mrg_note_en,
  municipality_de, municipality_en, registration_hint_de, registration_hint_en,
  house_rules_de, house_rules_en, max_occupants, meters, keys, rooms)
select h.id,
  'Einfamilienhaus Venedigersiedlung 316, 5741 Neukirchen am Großvenediger',
  'VS 316',
  'das Einfamilienhaus Venedigersiedlung 316, 5741 Neukirchen am Großvenediger, ca. 140 m² Wohnfläche, möbliert, mit Sauna, Kamin, Terrasse und Garage (nicht in der Wohnfläche)',
  'the single-family house Venedigersiedlung 316, 5741 Neukirchen am Großvenediger, approx. 140 m² living area, furnished, with sauna, fireplace, terrace and garage (not part of the living area)',
  'Das Haus ist nach § 1 Abs 2 Z 5 MRG vom MRG ausgenommen; es gilt das ABGB.',
  'The house is exempt from the Tenancy Act (s. 1(2)(5) MRG); the Civil Code (ABGB) applies.',
  'Marktgemeinde Neukirchen', 'municipality of Neukirchen',
  $r$Meldezettel (Formular auf neukirchen-salzburg.at → Bürgerservice → Formulare → Meldewesen) ausfüllen, „Hauptwohnsitz: ja“ ankreuzen, vom Vermieter als Unterkunftgeber unterschreiben lassen und mit Reisepass bzw. Ausweis persönlich beim Gemeindeamt, Marktstraße 171, 5741 Neukirchen abgeben (Tel. +43 6565 6208).$r$,
  $r$complete the registration form „Meldezettel“ (on neukirchen-salzburg.at → Bürgerservice → Formulare → Meldewesen), tick „Hauptwohnsitz: ja“, have it signed by the Landlord as accommodation provider and hand it in in person with passport or ID at the municipal office, Marktstraße 171, 5741 Neukirchen (tel. +43 6565 6208).$r$,
  'Die Heizungs- und PV-Steuerung betreibt der Vermieter; der Mieter verändert sie nicht und stellt die Raumtemperatur über die Bedienelemente ein. Sauna und Kamin nur laut Anleitung.',
  'The heating and PV control is operated by the Landlord; the Tenant does not alter it and sets room temperature via the controls. Sauna and fireplace only as instructed.',
  h.max_guests,
  $m$[{"de": "Strom Bezug (1.8.0) – kWh", "en": "Electricity import (1.8.0) – kWh"}, {"de": "Strom Einspeisung PV (2.8.0) – kWh", "en": "PV export (2.8.0) – kWh"}, {"de": "Wasser – m³", "en": "Water – m³"}, {"de": "Zwischenzähler (Sauna/Heizung) – kWh", "en": "Sub-meter (sauna/heating) – kWh"}, {"de": "Brennholz – Ster", "en": "Firewood – Ster"}, {"de": "Sonstiges", "en": "Other"}]$m$::jsonb, $k$[{"de": "Haustür", "en": "Front door"}, {"de": "Garage / Torsender", "en": "Garage / remote"}, {"de": "Briefkasten", "en": "Mailbox"}, {"de": "Sonstige", "en": "Other"}]$k$::jsonb, $o$[{"de": "Eingang, Flur", "en": "Entrance, hall"}, {"de": "Wohnzimmer, Kamin", "en": "Living room, fireplace"}, {"de": "Küche inkl. Geräte", "en": "Kitchen incl. appliances"}, {"de": "Schlafzimmer 1", "en": "Bedroom 1"}, {"de": "Schlafzimmer 2", "en": "Bedroom 2"}, {"de": "Schlafzimmer 3", "en": "Bedroom 3"}, {"de": "Bad, WC", "en": "Bathroom, WC"}, {"de": "Sauna", "en": "Sauna"}, {"de": "Terrasse, Außenbereich", "en": "Terrace, outdoor"}, {"de": "Garage", "en": "Garage"}]$o$::jsonb
from public.houses h
where h.id = 'f5b4588b-96cf-46f7-b84a-5f6750f7088e'
on conflict (house_id) do nothing;

-- Startwerte Wald — nur Kopfzeile + Gemeinde laut houses.address; Rest bewusst leer ---------
insert into public.rental_contract_house_data (house_id, object_title, municipality_de, municipality_en,
  registration_hint_de, registration_hint_en)
select h.id, replace(h.address, 'Neukirchen am GV', 'Neukirchen am Großvenediger'),
  'Marktgemeinde Neukirchen', 'municipality of Neukirchen',
  $r$Meldezettel (Formular auf neukirchen-salzburg.at → Bürgerservice → Formulare → Meldewesen) ausfüllen, „Hauptwohnsitz: ja“ ankreuzen, vom Vermieter als Unterkunftgeber unterschreiben lassen und mit Reisepass bzw. Ausweis persönlich beim Gemeindeamt, Marktstraße 171, 5741 Neukirchen abgeben (Tel. +43 6565 6208).$r$,
  $r$complete the registration form „Meldezettel“ (on neukirchen-salzburg.at → Bürgerservice → Formulare → Meldewesen), tick „Hauptwohnsitz: ja“, have it signed by the Landlord as accommodation provider and hand it in in person with passport or ID at the municipal office, Marktstraße 171, 5741 Neukirchen (tel. +43 6565 6208).$r$
from public.houses h
where h.id = 'a2b4d1f7-f396-40a5-b83f-174ccafa55fd' and h.address ilike '%Neukirchen%'
on conflict (house_id) do nothing;

-- Kontrolle
select (select count(*) from public.rental_contract_templates)  as vorlagen,
       (select count(*) from public.rental_contract_house_data) as vertragsdaten,
       (select count(*) from information_schema.tables where table_name = 'rental_contracts') as vertraege;
