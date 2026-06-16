# Karten-Namenskonvention (verbindlich)

> **Zweck:** Eindeutige Benennung der drei Karten-Typen (Buchung, Reinigung,
> Wäsche) über ihre zwei Erscheinungsorte (Dashboard-Übersicht und Detail-Tab),
> damit es kein Verwechseln mehr gibt. Pflichtlektüre zusammen mit
> `CODE-INDEX.md` Abschnitt 3 und `ARBEITSWEISE-CLAUDE-LESSONS.md`.
>
> Erstellt: 16.06.2026

---

## 1. Grundprinzip: eine Datei pro Typ, gesteuert über `variant`

Jeder Karten-Typ ist **genau eine** React-Komponente. Wie die Karte aussieht,
steuert ein Prop:

```
variant="overview"  → kompakter Status-Blick (Dashboard-Übersicht, Tab 📊)
variant="full"      → vollständige Detailansicht (jeweiliger Detail-Tab)
```

Es gibt damit **keine** zweite Karten-Datei für denselben Zweck mehr
(kein Doppelgänger). Der Variant-Wert ist Teil des eindeutigen Namens.

---

## 2. Die drei Karten-Komponenten

| Karten-Typ | Datei |
|---|---|
| Buchungskarte | `src/components/Bookings/BookingCard.tsx` |
| Reinigungskarte | `src/components/Bookings/ServiceTaskCard.tsx` |
| Wäschekarte | `src/components/Bookings/LaundryOrderCard.tsx` |

> Die Wäschekarte wird über den Wrapper
> `Bookings/LaundryOrderCardWithStatus.tsx` gerendert (zieht den externen
> Portalstatus und reicht alle Props inkl. `variant` durch).

---

## 3. Die sechs eindeutigen Namen

| Eindeutiger Name | Datei + Variant | Ort |
|---|---|---|
| **Übersicht-Buchungskarte** | `BookingCard.tsx` · `variant="overview"` | Dashboard-Übersicht (📊) |
| **Buchung-Tabkarte** | `BookingCard.tsx` · `variant="full"` | Tab „Buchungen" |
| **Übersicht-Reinigungskarte** | `ServiceTaskCard.tsx` · `variant="overview"` | Dashboard-Übersicht (📊) |
| **Reinigung-Tabkarte** | `ServiceTaskCard.tsx` · `variant="full"` | Tab „Reinigung" |
| **Übersicht-Wäschekarte** | `LaundryOrderCard.tsx` · `variant="overview"` | Dashboard-Übersicht (📊) |
| **Wäsche-Tabkarte** | `LaundryOrderCard.tsx` · `variant="full"` | Tab „Wäsche" |

### Namens-Logik
- **Erstes Wort = Ort:** „Übersicht-…" oder „…-Tabkarte".
- **Mittelteil = Typ:** Buchung / Reinigung / Wäsche.
- **Dahinter immer:** dieselbe Datei pro Typ, gesteuert über `variant`.

---

## 4. Was die Varianten unterscheiden (Zielbild)

| Aspekt | `variant="overview"` | `variant="full"` |
|---|---|---|
| Zweck | „Auf einen Blick": ist alles da, welcher Status? | Detailarbeit am Datensatz |
| Umfang | wenige Schlüsselfelder | alle Felder + Aktionen |
| Aktions-Buttons | ausgeblendet | sichtbar (Edit/Delete/Confirm/Sync) |
| Aufklappbare Detaillisten | aus/kompakt | vollständig |

> Die genaue Feldauswahl je Variante wird pro Karten-Typ in der jeweiligen
> Umsetzung festgelegt und hier nachgetragen.

**Wäschekarte:** `variant="full"` zeigt zusätzlich Check-in und Check-out
neben dem Gastnamen. Das Status-Badge nutzt in beiden Varianten
`getLinenStatusBadge()` aus `@/lib/linenOrderHelpers` (statt hartkodierter
grüner Farbe) — offen orange, ausstehend gelb, geliefert grün, storniert rot.

---

## 5. Migrationsstand (ehrlich dokumentiert)

Stand 16.06.2026 ist die `variant`-Lösung **noch nicht überall** umgesetzt:

| Karten-Typ | Status |
|---|---|
| Wäschekarte | **umgestellt ✅** (`variant="overview"` / `variant="full"`) |
| Buchungskarte | noch getrennt: Übersicht über `BookingCard.tsx`, Tab über `BookingOverviewFixed.tsx`. `variant`-Zusammenführung später. |
| Reinigungskarte | noch getrennt: Übersicht über `ServiceTaskCard.tsx`, Tab über inline-Karte in `Cleaning/CleaningManagement.tsx`. `variant`-Zusammenführung später. |

> Bis Buchung und Reinigung zusammengeführt sind, zeigen deren Namen
> ausnahmsweise noch auf unterschiedliche Dateien. Dieser Abschnitt wird
> aktualisiert, sobald ein Typ umgestellt ist.

---

## 6. Pflege

- Neue Karte / neuer Ort → hier und in `CODE-INDEX.md` Abschnitt 3 eintragen.
- Sobald ein Typ auf `variant` umgestellt ist: Abschnitt 5 aktualisieren und den
  alten Doppelgänger-Eintrag in `CODE-INDEX.md` als aufgelöst markieren.
