# Änderungen in `supabase/functions/chat-assistant/index.ts`

Zwei Änderungen. Beide sind klein und exakt. Datei im GitHub-Editor öffnen,
die "SUCHEN"-Blöcke finden und durch die "ERSETZEN"-Blöcke tauschen.

---

## Änderung A — Reschedule-Button im Chat anzeigen

**Zweck:** Nach einer Terminänderung erscheint im Chat ein anklickbarer Button,
der direkt die Reinigungskarte (Edit-Dialog) öffnet. Damit siehst du die
Änderung sofort und kannst den Status auf „Geplant" setzen.

**Diese Änderung hat ZWEI Teile (A1 + A2).** Beide sind nötig — sonst erscheint
der Button nur manchmal. Grund: Die Terminänderung läuft über deterministische
Pfade (A und B), die ihre Antwort direkt zurückgeben und den Entity-Mechanismus
NICHT automatisch anwenden. Wir müssen ihn dort explizit anhängen.

---

### Teil A1 — Button-Definition in `buildEntityLinks`

**Wo:** In der Funktion `buildEntityLinks`, direkt **nach** dem Block für die
Begrüßungs-E-Mail (`draft_guest_welcome_email`) und **vor** der Zeile
`const data = result.data;`.

#### SUCHEN:

```typescript
        } as any);
      continue;
    }

    const data = result.data;
    if (!data) continue;
```

#### ERSETZEN durch:

```typescript
        } as any);
      continue;
    }

    // Reinigungstermin verschoben: Button, der die Reinigungskarte (Edit-Dialog) öffnet.
    // Der Handler liefert task_id + gast direkt (nicht unter result.data).
    if (tr.tool === 'reschedule_cleaning' && result.task_id) {
      links.push({
        id: String(result.task_id),
        type: 'cleaning_task',
        label: `Reinigung für ${result.gast || 'Gast'} öffnen (${result.neues_datum || ''})`.trim(),
      });
      continue;
    }

    const data = result.data;
    if (!data) continue;
```

---

### Teil A2 — Entity-Links in den Reschedule-Pfaden anhängen

Ohne diesen Teil greift A1 bei „ändere Reinigung von Niels auf 17.7." NICHT,
weil Pfad A und B ihre Antwort direkt zurückgeben.

#### Pfad A (direkter Befehl MIT Datum) — SUCHEN:

```typescript
      }
      return new Response(JSON.stringify({ response: text, toolResults }), jsonHeaders);
    }

    // B) Bestätigung OHNE Datum ("verschieben" / "ja verschieben"): Amelas jüngsten Vorschlag anwenden
```

#### ERSETZEN durch:

```typescript
      }
      const entityLinksA = buildEntityLinks(toolResults);
      const responseA = entityLinksA.length > 0
        ? `${text}\n___ENTITIES___\n${JSON.stringify(entityLinksA)}`
        : text;
      return new Response(JSON.stringify({ response: responseA, toolResults }), jsonHeaders);
    }

    // B) Bestätigung OHNE Datum ("verschieben" / "ja verschieben"): Amelas jüngsten Vorschlag anwenden
```

#### Pfad B (Bestätigung OHNE Datum) — SUCHEN:
(Dies ist das `return` am Ende von Pfad B, direkt vor `// C) Nachfrage`.)

```typescript
      }
      return new Response(JSON.stringify({ response: text, toolResults }), jsonHeaders);
    }

    // C) Nachfrage "was möchte Amela ändern?": offene Vorschläge auflisten
```

#### ERSETZEN durch:

```typescript
      }
      const entityLinksB = buildEntityLinks(toolResults);
      const responseB = entityLinksB.length > 0
        ? `${text}\n___ENTITIES___\n${JSON.stringify(entityLinksB)}`
        : text;
      return new Response(JSON.stringify({ response: responseB, toolResults }), jsonHeaders);
    }

    // C) Nachfrage "was möchte Amela ändern?": offene Vorschläge auflisten
```

---

## Änderung B — verfrühte Amela-Bestätigung entfernen

**Zweck:** Amela darf die Bestätigung erst bekommen, NACHDEM du den Status auf
„Geplant" gesetzt hast (das übernimmt jetzt der DB-Trigger). Heute sendet
Pfad B die Bestätigung schon SOFORT beim Ändern — das muss raus.

**Wo:** Im deterministischen Pfad B („Bestätigung OHNE Datum" / Amelas jüngsten
Vorschlag anwenden). Dort steht ein Block, der direkt nach dem Reschedule
`executeSendProviderMessage(...)` aufruft.

### SUCHEN:

```typescript
        if (rr.success) {
          // Amela bestätigen (direkt senden)
          await executeSendProviderMessage({
            provider_name: p.provider_name,
            message: `Hallo ${p.provider_name}, ich bin Max, der KI-Assistent von Uli. Der Reinigungstermin für ${p.guest} wurde auf ${p.new_date_de} geändert. Danke für den Hinweis!`,
            ist_terminfrage: true,
            related_task_id: p.task_id,
          });
          await logMaxAction({
```

### ERSETZEN durch:

```typescript
        if (rr.success) {
          // HINWEIS: Amela wird NICHT mehr sofort bestätigt.
          // Die Bestätigung übernimmt der DB-Trigger, NACHDEM Uli den Status
          // in der Reinigungskarte auf "Geplant" (scheduled) gesetzt hat.
          await logMaxAction({
```

### Und den Antworttext im selben Block anpassen — SUCHEN:

```typescript
          text = `✅ Auftrag ausgeführt: Reinigung für ${p.guest} von ${p.old_date_de} auf ${p.new_date_de} verschoben (als Entwurf). ${p.provider_name} wurde informiert. Bitte in der Reinigungs-Verwaltung auf „geplant" setzen.`;
```

### ERSETZEN durch:

```typescript
          text = `✅ Reinigung für ${p.guest} von ${p.old_date_de} auf ${p.new_date_de} geändert (Entwurf). Öffne die Reinigungskarte, prüfe das Datum und setze den Status auf „Geplant" — erst dann wird ${p.provider_name} automatisch informiert.`;
```

---

## Änderung C — Begrüßungs-E-Mail: Gast wird nicht mehr „verschluckt" (17.07.2026)

### Das Problem (gemeldet von Uli)

Der Befehl *„bereite die Begrüßungs-E-Mail für Hubert Middelbos **vor**"* antwortete
mit **„Keine passende Buchung gefunden"** — obwohl der Gast existiert (Status
`confirmed`). Derselbe Befehl für „Niels" hatte immer funktioniert.

### Die Ursache (am Code bewiesen, nicht geraten)

Der E-Mail-Befehl läuft über den **deterministischen Pfad** (`serve()`, ganz vorn),
NICHT über Gemini. Dieser Pfad extrahierte den Gastnamen per Regex
(`extractGuestNameFromCommand`) und übergab ihn an die Suche. Der alte Extraktor
nahm bis zu vier Wörter nach „für" **wörtlich**:

| Satz | extrahiert (alt) | ilike-Suche | Treffer |
|---|---|---|---|
| „…für Niels" | `Niels` | `%niels%` | ✅ |
| „…für Hubert Middelbos **vor**" | `hubert middelbos vor` | `%hubert middelbos vor%` | ❌ 0 |

Das „vor" aus „vor**bereiten**" wurde als dritter Namensteil mitgeschluckt.
Verifiziert: `%hubert middelbos%` (ohne „vor") findet den Gast in der DB sofort.
Es lag also **allein am Extraktor** — nicht an der Buchungssuche und nicht an der
(separat fehlenden) E-Mail-Adresse.

### Die saubere Trennung (Ulis Prinzip)

Ulis Einwand traf den Kern: Es sind **zwei verschiedene Momente**, die der Code
vermischt hatte:

1. **„Wer ist gemeint?"** — unscharfe Sprache mit Füllwörtern. Muss robust den
   Namen erkennen (Aufgabe der Interpretation).
2. **„Mach die E-Mail."** — Gast steht fest, nichts mehr zu raten. Deterministisch,
   zuverlässig (Tool + Button).

Der Fehler war, dass der deterministische Weg schon Moment 1 per starrem Regex
erledigte — und dafür zu dumm ist.

### Die Lösung (drei Stellen in `chat-assistant/index.ts`)

1. **`extractGuestNameFromCommand` bereinigt jetzt** — dieselbe Stoppwort-Logik wie
   `extractGuestNameFromReschedule` (Füllwörter/Verben nur am Anfang UND Ende
   abschneiden, Mitte bleibt → „Van Der Horst" bleibt intakt). „vor", „bitte",
   „mal", „vorbereiten" usw. fliegen raus.
2. **`executeDraftGuestWelcomeEmail` unterscheidet jetzt drei Fälle** statt nur
   „gefunden / nicht gefunden":
   - **0 Treffer** → `not_found` + klare Nachfrage nach der Schreibweise.
   - **mehrere verschiedene Gäste** → `multiple` + `auswahl`-Liste (Name, Haus,
     Anreise, ob E-Mail vorhanden) — **raten verboten** (Soll-Definition
     `create_cleaning_for_booking`, Schritt 3: „mehrere Treffer → zur Auswahl").
   - **ein Gast** → wie bisher (bevorzugt kommende Buchung mit E-Mail).
3. **Der deterministische E-Mail-Block zeigt diese Fälle Uli sauber an** — bei
   mehreren Treffern die Liste zum Nachschärfen, sonst den handlungsleitenden Text
   der Funktion (inkl. „keine E-Mail-Adresse → telefonische Erinnerung genügt").

### Verifikation

- Extraktor-Test 6/6 bestanden (inkl. „Hubert Middelbos vor" → `hubert middelbos`
  und „Christiaan Van Der Horst" → unverändert).
- TypeScript-Syntaxcheck der geänderten Abschnitte: fehlerfrei.
- **Offen bis zum Live-Test:** „deployt ≠ geprüft". Nach Deploy im echten Chat
  prüfen: (a) Hubert wird gefunden und liefert die „keine E-Mail"-Meldung,
  (b) ein mehrdeutiger Name legt die Auswahl vor.

### Warum NICHT der deterministische Pfad gelöscht wurde

Der deterministische Pfad ist für die **Aktion** (E-Mail vorbereiten → Tool +
Button garantiert) bewusst richtig — „zuverlässig statt Zufall". Nur die
**Namenserkennung** war an der falschen Stelle. Behoben wurde also die Extraktion,
nicht der Pfad. Die Aktion bleibt deterministisch, die Namens-Robustheit steigt.
