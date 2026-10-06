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
| 5 | System | Teuni wird automatisch informiert: Info-Pop-up im Portal (schließbar) + dieselbe Info als Nachricht im Chat + Mengenabgleich auf ihrer Buchungskarte (seit 06.10.2026, SQL 65) |

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
| `bookings.number_of_guests` | aktuelle Zahl |
| `bookings.delta_guests` | **kumulierter** Unterschied zur ursprünglichen Buchung (plus oder minus). Ursprünglich gebucht = `number_of_guests − delta_guests`. Gepflegt **nur** vom DB-Trigger `trg_fortschreiben_delta_guests` (SQL 54) — nie vom Anwendungscode |
| `bookings.guests_changed_at` | Zeitpunkt der Änderung |
| `bookings.guest_surcharge_amount` | Summe der erhobenen Zusatzkosten, `0` wenn bewusst keine erhoben wurden |
| `booking_charges` | die einzelnen Posten, `origin = 'auto_delta'`, Status `open` |
| `max_actions` | Vorgang „Wäsche angepasst" — reine Information, wird **gleich abgeschlossen** angelegt (seit 28.09.2026) |
| `booking_change_notifications` | ein Eintrag je Änderung (DB-Trigger `notify_booking_guest_count_change`), trägt das Info-Pop-up im Teuni-Portal; `acknowledged_at`/`acknowledged_by` = Teuni hat es geschlossen; `chat_message_id` = zugehörige Chat-Nachricht (SQL 65) |

> **Geändert am 11.09.2026 (SQL 54):** Bis dahin hieß das Feld `booked_guests`
> und hielt die eingefrorene Ursprungszahl. Seitdem heißt es `delta_guests` und
> hält den Zuwachs. `calculate-booking-delta` rechnet mit diesem Zuwachs
> (`Number(delta_guests) || 0`) — also immer gegen die ursprüngliche Buchung,
> nie gegen einen Zwischenstand.

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
entsteht ein `max_actions`-Eintrag „Wäsche angepasst" — seit 28.09.2026
**sofort mit Status `abgeschlossen`**, mit Gastname.

### Wie Teuni informiert wird (Schritt 5)

> **Regel „Information an Dienstleister" (Uli-Entscheidung 06.10.2026):**
> a) **Nur Info** → Pop-up im Portal, schließbar, ohne Pflicht-Klick, **und**
> dieselbe Info als Nachricht im Chat, damit Uli und der Dienstleister sie
> nachlesen können. b) **Bestätigung nötig** → läuft über den Chat
> (Terminfrage mit Bezug). Was der Dienstleister ohnehin in seiner Liste
> sieht (neue Bestellung, anstehende Lieferung), bekommt ein Info-Pop-up
> (schließbar, ohne Bestätigung), aber **keine** zusätzliche Chat-Nachricht.
> Die Gästezahl-Änderung ist Fall a).

Teuni wird **automatisch** informiert; weder Uli noch Max schreiben selbst:

1. **Info-Pop-up im Portal.** Der DB-Trigger
   `notify_booking_guest_count_change` legt bei jeder Änderung von
   `number_of_guests` einen Eintrag in `booking_change_notifications` an —
   seit 06.10.2026 nur, wenn Teuni die Bestellung **sieht**: Status
   `ausstehend`, `pending`, `delivered` oder `geliefert` (vorher `offen`,
   `ausstehend`, `pending`, `bestätigt`). `offen` fällt heraus, weil Teuni
   diese Bestellung noch nicht sieht und sie bei der Freigabe schon die
   richtige Menge hat; `delivered` kommt hinzu, weil nach der Lieferung ggf.
   nachgeliefert werden muss. Das Pop-up ist schließbar („OK"); mehrere
   Änderungen derselben Buchung erscheinen als **ein** Hinweis (erster alter
   → letzter neuer Wert). Bis 06.10.2026 war es ein Pflichtdialog
   („Verstanden – Bestätigen"). Beleg Tal Yehuda: alle 7 Änderungen vom
   01.–11.09.2026 quittiert.
2. **Nachricht im Chat** (seit 06.10.2026, SQL 65). Derselbe Trigger schreibt
   eine Nachricht als „Max (Assistent)" in `provider_messages`, mit Bezug
   `related_linen_order_id`. Beispiel: „Hallo Teuni, Info von Max: Die
   Gästezahl für Tal Yehuda im Venediger Chalet (Anreise 01.10.2026) hat sich
   von 6 auf 7 geändert. Bitte berücksichtige das bei der Lieferung. Keine
   Antwort nötig." Ändert sich die Zahl derselben Buchung innerhalb von
   30 Minuten erneut, wird diese Nachricht aktualisiert statt einer neuen.
   Kein `max_actions`-Vorgang, keine Frist. Uli sieht die Nachricht unter
   Messaging → Teuni.
3. **Dauerhaft auf der Buchungskarte.** Das Teuni-Portal zeigt denselben
   Mengenabgleich wie die Wäschekarte der Hausverwaltung, z. B. „Wäsche von
   6 auf 7 Gäste angepasst" oder gelb „nicht angepasst: …".

Der Max-Vorgang wartet deshalb nicht auf Teuni (Entscheidung 28.09.2026). Bis 28.09.2026 stand er auf
`waiting_for = 'teuni'` — und nichts schloss ihn je, weil der einzige
Schließ-Trigger nur auf `offen → ausstehend` reagiert. Altfälle schließt
`supabase/SQL/59_waesche_vorgaenge_abschliessen.sql`.

Auch über Max (Chat, `update_linen_for_booking`) gilt dasselbe: Vorgang
abgeschlossen, keine zusätzliche Nachricht an Teuni — nur wenn Uli es
ausdrücklich verlangt. Der Chat-Weg schreibt seit 28.09.2026 auch
`total_cost` mit (vorher nur `items`/`total_items`).

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
| `max_ablaeufe`, Aktion `update_linen_for_booking` | derselbe Vorgang, ausgelöst per Chatbefehl an Max (Schritt 4 seit SQL 59: `system`, automatische Information) |
| `supabase/functions/chat-assistant/index.ts` (`executeUpdateLinenForBooking`) | Chat-Weg zu Schritt 4 |
| DB-Trigger `notify_booking_guest_count_change` → `booking_change_notifications` + `provider_messages` | Schritt 5, Info-Pop-up und Chat-Nachricht. Aktuelle Fassung: `supabase/SQL/65_gaestezahl_info_im_chat.sql` |
| Teuni-Portal `src/components/BookingChangeNotificationDialog.tsx` + `src/hooks/useBookingChangeNotifications.ts` | Schritt 5, Info-Pop-up (schließbar, je Buchung zusammengefasst) |
| Teuni-Portal `src/components/BookingCard.tsx` + `src/lib/linenMengen.ts` | Schritt 5, Mengenabgleich auf der Buchungskarte (Kopie der Rechnung aus `LaundryOrderCard.tsx`) |
| `supabase/SQL/59_waesche_vorgaenge_abschliessen.sql` | Schließ-Trigger kennt `auto_linen_created`; Ablauf-Schritt 4; Altfälle schließen |
