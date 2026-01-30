
# Migration zu kostenloser Google Gemini API

## Zusammenfassung

Umstellung aller Edge Functions von Lovable AI Gateway auf die kostenlose Google Gemini API, um wiederkehrende Kosten zu eliminieren.

---

## Betroffene Edge Functions

| Function | Lovable AI | Migration erforderlich |
|----------|-----------|------------------------|
| `chat-assistant` | Ja | Ja (komplexeste) |
| `analyze-vacancy` | Ja | Ja |
| `generate-personalized-email` | Ja | Ja |
| `generate-guest-profile` | Nein | Nein |
| `optimize-linen-inventory` | Nein | Nein |

---

## Google Gemini Free Tier Limits

| Modell | Anfragen/Minute | Anfragen/Tag | Tokens/Minute |
|--------|-----------------|--------------|---------------|
| Gemini 1.5 Flash | 15 | 1.500 | 1.000.000 |
| Gemini 2.0 Flash | 10 | 1.000 | 500.000 |
| Gemini 1.5 Pro | 2 | 50 | 32.000 |

**Empfehlung:** Gemini 1.5 Flash (beste Balance aus Speed und Limits)

---

## Voraussetzung: API-Key erstellen

1. Gehe zu [Google AI Studio](https://aistudio.google.com/apikey)
2. Klicke auf "Create API Key"
3. Kopiere den API-Key
4. Speichere ihn als Supabase Secret `GEMINI_API_KEY`

---

## Technische Anderungen

### 1. API-Endpoint andern

**Alt (Lovable AI):**
```text
https://ai.gateway.lovable.dev/v1/chat/completions
```

**Neu (Google Gemini):**
```text
https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
```

### 2. Request-Format andern

**Alt (OpenAI-kompatibel):**
```text
{
  "model": "google/gemini-2.5-flash",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "tools": [...],
  "tool_choice": "auto"
}
```

**Neu (Google Gemini nativ):**
```text
{
  "contents": [
    {"role": "user", "parts": [{"text": "..."}]}
  ],
  "systemInstruction": {"parts": [{"text": "..."}]},
  "tools": [{"functionDeclarations": [...]}],
  "toolConfig": {"functionCallingConfig": {"mode": "AUTO"}}
}
```

### 3. Response-Format andern

**Alt (OpenAI):**
```text
data.choices[0].message.content
data.choices[0].message.tool_calls[0].function
```

**Neu (Google):**
```text
data.candidates[0].content.parts[0].text
data.candidates[0].content.parts[0].functionCall
```

---

## Implementierungsplan

### Schritt 1: Gemini API-Key als Secret hinzufugen
- Neues Secret `GEMINI_API_KEY` in Supabase erstellen

### Schritt 2: Helper-Modul erstellen
Erstelle `supabase/functions/_shared/gemini.ts`:
- Konvertierung von OpenAI zu Gemini Format
- Tool-Call-Handling
- Error-Handling fur Rate Limits

### Schritt 3: generate-personalized-email migrieren (einfachste)
- Einfache Chat-Completion ohne Tools
- Guter Testfall fur die Migration

### Schritt 4: analyze-vacancy migrieren
- Enthalt Tool-Calling (structured output)
- Mittlere Komplexitat

### Schritt 5: chat-assistant migrieren (komplexeste)
- Multi-Turn Tool-Calling Loop
- 15+ Tools
- Erfordert sorgfaltige Anpassung

### Schritt 6: LOVABLE_API_KEY entfernen (optional)
- Nach erfolgreicher Migration nicht mehr benotigt

---

## Dateiänderungen

| Datei | Aktion |
|-------|--------|
| `supabase/functions/_shared/gemini.ts` | NEU: Helper-Modul |
| `supabase/functions/generate-personalized-email/index.ts` | BEARBEITEN |
| `supabase/functions/analyze-vacancy/index.ts` | BEARBEITEN |
| `supabase/functions/chat-assistant/index.ts` | BEARBEITEN |

---

## Risiken und Fallbacks

| Risiko | Losung |
|--------|--------|
| Rate Limit (15/min) | Request-Queuing implementieren |
| Tool-Calling Unterschiede | Format-Konverter im Helper-Modul |
| Modell-Qualitat | Bei Bedarf auf Gemini 1.5 Pro wechseln |

---

## Vorteile nach Migration

- Keine monatlichen Kosten fur AI-Nutzung
- Direkter Zugang zu neuesten Gemini-Modellen
- Keine Abhangigkeit von Lovable AI Gateway
- 1.500 kostenlose Anfragen pro Tag
