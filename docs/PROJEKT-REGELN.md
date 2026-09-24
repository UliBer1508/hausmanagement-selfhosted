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

## Neue Tabellen: GRANTs sind Pflicht (ab 30.10.2026)

Supabase vergibt ab dem **30.10.2026** für neue Tabellen im Schema `public`
**keinen automatischen Data-API-Zugriff** mehr. Bestehende Tabellen behalten
ihre Rechte — die laufende App ist nicht betroffen.

**Regel:** Jede SQL-Datei (`supabase/SQL/` oder `supabase/migrations/`), die
eine Tabelle mit `CREATE TABLE public.…` anlegt, enthält **in derselben Datei**
die GRANTs:

```sql
-- anon NUR, wenn die Tabelle bewusst öffentlich lesbar sein soll
-- (Gast-, Buchungs-, Rechnungsdaten: NIEMALS anon)
grant select on public.<tabelle> to anon;

grant select, insert, update, delete on public.<tabelle> to authenticated;
grant select, insert, update, delete on public.<tabelle> to service_role;
```

- RLS (`enable row level security` + Policies) bleibt zusätzlich nötig — GRANT
  öffnet die Tür für die API, RLS regelt, wer welche Zeilen sieht.
- Fehlt ein GRANT, antwortet die API mit `permission denied` (die Meldung
  enthält das fehlende GRANT-Statement).
- Gilt auch für neue Projekte, Preview-Branches und `supabase db reset`.
  Achtung: Die älteren Skripte `01`, `31`, `35`, `51`, `52`, `56` legen
  Tabellen **ohne** vollständige GRANTs an. Bei einem Neuaufbau aus diesen
  Skripten die GRANTs nachziehen.
- Prüfen: Supabase-Dashboard → Einstellungen der Data API → freigegebene Tabellen.

## So wird es bei Claude verankert

Es genügt der Hinweis in der Aufgabe: **„nach CODING-GUIDE und CODE-INDEX
arbeiten"**. Claude liest dann beide Dateien zuerst und richtet sich danach.

---

**Ablage (Stand 13.07.2026):** Alle Dokumentation liegt in `docs/`.
Im Repo-Root bleiben nur `README.md` (Projekt-Einstieg) und `AGENTS.md`
(wird von KI-Werkzeugen dort automatisch gesucht).
