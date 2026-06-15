# PROJEKT-REGELN — Pflicht für Lovable & Claude (bitte zuerst lesen)

> Diese Datei macht zwei Dokumente **verbindlich**. Sie existiert, weil das
> Auffinden der richtigen Code-Stelle und ein einheitlicher Stil bisher gefehlt
> haben.

## Die zwei Pflicht-Dokumente

1. **`docs/CODE-INDEX.md`** — Landkarte des **gesamten** Codes.
   Damit findet man in Sekunden die richtige Datei (Tab → Kette → Doppelgänger).
   **Vor jeder Code-Suche/-Änderung lesen.**

2. **`docs/CODING-GUIDE.md`** — verbindlicher Coding-Standard.
   **Teil A („Muss-Block")** ist bei **jeder** Änderung auszuführen:
   erst finden → Datenquelle prüfen → minimal ändern → Build grün → Doku & Index
   pflegen.

## Verbindliche Arbeitsweise (Kurzform)

```
1. CODE-INDEX.md  → richtige Datei bestimmen (nicht raten)
2. Datei lesen    → Kontext verstehen, Doppelgänger ausschließen
3. Datenquelle    → fehlt ein Feld? Erst Query/Prop prüfen, dann UI
4. Minimal ändern → nichts Fremdes umbauen, keine Doppel-Komponente
5. Build prüfen   → TypeScript/Vite ohne Fehler
6. Doku pflegen   → CODE-INDEX.md + ggf. docs/ im selben Schritt
7. Changelog      → was/welche Dateien/warum/welche Felder
```

## So wird es in Lovable verankert (einmalig einrichten)

In Lovable unter **Project Knowledge / Instructions** als feste Regel eintragen:

> „Vor jeder Code-Änderung zwingend `docs/CODE-INDEX.md` zum Auffinden der
> Stelle und `docs/CODING-GUIDE.md` (Teil A, Muss-Block) befolgen. Keine
> Parallel-Komponenten für bestehenden Zweck. Bei fehlenden Feldern zuerst die
> Supabase-Query/Props prüfen. Build muss grün sein. CODE-INDEX.md und
> betroffene Doku im selben Schritt aktualisieren. UI deutsch, Code englisch,
> Importe über `@/`-Alias, Daten über React Query, keine Secrets im Frontend."

## So wird es bei Claude verankert

Es genügt der Hinweis in der Aufgabe: **„nach CODING-GUIDE und CODE-INDEX
arbeiten"**. Claude liest dann beide Dateien zuerst und richtet sich danach.

---

Ablageempfehlung: diese Datei als `docs/PROJEKT-REGELN.md`, die beiden
Pflichtdokumente als `docs/CODE-INDEX.md` und `docs/CODING-GUIDE.md`. Zusätzlich
in der Haupt-`README.md` oben einen Satz mit Link auf diese drei Dateien.
