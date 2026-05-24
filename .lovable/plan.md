## Lösungskonzept: KI-Wiederbuchungs-Kampagnen im Gäste-Bereich

### Ziel
Neuer 6. Tab „🔄 Wiederbuchung" im Gäste-Management. KI bewertet jeden Gast mit einem Score (0–100), priorisiert nach Rückkehrwahrscheinlichkeit und ermöglicht KI-generierte, personalisierte Rückbuchungs-Angebote per E-Mail – unter Wiederverwendung der bereits vorhandenen Edge Functions `generate-personalized-email` und `send-gmail`.

### Scope-Regel (strikt)
Es werden **nur 2 neue Dateien erstellt** und **1 bestehende Datei minimal erweitert**. Optional eine Edge Function im Prompt-Text ergänzen. Alle anderen Gäste-Komponenten, Hooks und Funktionen bleiben unverändert.

---

### Umsetzung

**1. Neu: `src/hooks/useRebookingScore.ts`**
- Lädt alle Buchungen mit Gastdaten aus `bookings` (Join auf `houses`)
- Aggregiert pro Gast (Key = `name|email`): Anzahl Aufenthalte, Umsatz, letzter Aufenthalt, durchschnittliche Nächte, bevorzugte Saison, letztes Haus
- Berechnet `rebooking_score` (0–100) gewichtet nach:
  - Monate seit letztem Aufenthalt (Hauptfaktor: bis −55)
  - Aufenthalts-Anzahl (Loyalitäts-Bonus/Malus)
  - Umsatz-Bonus
  - Aufenthaltsdauer-Bonus
- Label: `critical` (<25) / `at_risk` (<50) / `stable` (<75) / `loyal` (≥75)
- Filtert Gäste ohne E-Mail
- Mutation `useSendRebookingOffer` → ruft `send-gmail` Edge Function auf

**2. Neu: `src/components/Guests/RebookingCampaign.tsx`**
- Header mit Refresh-Button
- 4 Stats-Cards: Kritisch, Gefährdet, Gäste gesamt, Ø Score
- Legende der 4 Score-Kategorien
- Filter-Bar (Alle / 🔴 / 🟡 / 🔵 / 🟢) mit Counts
- Liste sortiert nach niedrigstem Score zuerst (= höchste Dringlichkeit)
- Pro Zeile: Name, Nationalität, VIP-Badge, Meta (Monate her, Anzahl, Umsatz, Haus, Saison), Score-Badge + Bar, Action-Button
- Dialog „KI-Angebot": Generate-Button → ruft `generate-personalized-email` mit Gast-Daten → Subject + Content editierbar → Genehmigen-Pflicht → Senden via `send-gmail`

**3. Minimal ändern: `src/components/Guests/GuestManagement.tsx`**
- Import von `RebookingCampaign` ergänzen
- Grid von `lg:grid-cols-5` auf `lg:grid-cols-6`
- Neuer `<TabsTrigger value="rebooking">` mit 🔄 + Label
- Neuer `<TabsContent value="rebooking">` mit `<RebookingCampaign />`
- Alle 5 bestehenden Tabs bleiben unverändert

**4. Optional: `supabase/functions/generate-personalized-email/index.ts`**
- Prompt-Template um `last_house`, `months_away`, `preferred_seasons` ergänzen, falls im Request vorhanden
- Handler, CORS und Restlogik unverändert

---

### Technische Details

- **Datenquelle**: `bookings` Tabelle (kein neues Schema, keine Migration)
- **Score-Berechnung**: rein clientseitig in `useRebookingScore` – keine Persistenz nötig
- **AI**: bestehende Edge Function `generate-personalized-email` (Google Gemini 2.5 Flash) wird wiederverwendet, neue Felder im `sampleGuests[0]` Payload
- **Mail-Versand**: bestehende `send-gmail` Edge Function (Admin-Auth, System-E-Mail aus `system_settings`)
- **UI**: shadcn (Card, Dialog, Badge, Button, Textarea, Skeleton, Progress, Alert), Lucide Icons, vorhandene Toast-Hook
- **Caching**: React Query mit Key `['rebooking-guests']`, Invalidierung nach Versand

---

### Verifizierung
1. Gäste-Bereich zeigt 6 Tabs, alle 5 alten funktionieren unverändert
2. Neuer Tab listet Gäste nach Score sortiert (niedrigster zuerst)
3. Stats- und Filter-Counts korrekt
4. Dialog: Generieren → Editieren → Genehmigen → Senden funktioniert
5. E-Mail kommt beim Test-Empfänger an, Toast bestätigt Versand
