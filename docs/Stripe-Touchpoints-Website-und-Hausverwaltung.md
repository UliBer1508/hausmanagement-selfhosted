# Stripe-Integration — Konkrete Andockpunkte (Website + Hausverwaltung)

> Status: **Vorschlag / nicht umgesetzt** · Stand: Juni 2026
> Repos: `web-takeover-buddy` (Website steinbockchalets.com) +
> `hausmanagement-selfhosted` (Hausverwaltung)
>
> ⚠️ **Hinweis (aktualisiert):** `my-sweet-home-manager` (Lovable) wird nicht mehr verwendet und ist stillgelegt/gelöscht — es wird nur noch im `-selfhosted`-Repo gearbeitet.
> Ergänzt: `Stripe-Integration-Concept.md`, `Booking-Surcharges-Concept.md`

Dieses Dokument beschreibt **datei- und stellengenau**, wo Stripe im Code andocken
muss — basierend auf der tatsächlichen Analyse der Codebasis.

---

## 1. Ist-Zustand (analysiert)

### Zwei getrennte Supabase-Projekte
| Rolle | Projekt-ID | Verwendung |
|---|---|---|
| Website | `xcohqbdgzprkixeycdhk` | eigene DB der Buchungs-Website |
| Hausverwaltung | `usblrulkcgucxtkhugck` | „hausmanagement-selfhosted" |

Die Website spricht **beide** an:
- `src/integrations/supabase/client.ts` → eigene DB
- `src/integrations/external-supabase/client.ts` → Hausverwaltung (mit deren anon-Key)

### Buchungsfluss heute (`src/components/BookingForm.tsx`)
```
Gast füllt Formular
  → calculatePriceBreakdown()  (Saisonpreis, Kurtaxe/Person/Nacht,
                                Reinigung, Wäsche, Service, Promo-Rabatt)
  → INSERT booking_inquiries (Website-DB)   inkl. total_price, nights, …
  → INSERT booking_inquiries (Hausverwaltung) inkl. estimated_amount
  → toast("Anfrage gesendet")  ← HIER IST SCHLUSS, keine Zahlung
```

**Befund:** Der zu zahlende Betrag (`calculatedPrice.grandTotal`) ist bereits
vollständig berechnet. Es fehlt nur der Zahlungsschritt. **Kein Stripe-Code vorhanden.**

### Sicherheitsbefund (vor Go-Live beheben)
- `.env` liegt im Repo (jetzt public). Enthält nur den **anon-Key** (publishable) →
  kein Notfall, aber `.env` sollte aus dem Git-Tracking raus (`git rm --cached .env`).
- Der **anon-Key der Hausverwaltung steht im Klartext** in
  `external-supabase/client.ts`. Da er ohnehin im ausgelieferten Frontend landet und
  durch RLS (`USING(true)` für authenticated) abgesichert ist, ist das vertretbar —
  aber ein Schreibzugriff aus dem offenen Web auf `booking_inquiries` der
  Hausverwaltung sollte mittelfristig über eine **Edge Function mit Validierung**
  laufen statt über Direkt-Insert mit anon-Key.

---

## 2. Grundsatzentscheidung: Wann zahlt der Gast?

Zwei Modelle — Empfehlung **B** für den Anfang:

| Modell | Ablauf | Bewertung |
|---|---|---|
| **A: Zahlung sofort bei Anfrage** | Gast zahlt direkt, Geld reserviert | Bei Ablehnung Rückerstattung nötig; mehr Reibung |
| **B: Zahlungslink nach Genehmigung** ✅ | Anfrage → du genehmigst → Gast bekommt Zahlungslink | Passt zu deinem heutigen Genehmigungs-Workflow, keine Rückzahlung bei Ablehnung |

Modell B nutzt **denselben** Mechanismus wie die Belvilla-Zusatzforderungen
(`booking_charges` / `payments`) — ein System für beide Fälle.

> Später optional Modell A als „Instant Book" für Stammgäste.

---

## 3. Andockpunkte — datei­genau

### A) Hausverwaltung (`hausmanagement-selfhosted`) — der Zahlungs-Kern

Hier liegen Tabellen + Edge Functions (siehe `Stripe-Integration-Concept.md`):

| Stelle | Aufgabe |
|---|---|
| Migration: Tabelle `payments` | zentrale Zahlungstabelle (kanalübergreifend) |
| `supabase/functions/create-payment-link/` | erzeugt Stripe Payment Link / Checkout Session |
| `supabase/functions/stripe-webhook/` | verbucht Zahlungseingang (signiert), setzt Status |
| Buchungsgenehmigung (`accept_booking_inquiry`-Flow / `booking_inquiries` → `bookings`) | nach Genehmigung Button **„Zahlungslink senden"** |
| `booking_charges` (aus Surcharge-Konzept) | Belvilla-Zusatzforderungen → gleicher `payments`-Unterbau |

### B) Website (`web-takeover-buddy`) — Zahlung für Direktbuchung

| Datei | Änderung |
|---|---|
| `src/components/BookingForm.tsx` (Zeile ~444, nach erfolgreichem Insert) | Statt nur `toast`: Hinweis „Anfrage gesendet — nach Bestätigung erhalten Sie einen Zahlungslink". Bei Modell A stattdessen direkt Checkout starten. |
| `src/integrations/supabase/client.ts` | unverändert |
| **neu:** `src/lib/payment.ts` | ruft Edge Function `create-payment-link` auf, leitet zu Stripe weiter |
| **neu:** `src/pages/PaymentSuccess.tsx` / `PaymentCancel.tsx` | Stripe-Redirect-Ziele nach Zahlung |
| **neu:** `supabase/functions/create-checkout/` (Website-DB) **oder** Wiederverwendung der Hausverwaltungs-Function | erzeugt Checkout Session; Secret `STRIPE_SECRET_KEY` |

> **Wichtig — eine Quelle der Wahrheit für Beträge:** Der Stripe-Betrag darf **nicht**
> aus dem Browser kommen (Manipulationsschutz). Die Edge Function lädt
> `booking_inquiries.total_price` (bzw. nach Genehmigung `bookings.booking_amount`)
> serverseitig und erzeugt damit die Session.

### C) Nebenkosten-Modell — beide Objekte berücksichtigen

Deine Präzisierung ist im Datenmodell wichtig:

| Objekt | Portal | Modell heute | Stripe-relevant |
|---|---|---|---|
| **Chalet Wald** | Belvilla | teils **pro Person** (Bettwäsche, Ortstaxe) | Zusatzforderung bei Personenänderung → Zahlungslink |
| **Venedigersiedlung** | andere Portale | **feste NK-Beträge** | soll pro-Person **optional** auch möglich werden |

→ Das erweiterte Nebenkosten-Schema (`Booking-Surcharges-Concept.md`, Abschnitt 4)
muss **pro Haus** zwischen „pro Person" und „Pauschale" umschaltbar sein. Die Website
berechnet in `calculatePriceBreakdown()` Kurtaxe bereits pro Person — diese Logik ist
die Vorlage; sie muss nur in der Hausverwaltung gespiegelt werden, damit Angebot
(Website) und Forderung (Hausverwaltung) identische Beträge liefern.

> Da **alle** Buchungsportale eine pro-Person-Kostenaufstellung anbieten, lohnt es sich,
> das pro-Person-Modell als Standard anzulegen und feste Beträge als Sonderfall
> (Pauschale = pro-Person-Satz × 0 + Fixbetrag).

---

## 4. Datenfluss mit Stripe (Modell B)

```
Website: Anfrage  ─────────────►  booking_inquiries (beide DBs)
                                        │
Hausverwaltung: du genehmigst           ▼
   accept_booking_inquiry  ──►  bookings (booking_amount gesetzt)
                                        │  Button „Zahlungslink senden"
                                        ▼
   create-payment-link (Edge, service_role)
     • Betrag aus bookings.booking_amount (serverseitig)
     • Stripe Payment Link
     • payments-Zeile (status 'created')
                                        │  Link per send-gmail an Gast
                                        ▼
   Gast zahlt auf Stripe-Seite
                                        ▼
   stripe-webhook (signiert)
     • payments.status = 'paid'
     • bookings.payment_status = 'paid'
```

---

## 5. Umsetzungs-Reihenfolge (empfohlen)

**Schritt 1 — Zahlungs-Kern in der Hausverwaltung (Test-Keys)**
`payments`-Tabelle + `create-payment-link` + `stripe-webhook`. Erst der
Belvilla-Zusatzforderungs-Fall (kleinster, klarster Anwendungsfall, sofortiger Nutzen).

**Schritt 2 — „Zahlungslink senden" nach Genehmigung**
Button im Genehmigungs-Flow; Versand über bestehende `send-gmail`-Function.

**Schritt 3 — Website-Direktbuchung**
`BookingForm.tsx` + Success/Cancel-Seiten; nutzt denselben Zahlungs-Kern.

**Schritt 4 — Härtung**
Direkt-Insert der Website in die Hausverwaltung durch validierende Edge Function
ersetzen; `.env` bereinigen; Live-Keys.

**Schritt 5 (später) — Wallbox**
Gleiche `payments`-Tabelle, `purpose='wallbox'`.

---

## 6. Neue Secrets (nur in Edge-Function-Secrets, nie im Frontend)

| Secret | Wo | Zweck |
|---|---|---|
| `STRIPE_SECRET_KEY` | Hausverwaltung (+ ggf. Website) | Stripe-Server-Calls |
| `STRIPE_WEBHOOK_SECRET` | Hausverwaltung | Webhook-Signaturprüfung |

---

## 7. Offene Entscheidungen (für dich)

1. **Modell A oder B** als Start? (Empfehlung: B — passt zu deinem Genehmigungs-Workflow.)
2. **Eine Stripe-Edge-Function für beide Repos** (in der Hausverwaltung) oder je eine?
   Empfehlung: zentral in der Hausverwaltung, Website ruft sie auf → ein Reporting.
3. **Anzahlung vs. Vollzahlung** bei Direktbuchung? (z. B. 30 % bei Buchung, Rest vor Anreise.)
4. **Belvilla-Vertragsfrage** (aus Surcharge-Konzept): Dürfen Zusatzforderungen direkt
   an den Gast gehen?
