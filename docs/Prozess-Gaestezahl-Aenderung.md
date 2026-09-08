# Prozess: Änderung der Gästezahl einer Buchung

> Festgelegt am 08.09.2026. Ergänzt die Zeile in
> `Steinbock-Chalets-Gesamtdokumentation-MASTER.md`, Abschnitt 3, die den
> Vorgang bis dahin nur andeutete („Wäschemenge muss angepasst werden"),
> ohne Reihenfolge, Beträge oder Verantwortlichkeit zu nennen.
>
> Anlass: Buchung Tal Yehuda (Venediger, 01.–08.10.2026). Die Erhöhung von
> sechs auf sieben Gäste erzeugte 259,70 EUR Forderungen statt 39,60 EUR,
> keine Bettwäscheposition, und die Wäschebestellung blieb auf sechs Gästen.

---

## 1. Der Ablauf — verbindliche Reihenfolge

Die Reihenfolge ist Teil der Anforderung, nicht eine Umsetzungsfrage. Die
Wäschebestellung wird **zuletzt** angepasst, damit sie nicht schon geändert
ist, während die Zusatzkosten noch offen sind.

| Schritt | Wer | Was |
|---|---|---|
| 1 | Uli | Gästezahl in der Buchung ändern und speichern |
| 2 | System | Zusatzkosten berechnen: Bettwäsche + Ortstaxe für die zusätzlichen Personen |
| 3 | Uli | Beträge prüfen, ggf. korrigieren, Forderungen anlegen und Zahlungslink erstellen |
| 4 | System | Wäschebestellung auf die neue Gästezahl anpassen |
| 5 | Uli | Teuni über die geänderte Menge informieren |

Schritt 4 läuft auch dann, wenn in Schritt 3 **keine** Zusatzkosten erhoben
werden. Die Wäsche ist eine physische Größe: der siebte Gast braucht ein Bett
bezogen, unabhängig davon, ob er dafür zahlt.

Schritt 4 läuft ebenso bei einer **Reduzierung**. Beim Geld gilt das nicht —
man erstattet einem Gast nichts zurück —, bei der Wäsche schon: sonst wird zu
viel geliefert und von Teuni berechnet.

---

## 2. Was berechnet wird

### Bettwäsche

Der Gast zahlt **den anteiligen Satz aus der Buchung**, nicht unsere Kosten
bei Teuni. Beides sind verschiedene Geldgrößen und dürfen nicht vermischt
werden (siehe MASTER, „Wäschekosten: Schätzung vs. echte Rechnung").

Venediger: 120,00 EUR Wäschekosten sind für eine Standardbelegung von sechs
Personen in den Buchungspreis eingerechnet.

    120 / 6 = 20,00 EUR je Person
    Ein Gast mehr  ->  20,00 EUR
    Sieben Gäste gesamt  ->  140,00 EUR, davon 120,00 bereits im Buchungspreis

Hinterlegt wird das als `houses.additional_fees.linen_fee`:

```json
{ "mode": "per_person", "amount": 20 }
```

**Nicht** als `flat`. Eine Pauschale ändert sich bei einer Person mehr
definitionsgemäß nicht, und `calculate-booking-delta` erzeugt dann keine
Position — genau das war der Grund, warum bei Tal Yehuda die Bettwäsche
fehlte.

Der Zusammenhang zwischen beiden Schreibweisen ist keine Umrechnung von Hand:
`usePricingConfig.flattenFeesV2()` schreibt bei jedem Speichern zusätzlich
`linen_fee_per_stay = amount × pricing_config.standard_guests` in dieselbe
Spalte. Bei `standard_guests = 6` ergibt `per_person 20` wieder genau die
120, mit denen `analyze-vacancy`, `GuestAnalytics` und die Preisfindung
rechnen. **Wird `standard_guests` geändert, verschiebt sich der
Aufenthaltsbetrag still** — beide Werte gehören zusammen geprüft.

Teunis Preis (Paket MW4, 9,50 je Gast) hat mit dieser Position nichts zu tun.
Er bestimmt `linen_orders.total_cost`, also unsere Kosten, nicht die
Forderung an den Gast.

### Ortstaxe

Je zusätzlicher Person und Nacht:

    Personen × Nächte × tourist_tax.amount
    1 × 7 × 2,80 = 19,60 EUR

Hinterlegt als `houses.additional_fees.tourist_tax` mit `mode: per_person`.

### Beispiel Tal Yehuda, sechs auf sieben Gäste

| Position | Rechnung | Betrag |
|---|---|---|
| Bettwäsche | 1 × 20,00 | 20,00 EUR |
| Ortstaxe | 1 × 7 Nächte × 2,80 | 19,60 EUR |
| **Summe** | | **39,60 EUR** |

`booking_amount` bleibt unverändert. Die Forderung läuft getrennt über
`booking_charges` und wird per Stripe-Link eingezogen.

---

## 3. Was das System dabei festhält

| Feld | Bedeutung |
|---|---|
| `bookings.booked_guests` | ursprünglich gebuchte Zahl, wird **einmal** eingefroren und danach nie überschrieben |
| `bookings.number_of_guests` | aktuelle Zahl |
| `bookings.guests_changed_at` | Zeitpunkt der Änderung |
| `bookings.guest_surcharge_amount` | Summe der erhobenen Zusatzkosten, `0` wenn bewusst keine erhoben wurden |
| `booking_charges` | die einzelnen Posten, `origin = 'auto_delta'`, Status `open` |
| `max_actions` | Vorgang „Wäsche angepasst — Teuni informieren" |

Das Delta rechnet **immer** gegen `booked_guests`, nie gegen einen
Zwischenstand. Fehlt der Wert, darf **kein** Delta entstehen — eine fehlende
Ausgangszahl ist etwas anderes als eine Ausgangszahl von null.

Auch der Fall „keine Zusatzkosten" wird festgehalten: `guests_changed_at` und
`guest_surcharge_amount = 0`. Eine Erhöhung ohne Spur in den Daten ist später
nicht mehr nachvollziehbar.

---

## 4. Wäschebestellung anpassen (Schritt 4)

Mengen und Betrag kommen aus `generate-booking-linen-order` — derselbe Weg,
den das Max-Tool `update_linen_for_booking` geht. Es gibt genau einen
Rechenweg.

Ersetzt werden `items`, `total_items` **und `total_cost`**. Die Menge zu
ändern und den Betrag stehen zu lassen, erzeugt Bestellungen wie
`a538893c` (Maximilian Herr, 02.01.2026): 104 Teile zum Preis von 38.

Der **Status bleibt unverändert**. Steht die Bestellung auf `ausstehend`,
liegt sie bereits bei Teuni; ein Rücksetzen auf `offen` würde den
Freigabe-Trigger auslösen und einen zweiten Vorgang eröffnen. Stattdessen
entsteht ein `max_actions`-Eintrag mit `waiting_for = 'teuni'`.

Beispiel Tal Yehuda:

| | 6 Gäste | 7 Gäste |
|---|---|---|
| Paket MW4 (`bettwaesche`) | 6 × 9,50 = 57,00 | 7 × 9,50 = 66,50 |
| Badvorleger, WB-, Geschirrtücher (per_booking) | 10,80 | 10,80 |
| **`total_cost`** | **67,80** | **77,30** |

---

## 5. Was NICHT passiert

- **Die Reinigung bleibt unverändert.** Ein Gast mehr ändert weder Termin
  noch Umfang.
- **`booking_amount` wird nicht angefasst.** Zusatzforderungen laufen
  getrennt, sonst zählt der Betrag doppelt.
- **Bei Reduzierung wird nichts erstattet.** Nur die Wäschemenge folgt.

---

## 6. Bekannte Schwachstellen (Stand 08.09.2026)

Offen, mit dem Fall Tal Yehuda belegt:

- **`calculate-booking-delta` behandelt eine fehlende Ausgangszahl als
  null Personen.** `Number(null)` ergibt 0, und 0 ist ein gültiger Zahlenwert
  — der eingebaute Schutz greift nur bei `undefined`. Folge: das Delta ist
  die volle Gästezahl. Zwei Läufe (01.09. und 06.09.2026) rechneten so je
  7 statt 1 zusätzliche Person, 49 statt 7 Ortstaxe-Einheiten.
- **Keine Prüfung auf Wiederholung.** Derselbe Vorgang zweimal ausgeführt
  legt zweimal Forderungen an. Bei Tal Yehuda: 122,50 EUR (01.09., Satz 2,50)
  und 137,20 EUR (06.09., Satz 2,80) für dieselbe eine Zusatzperson.
- **Stripe-Beträge sind eingefroren.** Hängt eine falsche Forderung bereits
  in einem erstellten Zahlungslink, muss dieser bei Stripe storniert und neu
  erstellt werden. Ein Stornieren in der Anwendung erreicht ihn nicht.

---

## 7. Beteiligte Stellen im Code

| Datei | Rolle |
|---|---|
| `src/components/Bookings/CreateBookingForm.tsx` | Schritt 1, Rückfrage, Vorschau, ruft Schritt 4 |
| `supabase/functions/calculate-booking-delta/index.ts` | Schritt 2, `persist: false` rechnet, `persist: true` schreibt |
| `src/components/Bookings/BookingChargesPanel.tsx` | Anzeige, Zahlungslink, Stornieren/Löschen |
| `supabase/functions/create-payment-link/index.ts` | gebündelter Link über alle offenen Forderungen |
| `supabase/functions/generate-booking-linen-order/index.ts` | Mengen und Betrag für Schritt 4 |
| `src/components/Houses/AdditionalFeesTab.tsx` | Pflege von `linen_fee` und `tourist_tax` |
| `max_ablaeufe`, Aktion `update_linen_for_booking` | derselbe Vorgang, ausgelöst per Chatbefehl an Max |
