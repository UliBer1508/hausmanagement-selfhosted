# Wäsche-Systeme Übersicht

## Zwei unabhängige Systeme

Die Logik-App unterstützt **zwei verschiedene Wäscherei-Systeme**, die unabhängig voneinander funktionieren:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    LOGIK APP                                         │
│                                                                                       │
│    ┌─────────────────────────────────────────────────────────────────────────┐       │
│    │                        linen_orders (Tabelle)                            │       │
│    │                                                                          │       │
│    │  provider_id  │  external_bestellnummer  │  external_synced_at           │       │
│    │  (Teuni UUID) │  (Oberpinzgau Nr.)       │  (Sync-Zeitpunkt)             │       │
│    └───────────────┴──────────────────────────┴───────────────────────────────┘       │
│                                      │                                                 │
└──────────────────────────────────────┼─────────────────────────────────────────────────┘
                                       │
               ┌───────────────────────┴───────────────────────┐
               │                                               │
               ▼                                               ▼
┌──────────────────────────────┐               ┌──────────────────────────────┐
│    TEUNI WÄSCHEPORTAL        │               │   WÄSCHE OBERPINZGAU         │
│    (Direkt-Zugriff)          │               │   (Externe Synchronisation)   │
├──────────────────────────────┤               ├──────────────────────────────┤
│ • Liest aus INTERNER DB      │               │ • Eigene EXTERNE Supabase    │
│ • Nutzt provider_id          │               │ • Projekt: pkpnowevagxmhyq   │
│ • KEIN Sync erforderlich     │               │ • Manueller Sync erforderlich│
│ • Daten immer aktuell        │               │ • Setzt external_bestellnr.  │
│                              │               │                              │
│ Provider-ID:                 │               │ Sync via:                    │
│ d8110105-8ac9-45e3-ad32-     │               │ useExternalSync.ts           │
│ aaf42393744c                 │               │                              │
└──────────────────────────────┘               └──────────────────────────────┘
```

---

## System 1: Teuni Wäscheportal

### Funktionsweise
Das Teuni Portal liest **direkt** aus der Logik-App Datenbank. Es nutzt dieselbe Supabase-Instanz und benötigt daher **keine Synchronisation**.

### Identifikation
- **Kriterium:** `provider_id = 'd8110105-8ac9-45e3-ad32-aaf42393744c'`
- Alle Bestellungen mit dieser Provider-ID gehören zu Teuni

### Datenfluss
```
Logik-App → linen_orders (provider_id gesetzt) → Teuni Portal liest direkt
```

### Relevante Dateien
| Datei | Beschreibung |
|-------|--------------|
| `src/hooks/useBookingLinenOrders.ts` | Setzt provider_id bei Bestellerstellung |
| `supabase/functions/auto-create-linen-orders/index.ts` | Setzt provider_id automatisch |
| `src/components/ServicePortal/TeuniOrdersOverview.tsx` | Zeigt alle Teuni-Bestellungen |

### Vorteile
- ✅ Immer aktuelle Daten
- ✅ Kein manueller Sync
- ✅ Einfache Architektur
- ✅ Keine Artikel-Mappings nötig

---

## System 2: Wäsche Oberpinzgau

### Funktionsweise
Das Oberpinzgau-Portal hat eine **eigene, separate Supabase-Datenbank**. Bestellungen müssen daher **manuell synchronisiert** werden.

### Identifikation
- **Kriterium:** `external_bestellnummer IS NOT NULL`
- Bestellungen mit gesetzter external_bestellnummer wurden synchronisiert

### Datenfluss
```
Logik-App → useExternalSync.ts → Externe Supabase → Oberpinzgau Portal
                ↓
        setzt external_bestellnummer + external_synced_at
```

### Externe Supabase-Verbindung
| Eigenschaft | Wert |
|-------------|------|
| Projekt-ID | `pkpnowevagxmhyqlawng` |
| Client | `src/integrations/externalLaundry/client.ts` |

### Relevante Dateien
| Datei | Beschreibung |
|-------|--------------|
| `src/hooks/useExternalSync.ts` | Sync-Logik für Oberpinzgau |
| `src/integrations/externalLaundry/client.ts` | Externe DB-Verbindung |
| `src/hooks/useExternalArticleMapping.ts` | Artikel-Mapping-Verwaltung |
| `docs/Waesche-Oberpinzgau-Sync.md` | Detaillierte Sync-Dokumentation |
| `src/components/ServicePortal/LaundryOrdersOverview.tsx` | Zeigt sync'd Bestellungen |

### Externe Tabellen
| Interne Tabelle | Externe Tabelle |
|-----------------|-----------------|
| `linen_orders` | `waeschebestellungen` |
| (items) | `bestellpositionen` |
| `houses` | `objekte` |
| - | `kunden` |
| `external_article_mapping` | `waescheartikel` |

### Voraussetzungen für Sync
- ✅ Status = "ausstehend"
- ✅ external_bestellnummer = NULL (noch nicht sync'd)
- ✅ Haus hat external_objektnummer
- ✅ Alle Artikel sind gemappt
- ✅ Externe Sync aktiviert in Einstellungen

---

## Unterscheidungsmerkmale

| Merkmal | Teuni Portal | Wäsche Oberpinzgau |
|---------|--------------|---------------------|
| **Datenzugriff** | Direkt aus interner DB | Eigene externe DB |
| **Sync nötig** | ❌ Nein | ✅ Ja, manuell |
| **Identifikation** | `provider_id` | `external_bestellnummer` |
| **Artikel-Mapping** | Nicht nötig | Erforderlich |
| **Supabase-Projekt** | `usblrulkcgucxtkhugck` (intern) | `pkpnowevagxmhyqlawng` (extern) |

---

## UI-Komponenten

### Service Portal
- **TeuniOrdersOverview.tsx**: Zeigt alle Teuni-Bestellungen (basierend auf provider_id)
- **LaundryOrdersOverview.tsx**: Zeigt nur Oberpinzgau-synchronisierte Bestellungen

### Einstellungen
- **AutoLinenOrderSettingsCard.tsx**: Enthält Abschnitt "Wäsche Oberpinzgau Sync"
- **ExternalArticleMappingDialog.tsx**: Artikel-Mapping für Oberpinzgau

---

## Häufige Fragen

### Kann eine Bestellung zu beiden Systemen gehören?
Ja! Eine Bestellung kann sowohl `provider_id` (Teuni) als auch `external_bestellnummer` (Oberpinzgau) haben. Die Systeme sind unabhängig.

### Wie erkenne ich, welches System eine Bestellung nutzt?
- Nur `provider_id` gesetzt → Teuni
- Nur `external_bestellnummer` gesetzt → Oberpinzgau (ohne Teuni)
- Beides gesetzt → Beide Systeme

### Was passiert wenn ich eine Bestellung lösche?
- **Teuni:** Sofort nicht mehr sichtbar (liest live)
- **Oberpinzgau:** Externe Kopie bleibt bestehen (wurde synchronisiert)

---

## Changelog

| Datum | Änderung |
|-------|----------|
| 2026-01 | Dokumentation erstellt, klare Trennung beider Systeme |
