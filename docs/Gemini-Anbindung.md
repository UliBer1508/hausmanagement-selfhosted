# Gemini-Anbindung — Abrechnung, Fehlercodes, Modellwechsel

> **Stand:** 04.10.2026 · **Code:** `supabase/functions/_shared/gemini.ts`
> **Anlass:** Ausfall von Max vom 01. bis 04.10.2026 („Gemini API error: 402")

---

## 1. Wer Gemini benutzt

| Edge Function | Wofür | Aufruf |
|---|---|---|
| `chat-assistant` | Max (Chat, Werkzeuge) | `generateContent` |
| `analyze-vacancy` | Lückenanalyse / Preisempfehlung | `geminiStructuredOutput` |
| `generate-personalized-email` | Rückgewinnungs-Mails | `geminiStructuredOutput` |

**Regel:** Es gibt genau einen Aufrufpfad — `generateContent` in
`_shared/gemini.ts`. Kein eigener `fetch()` an Google in einer Edge Function.
Bis 04.10.2026 hatte `chat-assistant` einen solchen Direktaufruf; dort fehlte die
Erkennung von HTTP 402, deshalb kam die rohe Meldung beim Nutzer an.

Supabase-Secrets:

| Secret | Pflicht | Inhalt |
|---|---|---|
| `GOOGLE_GEMINI_API_KEY` | ja | API-Schlüssel aus Google AI Studio |
| `GEMINI_MODEL` | nein | Modellname, z. B. `gemini-2.5-flash` (Standard, wenn leer) |

Modellwechsel ohne Code-Änderung:
`supabase secrets set GEMINI_MODEL=<modell> --project-ref usblrulkcgucxtkhugck`
Ein Neu-Deploy ist dafür nicht nötig. Ein falscher Name führt zu der Meldung
„Das Gemini-Modell … ist nicht verfügbar“ — dann Secret löschen oder korrigieren.

---

## 2. Abrechnung (wo das Geld liegt)

- **Google-Konto:** steinbockchalets@gmail.com (Profil „Max Steinbock“)
- **Rechnungskonto:** 01E039-3293D6-AD429B
- **Topf für Gemini:** Cloud Console → Abrechnung → *Zahlungsoption* → rechte
  Spalte **„Vorauszahlung – AI Studio“**. Nur dieses Guthaben bezahlt Gemini.
  Die linke Spalte („Nachträgliche Zahlung – Google Cloud-Dienste“) hat mit Max
  nichts zu tun.
- **Automatisches Aufladen:** seit 04.10.2026 **aktiv**. Vorher deaktiviert —
  deshalb blieb Max ohne Vorwarnung stehen.
- **Verbrauch:** rund 10 € im Monat (Prognose Oktober 2026: 10,38 €).
  Guthaben verfällt 12 Monate nach dem Kauf.

**Verwechslungsgefahr:** Ein zweites Google-Konto hat ebenfalls ein
„Mein Rechnungskonto“ (01AB10-997CB9-480758, Projekt „Gemini Project for
activites“). Darüber läuft Max **nicht** — das Projekt hatte keinen einzigen
Gemini-Aufruf. Wer dort nachsieht, findet 0 € und zieht falsche Schlüsse.

---

## 3. Fehlercodes und was der Nutzer sieht

`generateContent` wirft immer einen `GeminiAPIError` (oder eine Unterklasse) mit
einer Meldung, die man so anzeigen kann. `chat-assistant` gibt sie mit dem
passenden HTTP-Status und einem Feld `reason` an das Frontend weiter.

| Google meldet | Klasse | `reason` | Wiederholung | Meldung (gekürzt) |
|---|---|---|---|---|
| **402** (seit Sept. 2026) | `GeminiQuotaExhaustedError` | `quota_exhausted` | nein | „Gemini-Guthaben ist aufgebraucht … aufladen" |
| 429 mit „prepayment / credits are depleted / billing" (alte Form) | `GeminiQuotaExhaustedError` | `quota_exhausted` | nein | wie oben |
| 429 sonst (echtes Rate-Limit) | `GeminiRateLimitError` | `rate_limit` | ja, bis 2× | „stark ausgelastet … in einer Minute" |
| 400 „API key" | `GeminiAPIError` | `gemini_error` | nein | „API-Schlüssel ungültig … Secret prüfen" |
| 403 | `GeminiAPIError` | `gemini_error` | nein | „Zugriff verweigert" |
| 404 | `GeminiAPIError` | `gemini_error` | nein | „Modell nicht verfügbar … GEMINI_MODEL prüfen" |
| 500 / 503 / 504 | `GeminiAPIError` | `gemini_error` | ja, bis 2× | „Gemini ist gerade gestört" |
| Netzwerkfehler | `GeminiAPIError` (503) | `gemini_error` | ja, bis 2× | „Keine Verbindung" |
| keine Antwort in 45 s | `GeminiAPIError` (504) | `gemini_error` | nein | „nicht innerhalb von 45 Sekunden" |

Wichtig für die Einordnung: Auch ein gewöhnliches Rate-Limit kommt als 429 mit
dem Status `RESOURCE_EXHAUSTED` und dem Text „exceeded your current quota". Diese
Wörter bedeuten also **nicht** „Guthaben leer". Die alte Erkennung im
`chat-assistant` hat sie so gewertet und dadurch jedes Rate-Limit als
Guthabenproblem gemeldet, ohne es zu wiederholen.

Wartezeit zwischen Versuchen: 1 s, dann 2 s. Verlangt Google per `retryDelay`
länger als 10 s, wird nicht gewartet, sondern sofort gemeldet. Den Rohtext von
Google schreibt `gemini.ts` ins Edge-Function-Log (`[gemini] Fehler`).

---

## 4. Wenn Max wieder „Guthaben aufgebraucht" meldet

1. In Google AI Studio bzw. der Cloud Console mit **steinbockchalets@gmail.com**
   anmelden (Profilbild oben rechts prüfen).
2. Abrechnung → Zahlungsoption → **Vorauszahlung – AI Studio**: Guthaben ansehen.
3. „Guthaben erwerben", danach prüfen, ob „Automatisches Aufladen: aktiviert" steht.
4. Nach wenigen Minuten antwortet Max wieder; kein Deploy nötig.

Hinweis: Die Vorauszahlungs-Ansicht zeigt in der Cloud Console manchmal
„403 – kein Zugriff" (Fehler bei Google, im Google-Forum vielfach gemeldet).
Dann neu laden oder direkt `aistudio.google.com/billing` öffnen.

---

## 5. Prüfung der Änderung vom 04.10.2026

- `deno check` für `_shared/gemini.ts`: 0 Fehler.
- `deno check` für `chat-assistant`, `analyze-vacancy`,
  `generate-personalized-email`, jeweils alte gegen neue Fassung: **keine neuen
  Typfehler**. (`chat-assistant` hat 13 ältere Typfehler, die schon vorher
  bestanden; Supabase prüft beim Deploy keine Typen.)
- 12 Verhaltenstests mit simulierten Google-Antworten (402, altes 429,
  Rate-Limit mit Wiederholung, lange Wartezeit, 503, Netzwerkfehler, Timeout,
  ungültiges JSON, 400/404, Modellwahl, kaputte Tool-Antwort): alle bestanden.
- Nicht automatisch prüfbar: das Verhalten gegen den echten Google-Dienst. Das
  zeigt sich nach dem Deploy beim ersten Chat mit Max.

## 6. Offen

- `maxOutputTokens` steht bei Max auf 2048. Ob Gemini 2.5 Flash dabei
  „Denk-Token" mitzählt und lange Antworten abschneidet, ist nicht geprüft.
  Erst ändern, wenn abgeschnittene Antworten tatsächlich auffallen.
- Eine Warnung in der Morgen-Übersicht bei knappem Guthaben wäre möglich, setzt
  aber Lesezugriff auf die Google-Abrechnung voraus; mit automatischem Aufladen
  derzeit nicht nötig.
