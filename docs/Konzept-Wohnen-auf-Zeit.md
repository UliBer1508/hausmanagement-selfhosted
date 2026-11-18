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
Hausverwaltung  Vertrag, Kaution, Übergabe  (Paket A Teil 2 / Paket D)
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

## Offen

1. **Max** lesend: Werkzeug „Mietinteressenten“ (ohne Preise, ohne Annehmen).
2. `types.ts` neu erzeugen (Tabellen fehlen dort → derzeit `as any`).
3. Datenschutzerklärung der Website um Mietinteressenten (Selbstauskunft, Unterlagen,
   Speicherdauer, Löschung bei Absage) ergänzen — Text von Uli freigeben.
4. Löschkonzept: Unterlagen abgelehnter Interessenten nach Frist löschen (derzeit von Hand).
5. Mietvertrag-Vorlage und Übergabeprotokoll (Paket D).
