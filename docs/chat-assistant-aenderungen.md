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
