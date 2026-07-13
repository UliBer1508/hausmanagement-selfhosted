# PROJEKT-REGELN — Pflicht für KI-Agenten (bitte zuerst lesen)

> Diese Datei macht drei Dokumente **verbindlich**. Sie existiert, weil das
> Auffinden der richtigen Code-Stelle und ein einheitlicher Stil bisher gefehlt
> haben.

## Die drei Pflicht-Dokumente

1. **`docs/CODE-INDEX.md`** — Landkarte des **gesamten** Codes.
   Damit findet man in Sekunden die richtige Datei (Tab → Kette → Doppelgänger).
   **Vor jeder Code-Suche/-Änderung lesen.**

2. **`docs/CODING-GUIDE.md`** — verbindlicher Coding-Standard.
   **Teil A („Muss-Block")** ist bei **jeder** Änderung auszuführen:
   erst finden → Datenquelle prüfen → minimal ändern → Build grün → Doku & Index
   pflegen.

3. **`docs/ARBEITSWEISE-CLAUDE-LESSONS.md`** — die Fehler, die schon gemacht
   wurden. Sie wiederholen sich, wenn man sie nicht kennt (13.07.2026 ist genau
   das passiert). **Vor jeder Aussage über den Code lesen.**

> **Und nicht vergessen:** Ein Teil der Logik steckt in **DB-Triggern**, nicht im
> Code — siehe `supabase/SQL/README.md`. Wer nur TypeScript liest, sieht nur die
> halbe Wirkung.

## Verbindliche Arbeitsweise (Kurzform)

```
0. LESSONS.md     → bekannte Fehler kennen, bevor man sie wiederholt
1. CODE-INDEX.md  → richtige Datei bestimmen (nicht raten)
2. Datei lesen    → Kontext verstehen, Doppelgänger ausschließen
3. Datenquelle    → fehlt ein Feld? Erst Query/Prop prüfen, dann UI
4. Minimal ändern → nichts Fremdes umbauen, keine Doppel-Komponente
5. Build prüfen   → TypeScript/Vite ohne Fehler
6. Doku pflegen   → CODE-INDEX.md + ggf. docs/ im selben Schritt
7. Changelog      → was/welche Dateien/warum/welche Felder
```

## So wird es bei Claude verankert

Es genügt der Hinweis in der Aufgabe: **„nach CODING-GUIDE und CODE-INDEX
arbeiten"**. Claude liest dann beide Dateien zuerst und richtet sich danach.

---

**Ablage (Stand 13.07.2026):** Alle Dokumentation liegt in `docs/`.
Im Repo-Root bleiben nur `README.md` (Projekt-Einstieg) und `AGENTS.md`
(wird von KI-Werkzeugen dort automatisch gesucht).
