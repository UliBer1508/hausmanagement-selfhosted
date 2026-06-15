# Lovable verankern — fertige Texte zum Einfügen

So sorgst du dafür, dass Lovable sich an Code-Index und Coding-Guide hält.
Lovable liest bei **jeder** Nachricht automatisch: Project Knowledge, Workspace
Knowledge, den Projekt-Code und `AGENTS.md` im Repo-Root. Diese vier Texte
nutzen genau diese Hebel.

Wichtig: Die Knowledge-Felder lesen **Text**, nicht automatisch deine
`docs/*.md`. Daher verweisen die Texte ausdrücklich auf die Dateien **und**
wiederholen die wichtigsten Regeln kurz. Limit je Feld: 10.000 Zeichen.

---

## 1) WORKSPACE KNOWLEDGE  (Settings → Knowledge)
Gilt für ALLE deine Projekte (auch PV/Heizung). Hier die projektübergreifenden
Coding-Standards.

```
Coding-Standards (verbindlich für alle Projekte)

Vor jeder Änderung
- Erst die richtige Datei finden, nicht raten. Bei diesem Projekt: docs/CODE-INDEX.md nutzen.
- Zieldatei ganz lesen, bevor du etwas änderst.
- Fehlt ein Feld in der UI: zuerst die Datenquelle (Query/Props) prüfen, dann die Anzeige.

Arbeitsweise
- Minimal-invasiv: nur ändern, was die Aufgabe verlangt. Kein ungefragtes Umbauen/Reformatieren.
- Keine zweite, fast gleiche Komponente bauen, wenn eine bestehende erweitert werden kann.
- Geteilte Logik in hooks/ (Daten/State) oder lib/ (reine Helfer), nicht kopieren.

Stil
- UI-Texte Deutsch, Code-Bezeichner Englisch, Kommentare knapp.
- Importe immer über @/-Alias, keine ../../../-Pfade.
- Funktionale Komponenten, export default (Repo-Standard).
- any vermeiden; optionale verknüpfte Daten mit obj?.feld absichern.

Daten
- Lesen/Schreiben über React Query (useQuery/useMutation), kein ad-hoc useEffect-Fetch.
- Query-Keys als sprechende kebab-case-Arrays; nach Mutationen invalidieren.
- Supabase-Client aus @/integrations/supabase/client. types.ts NIE von Hand editieren.
- Im select nur nötige, aber ALLE von der UI angezeigten Felder laden.

Styling
- Tailwind + shadcn/ui. Klassen mit cn() aus @/lib/utils. components/ui/* nur nutzen, nicht umbauen.

Feedback/Sicherheit
- Nutzer-Feedback über useToast (Deutsch; Fehler: variant destructive). Technik in console.error('[Kontext]', e).
- Keine Secrets im Frontend. Beträge serverseitig als Quelle der Wahrheit.

Abschluss jeder Änderung
- Build muss fehlerfrei sein (TypeScript/Vite).
- Betroffene Doku (v. a. docs/CODE-INDEX.md) im selben Schritt aktualisieren.
- Kurz-Changelog: was / welche Dateien / warum / welche Felder.

Nicht tun
- Englische UI-Texte. Tiefe relative Importe. Doppel-Komponenten. Großflächiges Reformatieren fremder Zeilen.
```

---

## 2) PROJECT KNOWLEDGE  (Project settings → Knowledge)
Nur für die Hausverwaltung. Projektspezifischer Kontext + Verweis auf den Index.

```
Projekt: Steinbock Chalets – Ferienhaus-/Hausverwaltung (React, Vite, TS, Tailwind, shadcn/ui, Supabase, React Query).

Pflichtlektüre vor jeder Code-Änderung
- docs/CODE-INDEX.md: Landkarte des gesamten Codes (Tab -> Kette -> Doppelgänger). Damit die richtige Datei finden.
- docs/CODING-GUIDE.md: verbindlicher Standard, Teil A (Muss-Block) bei jeder Änderung ausführen.

Architektur-Kernfakt
- KEIN Seiten-Routing. Alles hängt an Tabs in src/pages/OriginalDashboard.tsx (switch(activeTab)).
- Frage immer "welcher Tab?", nicht "welche Route?".

Tab -> Einstiegskomponente
- Übersicht -> Dashboard/OverviewTab | Kalender -> Dashboard/CalendarTab
- Buchungen -> Bookings/BookingOverviewFixed | Gäste -> Guests/GuestManagement
- Mieter -> Tenants/TenantManagement | Häuser -> Houses/HouseManagement
- Reinigung -> Cleaning/CleaningManagement | Provider -> Dashboard/ProviderTab
- Wäsche -> Houses/LinenDashboard | Preise -> Dashboard/PricingTab | Einstellungen -> Dashboard/SettingsTab

Achtung Doppelgänger (häufige Fehlerquelle)
- "Reinigungskarte" 3x: Cleaning/CleaningManagement (breit, inline) | Bookings/ServiceTaskCard (schmal) | Operations/CleaningsCard (Übersichtskachel).
- "Wäschekarte": Bookings/LaundryOrderCard (DIE Karte) + Wrapper LaundryOrderCardWithStatus; Operations/LinenDeliveriesCard ist nur Übersichtskachel.
- Bookings/ConnectedBookingView hat EIGENE Queries (Felder dort separat laden).

Daten-Regel
- Fehlendes Feld in einer Karte = meist Query-Problem. Erst .select prüfen, dann UI.

Domänenbegriffe
- service_tasks = Reinigungs-/Serviceaufträge; linen_orders = Wäschebestellungen (Lieferschein).
- guests-Relation mit Fallback auf Legacy-Felder via lib/guestHelpers (getGuestName etc.).
```

---

## 3) AGENTS.md  (in den Repo-Root legen — wird IMMER gelesen, auch in langen Sessions)
Das ist der robusteste Anker. Datei `AGENTS.md` im obersten Ordner des Repos.

```
# AGENTS.md — Arbeitsanweisung für KI-Agenten (Lovable, Claude)

Vor JEDER Code-Änderung:
1. docs/CODE-INDEX.md lesen und die richtige Datei bestimmen (Tab -> Kette -> Doppelgänger). Nicht raten.
2. docs/CODING-GUIDE.md, Teil A (Muss-Block), befolgen.
3. Fehlt ein Feld in der UI: zuerst Supabase-Query/Props prüfen, dann die Anzeige.

Kernregeln:
- Minimal ändern; keine Doppel-Komponente, wenn eine bestehende erweitert werden kann.
- UI Deutsch, Code Englisch; Importe über @/-Alias; React Query für Daten; cn() für Klassen.
- Keine Secrets im Frontend; integrations/supabase/types.ts nie von Hand ändern.
- Build muss fehlerfrei sein. docs/CODE-INDEX.md im selben Schritt pflegen.
- Kurz-Changelog ausgeben: was / welche Dateien / warum / welche Felder.

Architektur-Kernfakt: kein Seiten-Routing; alles hängt an Tabs in
src/pages/OriginalDashboard.tsx. Details in docs/CODE-INDEX.md.
```

---

## So gehst du vor (Reihenfolge)

1. **CODE-INDEX.md, CODING-GUIDE.md** in den Ordner `docs/` deines Repos legen
   (sind die ausführlichen Nachschlagewerke).
2. **AGENTS.md** (Text oben) in den **Repo-Root** legen.
3. **Workspace Knowledge** mit Text 1 füllen.
4. **Project Knowledge** mit Text 2 füllen.
5. Test: Lovable eine kleine Aufgabe geben, z. B. „Wo wird die Wäschekarte
   gerendert? Erst Stelle nennen, dann erst ändern." — Wenn es zuerst die
   richtige Datei nennt, greift die Verankerung.

## Warum das diesmal wirkt (anders als bisher)
- Bisher war die Regel nur in einer Chat-Nachricht -> nach ein paar Schritten
  vergessen. Jetzt steht sie an drei Stellen, die Lovable bei JEDER Nachricht
  liest (Workspace + Project Knowledge) bzw. immer (AGENTS.md).
- Knowledge-Felder können in sehr langen Sessions schwächeln — AGENTS.md fängt
  das ab, weil es laut Lovable-Doku unabhängig von der Session-Länge gelesen wird.

## Realistische Erwartung
Auch mit Verankerung hält sich keine KI zu 100 %. Aber die Trefferquote steigt
deutlich. Wenn Lovable doch abweicht: kurz „nach AGENTS.md / CODE-INDEX
arbeiten" in den Prompt schreiben — das holt die Regel sofort in den Fokus.
```
