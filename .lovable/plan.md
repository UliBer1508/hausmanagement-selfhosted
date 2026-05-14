## Ziel
Das Zahlungs-Badge "Ausstehend / Bezahlt / Teilweise" wandert vom Header neben den Betrag (💶). Damit ist sofort klar, dass es sich um den Zahlungsstatus handelt — keine Verwechslung mehr mit Wäsche oder Reinigung.

## Änderung

**Datei:** `src/components/Bookings/BookingOverviewFixed.tsx`

1. **Header (Zeile 880):** `getPaymentStatusBadge(booking.payment_status)` entfernen. Es bleibt nur noch der Buchungsstatus (z. B. "Bestätigt") neben dem Gastnamen stehen.

2. **Betragszeile (Zeile 909–916):** Badge direkt hinter den Betrag setzen:
   ```
   💶  1.280 EUR  [💤 Ausstehend]
   ```
   Das `<div className="flex items-center gap-2">` um Icon + Betrag wird um den Badge erweitert.

3. **Badge-Texte bleiben kurz** (`💰 Bezahlt`, `⚠️ Teilweise`, `💤 Ausstehend`), da der Kontext (Geldbetrag direkt davor) jetzt selbsterklärend ist.

## Optische Wirkung
- Header zeigt nur den Buchungsstatus → übersichtlicher.
- Zahlungsstatus klebt am Betrag → semantisch eindeutig zugeordnet.
- Services/Wäsche-Block unten bleibt unverändert.
