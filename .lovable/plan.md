# Teuni-Integration im Wäsche-Regeln-Tab pro Haus

## Ziel
Im Tab **"Wäsche-Regeln"** (pro Haus) ein **Switch** "Eigene ↔ Teuni", um pro Haus die Quelle der Wäscheartikel/-sets zu wählen. Heute gibt es nur einen globalen Schalter und einen "Teuni-Set übernehmen"-Button — das wird durch eine echte Quellenwahl pro Haus ersetzt, mit zwei Sub-Tabs für Teuni-Artikel und Teuni-Sets.

## Nutzersicht
- Im Haus → Tab **Wäsche-Regeln** oben rechts: **Switch** "Eigene Artikel" ↔ "Teuni Artikel & Sets" (pro Haus gespeichert).
- **Eigene** (default): bestehende Tabelle mit Items, "Neues Item", Speichern/Zurücksetzen — unverändert.
- **Teuni**: zwei Sub-Tabs:
  1. **Artikel** — Liste aller Teuni-Artikel (Suche/Kategorie-Filter); pro Zeile Menge + Berechnungsart + "Hinzufügen" → Item wird im Haus übernommen (mit `external_artikelnummer.default`).
  2. **Sets** — Teuni-Set-Vorlagen als Cards; pro Set "Übernehmen" mit *Ersetzen* / *Zusammenführen*.
- Globaler Master-Switch (`teuni_stammdaten_sync_enabled`) bleibt: ist er aus, ist der Quelle-Switch im Haus deaktiviert mit Hinweis.

## Datenmodell
- Neue Spalte `linen_source text NOT NULL DEFAULT 'own'` in `linen_set_definitions` (`'own' | 'teuni'`).
- `custom_categories` bleibt der einzige Speicher für Items (Teuni-Items tragen zusätzlich `external_artikelnummer.default = artikelnummer`).
- Wechsel der Quelle löscht **keine** Items — beim Zurückschalten sind die ursprünglichen Items wieder sichtbar.

## Technische Umsetzung

### Migration
- `ALTER TABLE public.linen_set_definitions ADD COLUMN linen_source text NOT NULL DEFAULT 'own';`
- CHECK-Constraint: `linen_source IN ('own','teuni')`.

### `src/components/Houses/LinenSetRulesTab.tsx`
- Header: Switch (shadcn `Switch`) für `linen_source`, sofort persistiert via Mutation.
- Bei `teuniSyncEnabled === false`: Switch disabled + Tooltip + Hinweis "Teuni-Sync ist global deaktiviert".
- Conditional Rendering:
  - `linen_source === 'own'` → bestehende Tabelle.
  - `linen_source === 'teuni'` → neue Komponente `<TeuniSourcePanel house={house} />`.
- Bisheriger Header-Button "Teuni-Set übernehmen" entfällt (Funktion zieht in den Teuni-Tab).

### Neue Komponente `src/components/Houses/TeuniSourcePanel.tsx`
- shadcn `Tabs` mit "Artikel" (default) und "Sets".
- **Artikel-Tab**:
  - Lädt via `useExternalArticles()`.
  - Such-Input + Kategorie-Filter (clientseitig).
  - Tabelle: Artikelnr., Name, Kategorie, Farbe, Größe, Preis, Menge (Input), Berechnung (Select per_guest/per_booking), "Hinzufügen".
  - Hinzufügen schreibt in `custom_categories` über bestehende Mutation; Key via `generateKeyFromLabel`, Kategorie via `guessCategory`, `external_artikelnummer.default = artikelnummer`.
  - Liste bereits übernommener Teuni-Artikel (anhand `external_artikelnummer.default`) mit Entfernen-Button.
- **Sets-Tab**:
  - Lädt via `useExternalTeuniSets()`.
  - Übernimmt den Inhalt aus dem heutigen `TeuniSetTemplatesDialog` (Cards + Übernahme mit Ersetzen/Zusammenführen) als eingebettete Ansicht.
  - Wiederverwendung der Helper `setToCustomCategories` und `guessCategory` (in `TeuniSetTemplatesDialog` exportieren oder in `lib/linenMigration` verschieben).

### `TeuniSetTemplatesDialog.tsx`
- Bleibt vorerst funktionsfähig, wird aber nicht mehr aus dem Header geöffnet. Helper-Funktionen exportieren, damit `TeuniSourcePanel` sie nutzen kann.

### Hook
- `useQuery` für `linen_set_definitions` liefert `linen_source` mit (bereits via `select('*')` abgedeckt).
- Neue kleine Mutation `updateLinenSource(houseId, source)` direkt in `LinenSetRulesTab`.

### Bestell-/Folgelogik (unverändert)
- `generate-booking-linen-order`, `external-stammdaten-proxy`, `ExternalArticleMappingDialog` arbeiten weiter mit `custom_categories` + `external_artikelnummer`. Keine Edge-Function-Änderung nötig.

## Verifikation
- Migration angewendet (`linen_source = 'own'` für alle Häuser).
- Globaler Switch aus → Quelle-Switch im Haus disabled mit Hinweis.
- Globaler Switch an, Haus auf "Teuni" → Sub-Tabs laden Daten via Proxy, keine Console/Network-Fehler.
- Artikel-Tab: "Hinzufügen" schreibt korrektes Item in `custom_categories` (`read_query`-Check).
- Sets-Tab: Ersetzen / Zusammenführen funktioniert wie heute.
- Zurück auf "Eigene": ursprüngliche Items wieder sichtbar.
- Mobile (390px): keine horizontale Scrollproblematik.
