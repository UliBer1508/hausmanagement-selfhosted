# Prozess: Mieterhöhung und Mietzahlungen (Dauermiete)

> Stand 28.09.2026. Gilt nur für **festvermietete Objekte**
> (`houses.rental_type = 'long_term'`, Tab Mieter 🏘️). Ferienhäuser sind nicht
> betroffen.

## 1. Wo die Miete steht

| Was | Wo in der App | Speicherort |
|---|---|---|
| Grundwerte des Vertrags (Kaltmiete, Nebenkosten, Zahltag, Beginn, Ende) | Haus bearbeiten (`Houses/EditHouseDialog.tsx`) | `houses.tenant_info` (JSON) |
| **Mieterhöhungen / -änderungen mit Datum** | Mieter → Verträge → Knopf **„Miethistorie"** (`Tenants/RentHistoryDialog.tsx`) | `tenant_rent_changes` |
| Einzelne Monatszahlungen | Mieter → Zahlungen (`Tenants/TenantPayments.tsx`, `EditPaymentDialog.tsx`) | `tenant_payments` |

- `tenant_info.monthly_rent` und `tenant_rent_changes.new_rent` sind **Kaltmieten**.
  Die Warmmiete ist immer Kaltmiete + Nebenkosten.
- `tenant_info.contract_end` leer = **unbefristeter Vertrag**.

## 2. Mieterhöhung eintragen — nur über die Miethistorie

1. Mieter → Verträge → Karte des Objekts → **„Miethistorie"** → „Neue Änderung".
2. **Gültig ab** = Datum der Erhöhung.
3. **Neue Kaltmiete** = die komplette neue Kaltmiete, **nicht** der Erhöhungsbetrag
   (Beispiel Winthirstrasse: 3.610 €, nicht 90 €).
4. **Neue Nebenkosten** nur ausfüllen, wenn sie sich auch ändern.

**Nicht** die Kaltmiete im Haus-Dialog überschreiben: Das ändert den Grundwert
ohne Datum, dann rechnet die App auch alle früheren Monate mit der neuen Miete.

Kontrolle: Die Vertragskarte zeigt unter „Miete" die heute gültige Kalt-, Neben-
und Warmmiete inklusive Miethistorie.

## 3. Offene Zahlungen nach einer Erhöhung anpassen — von Hand

- Nur Zahlungen mit Status **Ausstehend** oder **Überfällig** und Fälligkeit **ab**
  dem Gültig-ab-Datum werden angepasst. **Bezahlte Zahlungen bleiben unverändert.**
- Bewusst **keine** Sammelanpassung (Vorgabe Uli, 28.09.2026).
- Ablauf: Zahlung → „Bearbeiten" → unter dem Betrag erscheint
  „Soll laut Mietvertrag zum TT.MM.JJJJ: … €" → **„Übernehmen"** → Speichern.
  Der Hinweis erscheint nur bei offenen Zahlungen und nur, wenn der Betrag vom
  Soll abweicht.
- „Gezahlt am" bleibt bei offenen Zahlungen leer. Wird der Status auf „Bezahlt"
  gesetzt und kein Datum eingetragen, wird das heutige Datum gespeichert.

## 4. Automatische Monatsbuchung

Edge Function `generate-tenant-payments`, Cron `daily-tenant-payment-generation`
täglich 06:00 (Migration `20251114063817_…`).

- Läuft täglich, arbeitet aber nur für Objekte, deren **Zahltag**
  (`tenant_info.payment_day`) heute ist.
- Legt eine Zahlung mit Status **Ausstehend** an, Betrag = **Soll-Warmmiete zum
  Fälligkeitsdatum inklusive Miethistorie**.
- Legt nichts an, wenn im selben Monat schon eine Zahlung existiert (egal welcher
  Status) — keine Doppelungen mit von Hand erfassten Zahlungen.
- Ändert **nie** bestehende Zahlungen.
- Vertrag ohne Ende (unbefristet) läuft weiter; ist ein Ende eingetragen, wird
  danach nichts mehr angelegt.

## 5. Behobene Fehler (28.09.2026)

| Fehler | Ursache | Behebung |
|---|---|---|
| Offene Zahlung ließ sich ohne Bezahlt-Datum nicht speichern | Dialog schickte `''` statt `null`; `payment_date` ist `DATE`, `payment_method` hat CHECK-Constraint | `EditPaymentDialog.tsx` wandelt leere Felder in `null` |
| Monatsbuchung ignorierte Mieterhöhungen und Nebenkosten | Betrag = nur `tenant_info.monthly_rent` (Kaltmiete) | Soll-Warmmiete wie in der App (`getWarmRentForDate`) |
| **Monatsbuchung legte für unbefristete Verträge nie etwas an** | Funktion (Lovable, 13./14.11.2025) verlangte `contract_end`; ohne Ende wurde still übersprungen (`incomplete_contract_data`). Beide Verträge (Winthirstrasse, Falkensee) sind unbefristet — seit Einführung wurden alle Mieten von Hand erfasst. | `contract_end` ist optional; leer = unbefristet |
| Zahlungsart im Dialog zeigte ggf. die der vorher bearbeiteten Zahlung | Select mit `defaultValue`, Dialog bleibt gemountet | kontrollierter State |

## 6. Soll-Berechnung existiert zweimal

`src/hooks/useTenantRentChanges.ts` (`getActiveRent` + `getActiveAdditionalCosts`,
führend) und `supabase/functions/generate-tenant-payments/index.ts`
(`getWarmRentForDate`, Spiegel — Deno kann `src/` nicht importieren). Wer eine
Seite ändert, zieht die andere im selben Commit nach. Siehe `CODE-INDEX.md`
Abschnitt 3.

## 7. Prüfen, ob die Automatik läuft

```sql
-- Cron-Job vorhanden und aktiv?
select jobid, jobname, schedule, active from cron.job
where jobname = 'daily-tenant-payment-generation';

-- Letzte Läufe
select start_time, status, return_message from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'daily-tenant-payment-generation')
order by start_time desc limit 5;
```

Das Ergebnis jedes Laufs (angelegt / übersprungen mit Grund) steht im Log der
Edge Function (Supabase-Dashboard → Edge Functions → `generate-tenant-payments`
→ Logs).
