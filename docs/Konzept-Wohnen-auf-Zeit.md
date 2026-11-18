# Wohnen auf Zeit — Mietinteressenten, Kalkulation, Angebot, Unterlagen, Übernahme (Paket A)

Stand 18.11.2026 · SQL `supabase/SQL/72_mietinteressenten.sql` (am 18.11.2026 direkt in
`usblrulkcgucxtkhugck` angewendet: Migrationen `mietinteressenten_wohnen_auf_zeit` und
`mietinteressenten_anon_rechte_einschraenken`).

## Anlass

Venedigersiedlung 316 darf nicht mehr kurzzeitig touristisch vermietet werden. Die Website
steinbockchalets.com bietet deshalb je Haus die Vermietungsart **„Wohnen auf Zeit“** an
(möbliert, ab 6 Monaten, Anmeldung bei der Gemeinde). Vorbild für den Ablauf: Mr. Lodge.

**Entscheidung Uli (18.11.2026):** Das Anfrage-Management gehört in die Hausverwaltung, nicht in
den Admin der Website. Preise stehen nie öffentlich; Miete und Konditionen bekommt ein Interessent
erst nach der Besichtigung, und nur mit Ulis Freigabe.

## Ablauf

```
Website  #wohnen-auf-zeit  Mietanfrage ──insert (anon)──▶ rental_inquiries
                                                          │  Hinweis-Banner Übersicht
                                                          ▼
Hausverwaltung  Mieter → Interessenten: Kontakt, Status „Besichtigung“
                Kalkulation je Haus (rental_calculations) → Vorschlag
                „Angebot erstellen“ (rental_offers, Entwurf) → „Freigeben“
                                                          │  Link steinbockchalets.com/angebot/<token>
                                                          ▼
Website  /angebot/<token>  get_rental_offer ── annehmen / Rückfrage ── respond_rental_offer
                                                          │  Hinweis-Banner Übersicht („Antwort“)
                                                          ▼
Hausverwaltung  Mietvertrag (PDF) → Unterschrift → Als Mieter übernehmen  (Paket D, SQL 74)
```

## Warum nicht `booking_inquiries`

`booking_inquiries` ist die Urlaubsanfrage: `check_in`/`check_out` Pflicht,
`BookingInquiryAlertBanner` → „Annehmen“ öffnet *Buchung erstellen*, Max' Werkzeug
`accept_booking_inquiry` legt eine Buchung an. Eine Mietanfrage darf das alles nicht auslösen.
Deshalb eigene Tabellen und ein eigener Banner (`RentalInquiryAlertBanner`), der **neben** dem
Buchungsanfragen-Banner steht.

## Tabellen (SQL 72)

| Tabelle | Inhalt | Rechte |
|---|---|---|
| `rental_inquiries` | Name, E-Mail, Telefon, Einzug, Dauer (leer = offen), Personen, Anlass, Haustier, Anmeldung Gemeinde zugesagt, Nachricht, Sprache, `status` (new/contacted/viewing/offer/rejected/closed), `seen_at` | anon nur INSERT (status `new`, ohne `admin_note`/`seen_at`); sonst nur Admin |
| `rental_calculations` | je Haus: Kostenposten € pro Jahr, weitere Posten, Leerstand, Gewinnziel, Kaution-Monate, Endreinigung, NK als Pauschale/Vorauszahlung | nur Admin |
| `rental_offers` | Angebot zu einer Anfrage: Grundmiete, NK, Kaution, Endreinigung, Einzug, Dauer, Konditionen de/en, gültig bis, `token` (64 Zeichen Zufall), Status draft → released → viewed → accepted/question; withdrawn; `response_seen_at`, `guest_message` | nur Admin |

Funktionen (security definer, anon darf ausführen):
- `get_rental_offer(token)` → JSON nur für freigegebene Angebote; erster Aufruf eines
  Nicht-Admins setzt `viewed_at` und `released → viewed`.
- `respond_rental_offer(token, 'accept'|'question', msg)` → `ok` / `expired` / `not_found` /
  `invalid`; setzt `response_seen_at = null`, damit der Banner die Antwort zeigt.

anon hat auf alle drei Tabellen **kein** SELECT (zusätzlich zu RLS ausdrücklich entzogen —
dieses Projekt vergab am 18.11.2026 noch Standardrechte an anon).

Geprüft lokal mit PostgreSQL 16 (Rollen/`has_role` nachgebildet) und danach live:
anon liest nichts, darf nur Anfragen mit Status `new` anlegen; Entwurf per Token unsichtbar;
Admin-Aufruf zählt nicht als „geöffnet“; Rückfrage und Annahme; zweite Annahme → `not_found`.

## Code (Hausverwaltung)

| Datei | Rolle |
|---|---|
| `hooks/useRentalInquiries.ts` | Typen, Listen (`rental-inquiries`, `rental-offers`), Status ändern, Antwort gesehen, Status-Texte, `rentalOfferLink()` |
| `lib/rentalCalc.ts` | Kostenposten und Rechenweg (`berechnen()`), `euro()` |
| `components/Tenants/RentalInquiries.tsx` | Sub-Tab „Interessenten“ im Tab Mieter |
| `components/Tenants/RentalCalculationDialog.tsx` | Kalkulation je Haus; Vergleich mit Betriebskosten (letztes Jahr) und Marktmiete |
| `components/Tenants/RentalOfferDialog.tsx` | Angebot: Entwurf, Freigeben (Link kopieren, E-Mail), Änderungen, Zurückziehen |
| `components/Dashboard/RentalInquiryAlertBanner.tsx` | Hinweis in der Übersicht, „Gesehen“, Sprung zu Mieter → Interessenten |
| `components/Tenants/TenantManagement.tsx` | neuer Sub-Tab, Zähler, liest `location.state.tenantSubTab` |
| `components/Dashboard/OverviewTab.tsx` | Banner eingebunden (direkt unter `BookingInquiryAlertBanner`) |

## Rechenweg Kalkulation

```
Kosten/Jahr         = Fixkosten + Energie + Rücklagen/Betrieb + weitere Posten
vermietete Monate   = 12 − Leerstand
Gesamt/Monat (roh)  = (Kosten/Jahr + Gewinnziel) / vermietete Monate
Nebenkosten/Monat   = NK-Posten/Jahr / 12                → aufrunden auf 5 €
Grundmiete/Monat    = Gesamt (roh) − Nebenkosten/Monat    → aufrunden auf 10 €
Kaution             = Kaution-Monate × Gesamtmiete        → aufrunden auf 10 €
```
NK-Posten: Kanal/Müll/Wasser, Internet/TV, Strom, Heizung, weitere Posten mit Häkchen „NK“.

## Website (Repo web-takeover-buddy)

- Formular `LongTermRental.tsx` schreibt über `externalSupabase` in `rental_inquiries`
  (`house_id` = Website-`houses.external_house_id`).
- Angebotsseite `pages/Angebot.tsx` ruft `get_rental_offer` / `respond_rental_offer` über
  `externalSupabase` auf.
- Die kurzzeitig auf der Website gebauten Admin-Teile (Mietanfragen, Kalkulation, Angebot) und
  ihre Tabellen sind entfernt (`20261118c_…umzug_hausverwaltung.sql`).

## Teil 2 (18.11.2026, SQL 73 + Edge Function `rental-portal`)

SQL `supabase/SQL/73_mietinteressenten_unterlagen_mail.sql` (von Uli im SQL-Editor ausgeführt).
Edge Function `supabase/functions/rental-portal/index.ts` (deployt, `verify_jwt = false`).

### Selbstauskunft und Unterlagen

- Erst **nach der Zusage** zeigt die Angebotsseite der Website den Block „Nächster Schritt:
  Selbstauskunft und Unterlagen“ (`web-takeover-buddy/src/components/OfferApplication.tsx`).
- Selbstauskunft → `rental_applications` (eine je Angebot, erneutes Senden überschreibt):
  Name, Geburtsdatum, Adresse, Beruf, Arbeitgeber, beschäftigt seit, Nettoeinkommen,
  Erwachsene/Kinder, Haustiere, bisheriger Vermieter, „keine Exekution/Insolvenz“ (Eigenangabe),
  Anmerkungen, **Einwilligung Datenschutz Pflicht**. Nur Admin lesbar.
- Unterlagen (Ausweis, Einkommensnachweis, Selbstauskunft unterschrieben, Sonstiges; PDF/Bild,
  ≤ 20 MB, ≤ 15 Dateien je Angebot) → **Dokumentenverwaltung**: Typ „Mieterunterlagen“ (neu),
  Ordner `<Ablageort Haus/Mieterunterlagen>/<Name (Datum Angebot)>`; ohne festgelegten Ablageort
  `DokumentManagement / <Hausordner> / Mieterunterlagen` (Hausordner aus einem anderen
  Ablageort des Hauses abgeleitet, z. B. „Venediger“) — der Ablageort wird dabei gemerkt.
  Verknüpfung `document_links.entity_type = 'mietangebot'`, `entity_id = rental_offers.id`.
- Ablauf Upload wie in der Hausverwaltung (Doku Dokumentenverwaltung Abschnitt 5), nur über
  `rental-portal` statt `onedrive-api`: `uploadSession` (Token-Prüfung, Typ/Größe/Anzahl) →
  Browser lädt in Blöcken direkt zu Microsoft → `uploadComplete` (prüft, dass die Datei im
  Ordner DIESES Angebots liegt, legt `documents` + `document_links` an).
- `get_rental_offer` liefert zusätzlich `application_submitted` und die Namen der Unterlagen.

### Anzeige in der Hausverwaltung

`RentalOfferDialog` → `RentalApplicationPanel.tsx`: Selbstauskunft und Unterlagen (Link zu
OneDrive). Knopf **„Als Mieter übernehmen“** (nur bei angenommenem Angebot) →
`RentalTenantTakeoverDialog.tsx`: vorbelegt Mieter, E-Mail, Telefon, Vertragsbeginn = Einzug,
Vertragsende = Einzug + Dauer − 1 Tag (leer = unbefristet), Kaltmiete, Nebenkosten, Kaution,
Zahltag 1. Schreibt über `useUpdateHouse`: `houses.rental_type = 'long_term'`, `tenant_info`
(bestehende Felder wie `payment_method` bleiben). Warnung, wenn schon ein Mieter eingetragen ist.
Danach `rental_offers.converted_at`, Anfrage → „erledigt“. Ab dann `generate-tenant-payments`
(Warmmiete = `monthly_rent` + `additional_costs`).

> Achtung Doppel-Quelle Vorauszahlung (`docs/Nebenkosten-Touristisch-vs-Festvermietung.md`
> Abschnitt 6): Die Übernahme setzt nur `tenant_info.additional_costs`, nicht
> `utility_settings.monthly_prepayment`. Bei Nebenkosten als **Vorauszahlung** dort ggf. von Hand
> nachziehen.

### E-Mail an Uli

Trigger (`rental_inquiry_notify`, `rental_offer_notify`, `rental_application_notify`) →
`notify_rental_portal()` → `net.http_post` → `rental-portal` Aktion `notify` → `send-guest-email`
an **steinbockchalets@gmail.com**. Je Ereignis höchstens einmal (`rental_inquiries.notified_at`,
`rental_offers.response_notified_at`, `rental_applications.notified_at`). Ein Fehler beim
Benachrichtigen verhindert nie die Anfrage/Antwort (Exception wird abgefangen). Live geprüft:
Aufruf mit unbekannter ID → `{"skipped":true}`.

## Paket D (18.11.2026, SQL 74): Mietvertrag, Übergabeprotokoll, Inventarliste

SQL `supabase/SQL/74_mietvertrag_uebergabeprotokoll.sql` (von Uli im SQL-Editor auszuführen,
Hausverwaltung `usblrulkcgucxtkhugck`). **Keine Edge-Function-Änderung**: die PDFs laufen über
`onedrive-api` wie jeder Upload in der Dokumentenverwaltung.

### Grundlage

Ulis „Mietvertrag Venedigersiedlung 316 kurz DE-EN“ (OneDrive `Haus Venedigersiedlung 316 - 2020 /
Mietvertrag`), am 18.11.2026 geprüft (österreichisches Recht, keine Rechtsberatung):
- Einfamilienhaus = Vollausnahme MRG (§ 1 Abs 2 Z 5) → ABGB, Befristung 12 Monate zulässig.
- Mieten-Wertsicherungsgesetz (seit 1.1.2026) gilt dort nicht; Miete bleibt fix.
- Uli vermietet als **Privatperson** → KSchG gilt in der Regel nicht; Kleinreparatur-Klausel bleibt.
  Kommen weitere Objekte dazu (Unternehmer-Eigenschaft), Klausel prüfen lassen.
- **Ergänzt:** § 8 Energieausweis (EAVG: vor Abschluss vorlegen, ≤ 14 Tage danach aushändigen,
  ≤ 10 Jahre alt), Höchstzahl Bewohner, Haftung für Mitbewohner/Besucher, Mülltrennung/Hausordnung,
  Hinweis Datenschutzerklärung; ukrainespezifische Angaben (Staatsangehörigkeit, Ausweis-Nr.,
  Aufenthaltsnachweis) optional; unbefristete Variante, Nebenkosten-Pauschale-Variante.
- **Wald Chalet:** Adresse `Trattenbach 299/17` deutet auf eine Anlage. Liegt Wald in einer
  Wohnungseigentumsanlage mit mehr als zwei Einheiten, gilt das MRG teilweise — eine Befristung
  unter 3 Jahren wäre dann unwirksam. Deshalb ist der MRG-Hinweis für Wald bewusst leer; vor dem
  ersten Vertrag klären.

### Tabellen

| Tabelle | Inhalt |
|---|---|
| `rental_contract_templates` | `content` jsonb: `title_de/en`, `annex_de/en`, `protocol_items[]`, `sections[{title_de,title_en,paragraphs[{de,en,when?,type?}]}]`. `house_id` leer = Standard (eine), optional eine je Haus. |
| `rental_contract_house_data` | je Haus: Vermieter, Konto, Kopfzeile/Kurzbezeichnung, Mietgegenstand DE/EN, MRG-Hinweis, Gemeinde, Anleitung Meldezettel, Hausbesonderheiten, Höchstzahl Bewohner, USt-Hinweis, Kleinreparatur, Winterdienst, Kündigung ab/Frist, Zahltag, Energieausweis (HWB, fGEE, Klasse, Datum), `meters/keys/rooms` fürs Protokoll |
| `rental_contracts` | je Angebot einer (nicht storniert): `status` draft/issued/signed/cancelled, `values` (Eingaben inkl. `positions[]`, `overrides`, `zahltag`), Kopie `sections` (fertiger Text), `protocol`, `inventory`; `contract_/protocol_/signed_document_id` → `documents` |

Alle drei: RLS nur Admin, `revoke all from anon`, GRANT authenticated/service_role.
Keine Personendaten im SQL (Vermieter/IBAN trägt Uli in der App ein).

### Platzhalter

`{{schluessel}}` — je Sprache wird zuerst `schluessel_de`/`_en` gesucht. Absatz mit `when: "x"`
nur wenn x gesetzt, `"!x"` nur wenn nicht. Fehlt ein Wert: im Text `[Bezeichnung]`, im Dialog
„Noch offen“; **Ausfertigen ist erst ohne offene Angaben möglich** (Entwurf-PDF geht immer).
Schlüssel und Bezeichnungen: `PLATZHALTER_LABEL` in `lib/rentalContract.ts`.

### Ablauf

```
Angebot angenommen → „Mietvertrag erstellen“
  vorbelegt: Mieter (Selbstauskunft/Angebot), Beginn/Dauer/Ende, Beträge (Grundmiete, NK),
             Kaution; Haus aus Vertragsdaten; Inventar aus house_inventory (ohne Muster)
  Absatz ändern (Stift) → overrides; „Entwurf als PDF“ (nur Download)
„Ausfertigen und ablegen“ → Kopie speichern → 2 PDFs:
  Mietvertrag <Kurz> - <Mieter> (<Beginn>).pdf   (Vertrag + Anhang 1 Protokoll + Anhang 2 Inventar)
  Übergabeprotokoll <Kurz> - <Mieter> (<Beginn>).pdf   (Anhang 1 + 2 zum Ausdrucken bei Übergabe)
  → OneDrive <Ablageort Mieterunterlagen> / <Name (Datum Angebot)>, Typ „Mieterunterlagen“,
    document_links 'mietangebot' → erscheinen auch unter „Selbstauskunft und Unterlagen“
Ausdrucken, unterschreiben → „Unterschriebenen Vertrag hochladen“ → status signed
→ „Als Mieter übernehmen“ (Werte aus dem Vertrag: Miete = Positionen Miete + Zusatz,
  NK = Positionen Nebenkosten, Kaution, Zahltag, Beginn/Ende)
```
„Wieder bearbeiten“ setzt einen ausgefertigten Vertrag zurück auf Entwurf (PDFs bleiben in OneDrive).
„Stornieren“ (nicht bei unterschrieben) → neuer Vertrag möglich.

### PDF

jsPDF Standardschrift Helvetica (Windows-1252): `→` wird `>`, `²/³` werden `2/3` (sonst unsichtbar).
Seitenkopf je Paragraf zweispaltig DE | EN, Beträge als eigene Tabelle, Fußzeile
„Mietvertrag <Kurz> – <Mieter>“ + Seitenzahl.

### Getestet

Lokal PostgreSQL 16: SQL zweimal hintereinander, anon ohne Rechte, Admin liest, zweiter aktiver
Vertrag je Angebot abgewiesen, nach Storno wieder möglich. Oberfläche mit Playwright gegen
nachgebildete Supabase-API: Vertragsdaten ausfüllen → keine offenen Angaben → Ausfertigen
(2 PDFs, 3 Ordneraufrufe, Verknüpfungen) → Unterschrift hochladen → Übernahme mit
Miete 2.880 (Grundmiete + Garage), NK 100, Kaution 8.940, Zahltag 3; Handy-Ansicht 390 px; keine
JS-Fehler. **Nicht live getestet** (Anmeldung nötig).

## Offen

1. **Max** lesend: Werkzeug „Mietinteressenten“ (ohne Preise, ohne Annehmen).
2. `types.ts` neu erzeugen (Tabellen fehlen dort → derzeit `as any`).
3. Datenschutzerklärung der Website um Mietinteressenten (Selbstauskunft, Unterlagen,
   Speicherdauer, Löschung bei Absage) ergänzen — Text von Uli freigeben.
4. Löschkonzept: Unterlagen abgelehnter Interessenten nach Frist löschen (derzeit von Hand).
5. ~~Mietvertrag-Vorlage und Übergabeprotokoll (Paket D)~~ — erledigt 18.11.2026 (SQL 74).
6. Editor für die Vertragsvorlage in der App (derzeit: Änderungen je Vertrag über „Absatz ändern“,
   dauerhafte Änderungen an der Vorlage per SQL / `rental_contract_templates.content`).
7. Wald: rechtliche Einordnung (MRG) klären, Vertragsdaten ergänzen.
8. Energieausweise beider Häuser in Vertragsdaten eintragen (auch für die Portal-Anzeigen nötig).
