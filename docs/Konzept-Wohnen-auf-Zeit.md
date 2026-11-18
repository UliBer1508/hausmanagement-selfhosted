# Wohnen auf Zeit — Mietinteressenten, Kalkulation, Angebot (Paket A, Teil 1)

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

## Offen (nächste Schritte Paket A Teil 2)

1. **Unterlagen** bei Annahme: Selbstauskunft, Ausweis, Einkommensnachweis hochladen →
   Dokumentenverwaltung (OneDrive, `document_links`), Upload über eine Edge Function mit
   Token-Prüfung (Kunde ist nicht angemeldet).
2. **„Als Mieter übernehmen“**: aus angenommenem Angebot `houses.tenant_info` füllen
   (Mieter, Vertragsbeginn/-ende, Kaltmiete, Nebenkosten, Kaution, Zahltag) und Gast in `guests`
   (über `find_or_create_guest()`), damit `generate-tenant-payments` übernimmt.
3. **E-Mail an Uli** bei neuer Anfrage/Antwort (optional, `send-guest-email`).
4. **Max** lesend: Werkzeug „Mietinteressenten“ (ohne Preise, ohne Annehmen).
5. `types.ts` neu erzeugen (Tabellen fehlen dort → derzeit `as any`).
