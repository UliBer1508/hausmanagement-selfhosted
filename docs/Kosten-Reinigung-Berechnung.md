# Reinigungskosten: Berechnung, MwSt und Bezug zu den Portalen

> **Stand:** 19.08.2026 · Repo `hausmanagement-selfhosted`
> **Warum es dieses Dokument gibt:** Die Kostenberechnung war nirgends
> beschrieben. Die Formel stand dreimal wörtlich im Code, es gab keine
> Umsatzsteuer auf der Dienstleisterseite, und wer wissen wollte, ob die
> Portale mitrechnen, musste jedes Mal von Neuem suchen.

---

## 1. Die Kurzfassung (wer nur eine Minute hat)

- **Gerechnet wird ausschließlich in der Hausverwaltung.** Die Portale von Amela
  und Boris rechnen **nichts**.
- Es gibt **eine** Definition, sie hängt am Dienstleister:
  `service_providers.billing_mode` entscheidet zwischen Stundensatz und Pauschale.
- `service_tasks.cleaning_cost` ist **NETTO**. Brutto wird immer abgeleitet,
  nie gespeichert.
- **Kein Ersatzwert.** Fehlt der passende Satz, gibt es keinen Betrag und keinen
  Auftrag — nur eine Fehlermeldung.
- Die Formel steht in **`src/lib/cleaningCost.ts`**. Wer sie ändert, muss die
  Kopie in der Edge Function mitziehen (siehe Abschnitt 5).

---

## 2. Datenmodell

### service_providers

| Spalte | Typ | Bedeutung |
|---|---|---|
| `billing_mode` | text, NOT NULL, Default `'hourly'` | `'hourly'` oder `'flat'` |
| `hourly_rate` | numeric(10,2) | Stundensatz **netto**. Nur wirksam bei `hourly`. |
| `flat_rate` | numeric(10,2) | Pauschale **netto** je Reinigung. Nur wirksam bei `flat`. |
| `vat_percentage` | numeric(5,2) | Steuersatz in Prozent. NULL = kein Satz ausgewiesen. |

Constraints:
- `billing_mode IN ('hourly','flat')`
- `billing_mode <> 'flat' OR flat_rate IS NOT NULL`

Der jeweils **nicht** aktive Satz wird beim Speichern auf NULL gesetzt. In einer
Zeile stehen nie zwei Beträge, aus denen sich später jemand den falschen greift.

### service_tasks

| Spalte | Bedeutung |
|---|---|
| `cleaning_cost` | **NETTO**. Bei `hourly`: Satz × Stunden. Bei `flat`: die Pauschale. |
| `cleaning_vat_percentage` | Steuersatz, **eingefroren** zum Zeitpunkt der Berechnung. |
| `cleaning_hours` | Bei `hourly` Rechengröße, bei `flat` **nur Planungsgröße**. |

**Warum der Satz auf dem Auftrag eingefroren wird:** Sonst würde eine spätere
Satzänderung beim Dienstleister rückwirkend alle Altbeträge verfälschen. Gleiches
Muster wie `laundry_invoices.mwst_satz` auf der Wäscheseite.

**Momentaufnahme, kein Live-Wert:** `cleaning_cost` wird zum Zeitpunkt des
Speicherns berechnet und bleibt dann stehen. Beispiel aus der Praxis: Boris'
Aufträge aus 2025 tragen 108,00 bzw. 144,00 — das sind 3 bzw. 4 Stunden × 36
EUR/Std, ein Satz, der längst nicht mehr im Provider steht.

SQL: `supabase/SQL/50_reinigungskosten_abrechnungsart.sql`

---

## 3. Die Formel

```
billing_mode = 'flat'    →  cleaning_cost = flat_rate
billing_mode = 'hourly'  →  cleaning_cost = hourly_rate × cleaning_hours

brutto = cleaning_cost × (1 + cleaning_vat_percentage / 100)     [nur Anzeige]
```

Fehlt der zur Abrechnungsart passende Satz, liefert die Berechnung **keinen
Betrag**, sondern eine Klartextmeldung. Die Mutation bricht ab, der Auftrag
entsteht nicht.

---

## 4. Wo Beträge entstehen (drei Stellen — keine weitere)

| # | Datei | Wann |
|---|---|---|
| 1 | `src/components/Cleaning/CreateCleaningTaskDialog.tsx` | Reinigung von Hand anlegen |
| 2 | `src/components/Cleaning/EditCleaningTaskDialog.tsx` | Reinigung bearbeiten |
| 3 | `supabase/functions/create-cleaning-task-for-booking/index.ts` | Automatik bei Buchung (Status `draft`) |

Alle drei nutzen dieselbe Definition. 1 und 2 importieren
`calculateCleaningCost` aus `@/lib/cleaningCost`; 3 trägt eine als solche
gekennzeichnete Kopie (Deno kann nicht aus `src/` importieren).

**Vierte Stelle für nachträgliche Korrektur:**
`src/components/ServicePortal/ProviderBillingDialog.tsx` — dort werden Beträge
nicht neu erzeugt, sondern bestehende korrigiert (Abschnitt 7).

### Anlegewege OHNE Kosten (bekannt, unverändert)

Diese Wege legen Reinigungen **ohne** `provider_id`, `cleaning_hours` und
`cleaning_cost` an. Solche Aufträge tauchen in keiner Abrechnung auf:

- `src/hooks/useBookingInquiries.ts` (Buchungsanfrage annehmen)
- `chat-assistant`, Pfad `accept_booking_inquiry`
- `AddStandaloneCleaningDialog.tsx` in **beiden** Portalen

Dass der Portal-Filter `'unassigned'` existiert (`useBookings.ts`), zeigt: der
Zustand ist bekannt. **Offener Punkt**, bewusst nicht im selben Schritt behoben.

---

## 5. Doppelgänger-Warnung

`src/lib/cleaningCost.ts` und der Rechenblock in
`supabase/functions/create-cleaning-task-for-booking/index.ts` sind **bewusst
identisch gehaltene Zwillinge**. Deno kann die lib-Datei nicht importieren.

> **Wer die Formel ändert, muss BEIDE ändern.** Im Code steht der Hinweis an
> beiden Stellen.

Die Edge Function läuft erst nach eigenem Deploy:
`supabase functions deploy create-cleaning-task-for-booking --project-ref usblrulkcgucxtkhugck`

---

## 6. Bezug zu den Portalen (das Thema, das immer wieder gesucht wurde)

### Die Portale rechnen NICHTS

In `amela-clean-hub-selfhosted` und `boris-clean-hub-selfhosted` kommt
`cleaning_cost` **nur in `src/integrations/supabase/types.ts`** vor — nirgends
gelesen, nirgends geschrieben. Es gibt dort keine Kostenanzeige, keine
Abrechnung, keine Formel. Eine Änderung an der Kostenberechnung erfordert
**keine** Änderung in den Portalen.

### hourly_rate in den Portalen ist etwas anderes

`StaffForm.tsx` und `PutzkraeftePage.tsx` zeigen ein Feld „Stundenlohn (€)".
Das ist **`cleaning_staff.hourly_rate`** — der Lohn der eigenen Putzkräfte von
Amela bzw. Boris, nicht der Satz gegenüber Uli. Der Wert wird gespeichert und
angezeigt, aber **niemals multipliziert**. Nicht mit
`service_providers.hourly_rate` verwechseln.

### Was die Portale tatsächlich schreiben

| Datei (in beiden Portalen) | Schreibt |
|---|---|
| `hooks/useBookings.ts` | `status`, `status_changed_by` (`'Amela'` / `'Boris'`), `status_changed_at`, `scheduled_date`, `scheduled_time` |
| `pages/CleaningPortal.tsx` | `notes` |
| `components/AddStandaloneCleaningDialog.tsx` | neue Reinigung ohne Buchung — **ohne** `provider_id` und ohne Kosten |

### Trennung der beiden Portale

Ausschließlich über `service_tasks.provider_id`:

- Boris `193a013f-45ed-4621-b95f-b449aa79c2c9`
- Amela `9de6e071-7e89-4d66-9433-a5f01acaa493`
- Teuni `d8110105-8ac9-45e3-ad32-aaf42393744c` (Wäsche)

Keine getrennten Tabellen, keine Mandantentrennung auf DB-Ebene. Beide Portale
sind Template-Kopien voneinander — Änderungen sind fast immer in beiden nötig.

### Warum „nur für ein Portal umsetzen" nicht geht

Der Bearbeiten-Dialog und die Berechnung liegen in der Hausverwaltung. „Erst für
Boris" kann darum nur heißen: **Boris ist der erste Dienstleister, dessen
`billing_mode` umgestellt wird** — nicht, dass Code im Boris-Portal geändert
wird.

---

## 7. Oberfläche

### Provider Verwaltung → Bearbeiten (`ProviderManagementDialog.tsx`)

Bei Service-Typ „Reinigung" ein umrahmter Block:
1. **Abrechnungsart** — „Pro Stunde" / „Pauschale pro Reinigung"
2. **entweder** Stundensatz **oder** Pauschale (netto) — nie beide
3. **MwSt-Satz (%)**

Alle drei sind **echte Pflichtfelder**: `handleSubmit` prüft und bricht ab.
Bis 19.08.2026 trug das Label nur einen Stern, geprüft wurde nichts.

### Abrechnung (`ProviderBillingDialog.tsx`)

- Spalten **Netto · MwSt · Brutto**, mit Brutto-Summen je Gruppe und gesamt.
- **„Einträge bearbeiten"** (blauer Knopf): Stunden, Netto und MwSt-Satz je
  Zeile frei überschreibbar. Brutto rechnet live mit, wird nicht gespeichert.
- **„aus Satz"** je Zeile / **„Alle aus Abrechnungsart füllen"**: füllt mit dem
  Ergebnis der hinterlegten Definition.
- Speichern schreibt nur geänderte Zeilen, jede mit `.select()` und Prüfung auf
  betroffene Zeilen.
- **Bezahlstatus per Klick** auf das Badge: offen ↔ bezahlt, sofort gespeichert.
  Ohne Rückfrage, weil der zweite Klick es zurücknimmt.
- Query filtert hart auf `status = 'completed'` — **nicht abgeschlossene
  Reinigungen erscheinen hier nicht.**

---

## 8. Fallen, die schon zugeschlagen haben

**Der 50-EUR-Fallback (entfernt).** In der Edge Function stand
`provider.hourly_rate || 50`. Toter Code, solange jeder Provider einen Satz
hatte — bis Boris auf Pauschale umgestellt wurde und `hourly_rate` dadurch NULL
war. Ab dem Moment hätte die Automatik 50 EUR/Std × Stunden geschrieben.
**Lehre:** ein Fallback ist keine Absicherung, sondern eine verzögerte Falschbuchung.

**`is_active`-Filter im Edit-Dialog (behoben).** Die Provider-Liste lud mit
`.eq('is_active', true)`. Bei einem inaktiven Dienstleister war
`selectedProvider` `undefined` → `cleaningCost` null → jedes Speichern
überschrieb den vorhandenen Betrag still mit NULL.

**Mausrad auf Zahlenfeldern (behoben).** `<input type="number">` reagiert bei
Fokus auf Scrollen. Mit `step="0.01"` sind zwei Radrasten −0,02. So wurden aus
150,00 und 20,00 unbemerkt 149,98 und 19,98. Alle Zahlenfelder tragen jetzt
`onWheel={(e) => (e.target as HTMLElement).blur()}`. **Bei jedem neuen
Zahlenfeld mitgeben.**

**Der Stern im Label ist keine Prüfung.** Siehe Abschnitt 7.

---

## 9. Nicht verwechseln: Gastpauschale ≠ Dienstleisterkosten

`cleaning_fee` / `cleaning_fee_per_stay` (Default 80 €, `usePricingConfig.ts`,
`AdditionalFeesTab.tsx`) ist die **Reinigungsgebühr, die der Gast zahlt**. Sie
hat eine eigene MwSt (`houses.additional_fees.vat_percentage`) und ist im Code
mit den Dienstleisterkosten **in keiner Weise verknüpft**.

---

## 10. Prüfabfragen

```sql
-- Definition je Dienstleister
select name, service_type, billing_mode, hourly_rate, flat_rate, vat_percentage, is_active
from service_providers order by name;

-- Aufträge mit ihren eingefrorenen Werten
select st.scheduled_date, sp.name, sp.billing_mode,
       st.cleaning_hours, st.cleaning_cost, st.cleaning_vat_percentage,
       round(st.cleaning_cost * (1 + coalesce(st.cleaning_vat_percentage,0)/100), 2) as brutto,
       st.payment_status, st.status
from service_tasks st
left join service_providers sp on sp.id = st.provider_id
where st.service_type = 'cleaning'
order by st.scheduled_date desc;

-- Aufträge ohne Kosten (die in keiner Abrechnung auftauchen)
select st.id, st.scheduled_date, st.provider_id, st.cleaning_cost
from service_tasks st
where st.service_type = 'cleaning'
  and (st.provider_id is null or st.cleaning_cost is null);
```

---

## 11. Offene Punkte

- **Amela hat keinen MwSt-Satz** (`vat_percentage` NULL). Bis er eingetragen ist,
  kann bei ihren Reinigungen keine MwSt ausgewiesen werden.
- **Die drei Anlegewege ohne Kosten** (Abschnitt 4) sind unverändert.
- **`ProviderBillingDialog` zeigt nur `status = 'completed'`.** Aufträge in
  anderen Status fehlen in der Abrechnung — im Fall Boris fehlte dadurch eine
  Reinigung, die auf seiner Rechnung stand.
- **Max kennt die Kosten nicht.** `cleaning_cost`, `cleaning_hours` und
  `hourly_rate` kommen in `chat-assistant/index.ts` null Mal vor. Für den
  KI-Ausbau relevant: Max kann keine Kostenfrage beantworten.
- **`types.ts` neu generieren.** Bis dahin tragen die Schreibpfade auf
  `service_providers` und `service_tasks` ein `as any` mit Kommentar.
