
# Bot-Filter für App Tracking Dashboard

## Ziel
Sessions von bekannten Bots und Crawlern (Chrome 119, LikeWise Crawler) standardmäßig ausblenden, um nur echte Gäste-Interaktionen anzuzeigen.

---

## Technische Umsetzung

### 1. Bot-Erkennungslogik erstellen

Neue Hilfsfunktion zur Bot-Erkennung basierend auf User-Agent Patterns:

```text
Bot-Patterns:
- "Chrome/119" → Veralteter Chrome-Bot (Desktop-Crawler)
- "LikeWise" → LikeWise Crawler
- "bot" → Generische Bot-Erkennung
- "crawler" → Generische Crawler
- "spider" → Suchmaschinen-Spider
```

### 2. SessionFilters Interface erweitern

**Datei:** `src/hooks/useGuestAppTracking.ts`

```text
SessionFilters erweitern:
- excludeBots: boolean (Standard: true)
```

### 3. Client-Side Bot-Filterung implementieren

**Datei:** `src/hooks/useGuestAppTracking.ts`

Die Filterung erfolgt client-side nach dem Datenabruf, da Supabase keine komplexen Pattern-Matching-Queries unterstützt:

```text
Ablauf in useGuestAppSessions:
1. Daten von Supabase abrufen
2. Sessions transformieren (bestehende Logik)
3. NEU: Bot-Sessions filtern wenn excludeBots = true
4. Haus-Filter anwenden
5. Ergebnis zurückgeben
```

### 4. UI-Toggle für Bot-Filter hinzufügen

**Datei:** `src/components/Guests/GuestAppTracking.tsx`

Neuer Toggle-Switch in der Filter-Leiste:
- Label: "Nur echte Nutzer"
- Tooltip: "Bots und Crawler ausblenden"
- Standard: aktiviert (Bots ausgeblendet)

### 5. Stats-Berechnung anpassen

**Datei:** `src/hooks/useGuestAppTracking.ts`

Die Statistiken müssen ebenfalls gefiltert werden, damit sie konsistent mit der Tabelle sind:
- Alle Stats-Queries laden user_agent mit
- Client-side Bot-Filter anwenden

---

## Dateiänderungen

| Datei | Änderung |
|-------|----------|
| `src/hooks/useGuestAppTracking.ts` | Bot-Erkennung, Filter-Logik, Interface-Erweiterung |
| `src/components/Guests/GuestAppTracking.tsx` | Toggle-Switch für Bot-Filter, State-Initialisierung |

---

## Benutzer-Erfahrung

**Standardverhalten:**
- Bot-Sessions werden standardmäßig ausgeblendet
- Stats zeigen nur echte Nutzer

**Mit Toggle deaktiviert:**
- Alle Sessions sichtbar (inkl. Bots)
- Nützlich für technische Analyse

---

## Erkannte Bot-Patterns

Die folgenden User-Agent-Muster werden als Bots erkannt:

| Pattern | Beschreibung |
|---------|--------------|
| `Chrome/119` | Veralteter Chrome-Bot (häufigster Bot in den Daten) |
| `LikeWise` | LikeWise Crawler |
| `bot` | Generische Bot-Erkennung |
| `crawler` | Web-Crawler |
| `spider` | Suchmaschinen-Spider |
| `HeadlessChrome` | Automatisierte Browser |

