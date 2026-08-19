# Einfügetext für docs/CODE-INDEX.md

Zwei Blöcke. Beide wörtlich einfügen, nichts anderes ändern.

---

## BLOCK 1 — neuer Abschnitt „9c"

**Einfügen direkt VOR der Zeile `## 9b. Wäschebestellung: VIER Anlegewege`**

```markdown
## 9c. Reinigungskosten: Berechnung, Abrechnungsart, MwSt — NEU 19.08.2026

**Vollständige Beschreibung: `docs/Kosten-Reinigung-Berechnung.md` — bei allem
lesen, was Beträge, Stundensätze, Pauschalen oder MwSt der Reinigung berührt.**

**Die Formel liegt an EINER Stelle: `src/lib/cleaningCost.ts`.**

```
billing_mode = 'flat'    →  cleaning_cost = flat_rate
billing_mode = 'hourly'  →  cleaning_cost = hourly_rate × cleaning_hours
```

`service_tasks.cleaning_cost` ist **NETTO**. `cleaning_vat_percentage` friert
den Steuersatz auf dem Auftrag ein. **Brutto wird abgeleitet, nie gespeichert.**

Beträge entstehen an drei Stellen — keiner weiteren:

| Datei | Wann |
|---|---|
| `Cleaning/CreateCleaningTaskDialog.tsx` | Reinigung von Hand anlegen |
| `Cleaning/EditCleaningTaskDialog.tsx` | Reinigung bearbeiten |
| `supabase/functions/create-cleaning-task-for-booking/index.ts` | Automatik (Status `draft`) |

Nachträgliche Korrektur bestehender Beträge:
`ServicePortal/ProviderBillingDialog.tsx` („Einträge bearbeiten").

> ⚠️ **Doppelgänger:** Die Edge Function trägt eine bewusst identische Kopie der
> Formel — Deno kann `src/lib/` nicht importieren. **Wer die Formel ändert, muss
> BEIDE ändern.** Die Edge Function braucht zusätzlich ein eigenes Deploy.

**Kein Ersatzwert.** Fehlt der zur Abrechnungsart passende Satz, entsteht kein
Betrag und kein Auftrag, sondern eine Fehlermeldung. Der frühere stille
Rückfall `provider.hourly_rate || 50` in der Edge Function ist entfernt — er
war toter Code, bis Boris auf Pauschale umgestellt wurde und `hourly_rate`
dadurch NULL war.

**Anlegewege OHNE Kosten (unverändert offen):** `useBookingInquiries.ts`,
`chat-assistant` (`accept_booking_inquiry`) und `AddStandaloneCleaningDialog.tsx`
in beiden Portalen legen Reinigungen ohne `provider_id` und ohne Kosten an.
Diese erscheinen in keiner Abrechnung.

**Nicht verwechseln:** `cleaning_fee_per_stay` (80 €) ist die Gebühr, die der
**Gast** zahlt (`usePricingConfig.ts`). Mit den Dienstleisterkosten im Code
nicht verknüpft.

SQL: `supabase/SQL/50_reinigungskosten_abrechnungsart.sql`
```

---

## BLOCK 2 — Ergänzung in Abschnitt 11 („Provider")

**Einfügen direkt NACH der Zeile
`Hooks: useProviderMessages, useProviderMessageNotifications, useLaundryInvoices.`**

```markdown
### Kosten & Abrechnungsart (19.08.2026)

`ProviderManagementDialog.tsx` → Bearbeiten enthält bei Service-Typ „Reinigung"
den Block **Abrechnungsart** (Pro Stunde | Pauschale pro Reinigung), das dazu
passende Betragsfeld (netto) und den **MwSt-Satz**. Alle drei sind echte
Pflichtfelder — `handleSubmit` prüft und bricht ab. Der jeweils nicht aktive
Satz wird beim Speichern auf NULL gesetzt.

`ProviderBillingDialog.tsx` zeigt **Netto · MwSt · Brutto** mit Brutto-Summen.
Über den blauen Knopf **„Einträge bearbeiten"** werden Stunden, Netto und
MwSt-Satz je Zeile frei überschreibbar; „aus Satz" bzw. „Alle aus
Abrechnungsart füllen" übernimmt die hinterlegte Definition. Der **Bezahlstatus
lässt sich per Klick auf das Badge** umschalten (offen ↔ bezahlt, sofort
gespeichert).

> Die Query filtert hart auf `status = 'completed'` — Reinigungen in anderen
> Status erscheinen in der Abrechnung **nicht**.

**Zahlenfelder:** alle tragen `onWheel={(e) => (e.target as HTMLElement).blur()}`.
Ohne das verstellt Scrollen mit dem Zeiger über dem Feld den Wert lautlos
(aus 150,00 wurde so einmal 149,98). **Bei jedem neuen Zahlenfeld mitgeben.**

**Die Portale rechnen NICHTS.** In `amela-clean-hub-selfhosted` und
`boris-clean-hub-selfhosted` kommt `cleaning_cost` nur in `types.ts` vor. Das
dortige `hourly_rate` (`StaffForm.tsx`, `PutzkraeftePage.tsx`) ist
`cleaning_staff.hourly_rate` — der Lohn ihrer eigenen Putzkräfte, nie
multipliziert. Eine Änderung an der Kostenberechnung erfordert **keine**
Änderung in den Portalen.

Details: `docs/Kosten-Reinigung-Berechnung.md`
```
