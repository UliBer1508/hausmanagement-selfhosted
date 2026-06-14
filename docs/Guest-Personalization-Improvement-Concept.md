# Guest Personalization Improvement Concept

## Kontext
Die Edge Function `generate-personalized-email` enthält bereits einen verbindlichen
`ANGEBOTSDETAILS`-Block mit strengen Anti-Halluzinations-Regeln: die KI darf
ausschließlich die explizit übergebenen Angebotsdaten verwenden und erfindet
keine Rabatte, Gutscheine oder Telefonnummern.

Bisher hat das Frontend (`src/components/Guests/GuestPersonalization.tsx`) den
`offer`-Parameter nie mitgeschickt, sodass automatisch der Fallback "kein
konkretes Angebot" griff. Damit konnte der User keine Rabatte oder Gutscheine
kommunizieren, obwohl das Backend dies bereits unterstützt.

## Lösung
1. Neuer einklappbarer Bereich **"Konkretes Angebot (optional)"** in
   `GuestPersonalization.tsx`, basierend auf shadcn `Collapsible`.
2. Felder:
   - `discount_percent` (Number, optional)
   - `voucher` (Text, optional)
   - `validity` (Text, optional, z. B. "bis 31.03.2026")
   - `extra_note` (Textarea, optional)
3. Werte werden in einem lokalen `offer`-State gehalten und bei jedem Aufruf an
   `supabase.functions.invoke('generate-personalized-email', { body: { ..., offer } })`
   mitgesendet.
4. Leere Felder werden als `undefined` gesendet, damit der bestehende Backend-
   Fallback ("KEIN Rabatt vorgegeben → warme Wiedersehens-Nachricht") greift.

## Was NICHT geändert wird
- Die Edge Function bleibt unverändert (Anti-Halluzinations-Regeln,
  `ANGEBOTSDETAILS`-Block, Signatur-Logik).
- Der bestehende Genehmigungs-Workflow (Vorschau → genehmigen → versenden)
  bleibt unverändert.
- Keine Änderungen an `system_settings` oder Signatur-Quelle.

## Datenfluss
```
UI (Collapsible offer fields)
   → offer state
   → supabase.functions.invoke('generate-personalized-email', { body: { ..., offer } })
   → Edge Function baut ANGEBOTSDETAILS-Block ausschließlich aus übergebenen Werten
   → Gemini erzeugt subject + content (ohne Halluzinationen)
   → Vorschau / Genehmigung / Versand
```