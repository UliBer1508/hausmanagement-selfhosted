# Stammdaten-Import aus Wäsche Oberpinzgau (Artikel + Teuni-Sets)

## Ziel
Die zwei neuen Lese-Endpoints des Portals nutzen, um:
1. **Wäscheartikel** als Quelle für das Mapping (`external_artikelnummer`) zu laden — ersetzt die bisherige direkte Supabase-Abfrage in `ExternalArticleMappingDialog`.
2. **Teuni-Vorlagen-Sets** anzuzeigen und per Klick als `custom_categories` in `linen_set_definitions` für ein einzelnes Haus zu übernehmen.
3. Beides ist optional und kann **an/aus** geschaltet werden, da aktuell eine andere Lösung produktiv ist.

## Architektur

```text
Portal (pkpnowevagxmhyqlawng)
  ├─ GET /external-articles            ← Bearer EXTERNAL_LAUNDRY_BEARER_TOKEN
  └─ GET /external-vorlagen-sets       ← Bearer EXTERNAL_LAUNDRY_BEARER_TOKEN
            │
            ▼
  Edge Function: external-stammdaten-proxy   (neu, hält Token serverseitig)
            │
            ▼
  Hook useExternalStammdaten (artikel + sets, React Query, 5 min cache)
            │
       ┌────┴─────────────────────────┐
       ▼                              ▼
  ExternalArticleMappingDialog    TeuniSetTemplatesDialog (neu)
  (Artikel-Liste aus Proxy)       → "Set für Haus übernehmen"
                                  → schreibt custom_categories
```

## Toggle
Neues Feld in bestehender Tabelle `linen_automation_settings`:
- `teuni_stammdaten_sync_enabled boolean default false`

Steuert beide neuen Funktionen gemeinsam (Artikel-Liste + Set-Vorlagen). Wenn `false`:
- `ExternalArticleMappingDialog` fällt zurück auf den bisherigen direkten DB-Pfad (`externalLaundryClient.from('waescheartikel')`) — bestehende Lösung bleibt unangetastet.
- `TeuniSetTemplatesDialog` ist nicht erreichbar (Button ausgeblendet).

UI-Schalter in `AutoLinenOrderSettingsCard.tsx` direkt unter `external_sync_enabled` mit kurzer Erklärung.

## Änderungen im Detail

### 1. DB-Migration
- `linen_automation_settings`: Spalte `teuni_stammdaten_sync_enabled boolean default false` hinzufügen.

### 2. Neue Edge Function `external-stammdaten-proxy`
- `verify_jwt = false` (per Default-Pattern), CORS aktiv.
- Routes (per Query `?resource=articles|sets`):
  - `articles` → leitet an `…/external-articles` (mit optionalen `aktiv`, `kategorie`, `search` als Query weiter).
  - `sets` → leitet an `…/external-vorlagen-sets`.
- Setzt `Authorization: Bearer ${EXTERNAL_LAUNDRY_BEARER_TOKEN}` serverseitig (Secret existiert bereits).
- Gibt JSON 1:1 zurück. Fehler 4xx/5xx mit klarer Message + CORS.

### 3. Neuer Hook `src/hooks/useExternalStammdaten.ts`
- `useExternalArticles({aktiv, kategorie, search})` → `supabase.functions.invoke('external-stammdaten-proxy', { body:{resource:'articles', ...} })`
- `useExternalTeuniSets()` → analog für `sets`
- React Query, `staleTime: 5 min`. Beide Hooks akzeptieren `enabled` (gekoppelt an Toggle).

### 4. `ExternalArticleMappingDialog.tsx`
- Wenn `teuni_stammdaten_sync_enabled === true`: Artikel-Liste über `useExternalArticles` statt direktem `externalLaundryClient`.
- Sonst: bestehender Code unverändert (Fallback).
- Felder-Mapping unverändert (`artikelnummer`, `name`, `farbe` werden weiter in Dropdown verwendet — Endpoint liefert dieselben Felder plus `bezeichnung`, `bild_url`).

### 5. Neuer Dialog `TeuniSetTemplatesDialog.tsx` (in `src/components/Houses/`)
- Aufruf aus `LinenSetRulesTab.tsx` über neuen Button "Teuni-Set übernehmen" (nur sichtbar wenn Toggle aktiv).
- Listet alle Vorlagen aus `useExternalTeuniSets`: Name, Kategorie, Bild, Positions-Vorschau (Tabelle: artikelnummer, name, menge, berechnungsart).
- Pro Karte Button "Für dieses Haus übernehmen":
  - Mapping `positionen[*]` → `custom_categories[key]` mit:
    - `key` = slugifizierter `name` (oder `artikelnummer`)
    - `label` = `name`
    - `quantity` = `menge`
    - `calculation_type` = `'per_guest'` wenn `berechnungsart === 'pro_person'`, sonst `'per_booking'`
    - `category` = grobe Heuristik aus Vorlagen-`kategorie` (Schlafbereich/Badbereich/…)
    - `active = true`, `availability = 'year_round'`
    - `external_artikelnummer = { default: artikelnummer }`
  - Bestätigungsdialog vor Überschreiben bestehender `custom_categories`. Optionen: **Ersetzen** / **Zusammenführen** / Abbrechen.
  - Speichert über bestehenden Update-Pfad von `linen_set_definitions` für das gewählte Haus.

### 6. Settings-UI
`AutoLinenOrderSettingsCard.tsx`:
- Neuer `Switch` "Teuni-Stammdaten-Sync (Artikel & Vorlagen-Sets)" mit kurzer Beschreibung, dass Bestellabwicklung davon unabhängig bleibt.
- Speichert `teuni_stammdaten_sync_enabled`.

## Was nicht geändert wird
- Bestellabwicklung / `external_sync_enabled` / `sync-linen-order-rest` bleiben unberührt.
- Bestehende Mapping-Tabelle `external_article_mapping` bleibt gleich.
- Keine Änderung an `linen_orders`, `laundry_invoices`, AI-Funktionen.

## Verifikation nach Build
1. Toggle aus → `ExternalArticleMappingDialog` lädt Artikel weiterhin direkt (alter Pfad). Kein "Teuni-Set"-Button.
2. Toggle an → Edge Function `external-stammdaten-proxy` antwortet (Logs prüfen). Artikel-Dropdown gefüllt. Sets werden im neuen Dialog gelistet, Übernahme schreibt `custom_categories` korrekt (DB-Check via `read_query`).
3. Mobile (390 px): beide Dialoge ohne Horizontal-Scroll.
