# Buchungsübersicht: Kosten-Kacheln & Haus-Umschalter

> Datei: `src/components/Bookings/BookingOverviewFixed.tsx`
> Stand: 16.06.2026. Beschreibt die vier Statistik-Kacheln und den
> Haus-Umschalter für die Wirtschaftlichkeit pro Haus.

---

## 1. Zwei getrennte Haus-Filter — nicht verwechseln

| State | Steuert | Ort im UI |
|---|---|---|
| `cardHouseFilter` | die vier **Kacheln** (Buchungen, Reinigung, Wäsche, Umsatz) | Buttons oben in der Kopfzeile (Gesamt / Venediger / Wald) |
| `houseFilter` | die **Buchungsliste** (Such-/Filterbereich) | Dropdown im Bereich „Filter & Suche" |

**Wichtig:** Beide sind UNABHÄNGIG. Der Kachel-Umschalter (`cardHouseFilter`) ändert
NICHT die Buchungsliste; der Listen-Filter (`houseFilter`) ändert NICHT die Kacheln.
Wer hier etwas ändert, darf die beiden NICHT wieder zusammenlegen.

---

## 2. Die vier Kacheln — Datenquellen

| Kachel | Quelle | Pro Haus über | Bezahlt/Offen? |
|---|---|---|---|
| Buchungen | `yearFilteredBookings` | `bookings.house_id` | Bestätigt/Abgeschlossen |
| Reinigungskosten | `cleaningCostsForYear` (`service_tasks.cleaning_cost`) | `service_tasks.house_id` | ja (`payment_status`) |
| Wäschekosten (geschätzt) | `laundryCostsForYear` (`linen_orders.total_cost`) | `linen_orders.house_id` | NEIN (Schätzung hat keinen Zahlstatus) |
| Gesamtumsatz | `yearStats` (`bookings.booking_amount`) | `bookings.house_id` | ja (`payment_status`) |

Alle vier `useMemo`-Blöcke filtern auf `cardHouseFilter` (nicht `houseFilter`) und
haben `cardHouseFilter` + `selectedYear` im Dependency-Array.

---

## 3. Wichtige Designentscheidung: Wäschekosten = GESCHÄTZT

Die Wäschekosten-Kachel zeigt hier die **geschätzten** Kosten aus
`linen_orders.total_cost` (Titel „Wäschekosten (geschätzt)", Hinweis „geschätzt aus
Stückpreisen"). Grund: Die echten Teuni-Rechnungen (`laundry_invoices`) haben KEIN
`house_id` und sind daher NICHT pro Haus aufteilbar.

> Das bedeutet: Diese Kachel zeigt eine ANDERE Zahl als eine reine
> Teuni-Rechnungssumme. Das ist gewollt. Wer das ändert, muss das Pro-Haus-Problem
> der Teuni-Rechnungen lösen (siehe Kostenwahrheit-Konzept, Schritt 3/4).

Jahresbezug der Wäschekosten: über `delivery_date` (nicht `created_at`).

---

## 4. Mobile

Die drei Umschalt-Buttons stehen in der Kopfzeile (`flex-col sm:flex-row`), die
Button-Gruppe nutzt `flex-wrap` und `w-full sm:w-auto`, damit sie auf dem Handy
sauber umbricht. Bei Änderungen an der Kopfzeile dieses Verhalten erhalten
(siehe CODING-GUIDE B4, Mobile-First).

---

## 5. Nur touristische Häuser

Die Haus-Liste (für Buttons und Dropdown) kommt aus einer Query, die auf
`rental_type = 'tourist'` beschränkt ist (Venediger Chalet, Wald Chalet). Langzeit-
objekte (Berlin Falkensee, Winthirstrasse) erscheinen NICHT.
