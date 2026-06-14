# Konzept: Intentionsbasierte KI-Gästekommunikation

> Status: **Umgesetzt (Phase 1–3)** · Stand: Juni 2026 · Betrifft: `GuestPersonalization.tsx`,
> `generate-personalized-email` Edge Function
> Ziel: Von festen Nachrichtentypen zu einer KI, die **abhängig von der Absicht**
> des Vermieters passende Vorschläge generiert.
>
> **Umsetzungsstand:** Alle drei Phasen sind produktiv. Der Angebots-Block ist aktiv,
> die Intentions-/Stil-Steuerung (Freitext-Absicht, Tonalität, Länge) ist integriert,
> und die KI liefert mehrere auswählbare Varianten.

---

## 1. Ausgangslage (ursprünglicher Ist-Zustand)

Die Personalisierung war bereits sauber dreischichtig aufgebaut:

```
GuestPersonalization.tsx  →  generate-personalized-email  →  Gemini 2.5 Flash
   (UI / State)               (Edge Function / Prompt)        (structured output)
```

Bereits vorhanden und gut umgesetzt:

- **Structured Output** über `geminiStructuredOutput<{subject, content}>` – zuverlässiges
  JSON statt frei geparstem Text.
- **Anti-Halluzinations-Regeln** im System-Prompt (keine erfundenen Rabatte, Preise,
  Telefonnummern, Links).
- **Verbindlicher `ANGEBOTSDETAILS`-Block** – die Edge Function akzeptiert einen
  `offer`-Parameter (`discount_percent`, `voucher`, `validity`, `extra_note`).
- **Deterministische Signatur** aus `system_settings` (wird serverseitig angehängt,
  nicht von der KI erfunden).
- **Genehmigungs-Workflow** (Vorschau → genehmigen/ablehnen → versenden) mit
  Vier-Augen-Prinzip vor dem Versand.

### Die zentrale Lücke (inzwischen geschlossen)

> ✅ **Erledigt (Phase 1):** Die Edge Function konnte konkrete Angebote bereits
> verarbeiten, aber das Frontend sendete diese Daten nie mit. Diese Lücke ist
> geschlossen – das Frontend reicht den `offer`-Block jetzt korrekt durch.

Zudem war der Einstieg starr: Der Nutzer wählte **Segment + 1 von 6 festen Typen**,
klickte einmal und erhielt **genau einen** Textblock. Es gab keinen Weg, der KI zu sagen,
*was konkret* kommuniziert werden soll. Auch das ist mit Phase 2 und 3 gelöst.

---

## 2. Zielbild (umgesetzt)

> "Je nachdem, was ich dem Gast schreiben will, soll die KI passende Vorschläge machen."

Drei Bausteine machen aus dem Generator einen echten Assistenten:

1. **Freitext-Absicht** – ein Feld, in das der Vermieter in eigenen Worten beschreibt,
   was er erreichen will. Die KI leitet daraus Tonalität, Inhalt und Call-to-Action ab.
2. **Mehrere Varianten** – statt eines Texts erzeugt die KI 2–3 Vorschläge mit
   unterschiedlichem Charakter (z. B. *herzlich* / *kompakt* / *exklusiv*), aus denen
   der Nutzer wählt.
3. **Strukturierte Angebots-Eingabe** – die vorhandenen `offer`-Felder sind im UI
   sichtbar, sodass reale Rabatte/Gutscheine sicher (ohne Halluzination) einfließen.

---

## 3. UI-Aufbau

Linke Spalte ("Personalisierungsoptionen"):

| Element | Typ | Zweck |
|---|---|---|
| Zielgruppe | Select | Segment-Auswahl |
| **Ihre Absicht** | **Textarea** | Freitext: „Was möchten Sie dem Gast sagen?" |
| Nachrichtentyp | Select | Grundrichtung / Preset |
| **Tonalität** | **Select** | herzlich · sachlich · exklusiv · humorvoll |
| **Länge** | **Select** | kurz · mittel · ausführlich |
| **Konkretes Angebot** | **Collapsible** | Rabatt %, Gutschein, Gültigkeit, Hinweis |
| Button | – | „Vorschläge generieren" |

Rechte Spalte ("Generierte Nachricht") ist ein **Varianten-Wähler**:

- Karten/Tabs „Vorschlag 1 / 2 / 3" mit Label (Tonalität).
- Auswahl einer Variante → fließt in die bestehende Vorschau/Genehmigung.
- Bestehender Approve-/Reject-/Send-Flow läuft unverändert dahinter weiter.

### Beispiel-Absichten (Quick-Chips)

Kleine anklickbare Vorschläge über dem Freitextfeld:

- „Stammgast nach Winter wieder einladen"
- „Sich für tolle Bewertung bedanken"
- „Last-Minute-Lücke im Kalender füllen"
- „Nach langem Aufenthalt um Feedback bitten"

---

## 4. Backend (generate-personalized-email)

### 4.1 Request-Parameter

```ts
{
  messageType, selectedSegment, segmentAnalysis, sampleGuests,
  intent?: string;          // Freitext-Absicht des Vermieters
  tone?: 'herzlich' | 'sachlich' | 'exklusiv' | 'humorvoll';
  length?: 'kurz' | 'mittel' | 'ausführlich';
  variantCount?: number;    // 1–3, Default 3
  offer?: {
    discount_percent?: number;
    voucher?: string;
    validity?: string;
    extra_note?: string;
  };
}
```

### 4.2 Prompt-Logik

`createPersonalizationPrompt()` enthält einen **Intentions-Block** mit klarer Priorität:

```
ABSICHT DES VERMIETERS (höchste Priorität, leitet Ton und Inhalt):
"{intent}"

STILVORGABEN:
- Tonalität: {tone}
- Länge: {length}  (kurz ≈ 60–90 Wörter, mittel ≈ 120–160, ausführlich ≈ 200+)
```

Die **Anti-Halluzinations-Regeln bleiben übergeordnet**. Auch wenn die Absicht
„biete 20% Rabatt an" lautet, nennt die KI nur dann einen Rabatt, wenn dieser im
`offer`-Block strukturiert hinterlegt ist. Diese Trennung (Wunsch ≠ verbindliche Daten)
ist sicherheitskritisch und bewusst so umgesetzt.

### 4.3 Mehrere Varianten

Das Output-Schema liefert ein `variants[]`-Array:

```ts
{
  type: 'object',
  properties: {
    variants: {
      type: 'array',
      minItems: 1, maxItems: 3,
      items: {
        type: 'object',
        properties: {
          label:   { type: 'string' },  // z. B. "Herzlich & persönlich"
          subject: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['label', 'subject', 'content'],
      },
    },
  },
  required: ['variants'],
}
```

Die Nachbearbeitung (`replacePlaceholders`, `stripTrailingSignature`, Signatur anhängen)
läuft pro Variante. Antworten in der alten Einzel-Form werden abwärtskompatibel in ein
Array mit einer Variante umgewandelt.

---

## 5. Sicherheits- und Qualitäts-Leitplanken

- **Wunsch ≠ Daten:** Freitext-Absicht steuert Ton/Struktur, aber niemals harte Fakten
  (Preise, Rabatte, Termine). Diese kommen ausschließlich aus `offer`.
- **Genehmigung bleibt Pflicht** – der Vier-Augen-Workflow vor dem Versand ist
  unverändert aktiv.
- **DSGVO:** `guest_notes` nur als KI-Kontext, nicht zur wörtlichen Wiedergabe.
- **Rate-Limit-Handling** (`GeminiRateLimitError`) greift auch bei Varianten-Generierung –
  ein einziger Call erzeugt alle Varianten, daher kein erhöhtes Risiko.

---

## 6. Umsetzungs-Phasen (Status)

### ✅ Phase 1 – Angebots-Block aktivieren *(erledigt)*
1. `offer`-Felder im UI sichtbar gemacht **und im Request mitgesendet**.
2. Reale Rabatte/Gutscheine fließen sicher in die Nachricht.

### ✅ Phase 2 – Intentionssteuerung *(erledigt)*
1. Freitextfeld „Ihre Absicht" + Quick-Chips.
2. Tonalität + Länge als Select.
3. Prompt-Block für Absicht/Stil ergänzt (Anti-Halluzination bleibt vorrangig).

### ✅ Phase 3 – Varianten *(erledigt)*
1. Schema auf `variants[]` umgestellt (abwärtskompatibel).
2. Varianten-Wähler im UI; Auswahl speist die bestehende Vorschau/Genehmigung.

---

## 7. Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/components/Guests/GuestPersonalization.tsx` | Absicht/Tonalität/Länge/Angebot-Felder, Varianten-Wähler, erweiterter Request |
| `supabase/functions/generate-personalized-email/index.ts` | `intent`/`tone`/`length`/`offer`-Parameter, Intentions-Block, `variants[]`-Schema |
| `src/hooks/useGuests.ts` | Gästedaten (`last_house`, `guest_notes` u. a.) als Kontext |
| `docs/System-Knowledge.md` | Edge-Function-Beschreibung aktualisiert |
