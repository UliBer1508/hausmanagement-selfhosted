# Fix: KI-Wiederbuchungs-Email

## Problem (aus Screenshot sichtbar)
Im Dialog erscheint roher Text wie:
```
```json
{
  "subject": "Ein besonderer Gruß für Sie, {GUEST_NAME}: ...",
```
Statt sauberem Betreff + Nachricht. Ursachen:

1. **Gemini gibt JSON in Markdown-Fences zurück** (` ```json … ``` `). Die Regex in `generate-personalized-email/index.ts` greift, aber `JSON.parse` scheitert oft an unescapten Zeilenumbrüchen/Quotes im `content`-Feld → Fallback packt den kompletten Roh-Text inkl. ```json in `content`.
2. **Platzhalter wie `{GUEST_NAME}`, `{HOUSE_NAME}` werden nie ersetzt** → würden so im Versand landen.
3. **`content` ist Plaintext, wird aber als `html` an send-gmail übergeben** → keine Zeilenumbrüche in der Mail.

## Lösung

### 1. `supabase/functions/generate-personalized-email/index.ts` — strukturierte Ausgabe
Statt freiem Text + JSON-Parsing das bereits vorhandene `geminiStructuredOutput` (Function-Calling) nutzen. Damit liefert Gemini garantiert sauber typisierte Felder, keine Markdown-Fences, kein Parse-Risiko.

```ts
const result = await geminiStructuredOutput<{subject: string; content: string}>(
  geminiApiKey, systemPrompt, prompt,
  {
    name: 'create_email',
    description: 'Erstellt personalisierte E-Mail',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'E-Mail-Betreff, max 80 Zeichen' },
        content: { type: 'string', description: 'E-Mail-Text in Klartext, mit \\n für Absätze' },
      },
      required: ['subject', 'content'],
    },
  }
);
```
System-Prompt anpassen: keine JSON-Anweisung mehr, dafür „Verwende ausschließlich konkrete Werte – keine Platzhalter in geschweiften Klammern".

### 2. `src/components/Guests/RebookingCampaign.tsx` — Platzhalter ersetzen + HTML aufbereiten
Im `handleGenerate` nach Empfang:
- Restplatzhalter ersetzen: `{GUEST_NAME}` → `guest.guest_name`, `{HOUSE_NAME}` → `guest.last_house ?? ''` (Subject + Content).
- Defensive Markdown-Stripping (falls Modell trotzdem ```json liefert): erst `code-fence`-Blöcke entfernen, dann versuchen `JSON.parse`, sonst Text wie er ist.

Im `handleSend` vor Aufruf von `useSendRebookingOffer`:
- Plain-Text → HTML konvertieren: Escaping + `\n\n` → `</p><p>` + `\n` → `<br/>`, in `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">…</div>`.

### 3. `src/hooks/useRebookingScore.ts` — beides senden
Mutation-Body um `text` ergänzen (Plain-Text-Fallback für Clients, die HTML blockieren). Signatur erweitern: `aiHtml`, `aiText`.

### 4. Versand-Voraussetzung
`send-gmail` erfordert eingeloggten Admin (`requireAdmin`) und das Secret `GMAIL_APP_PASSWORD`. Nichts zu ändern, nur sicherstellen — wird im Test geprüft.

## Geänderte Dateien
- `supabase/functions/generate-personalized-email/index.ts` (umstellen auf structured output, Prompt-Refinement)
- `src/components/Guests/RebookingCampaign.tsx` (Platzhalter-Replace, Plain→HTML, robuster Parse-Fallback)
- `src/hooks/useRebookingScore.ts` (html + text im Body)

## Validierung
1. Im Tab „🔄 Wiederbuchung" einen Gast wählen → „KI-Angebot erstellen" → „Generieren".
2. Erwartung: Betreff & Nachricht sauber, **keine** `{GUEST_NAME}`/`{HOUSE_NAME}`-Platzhalter, **kein** ```json -Block.
3. Genehmigen → „Angebot senden" → Erfolgs-Toast; Edge-Function-Logs prüfen.