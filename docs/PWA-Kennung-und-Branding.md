# PWA-Kennung & Branding — die drei Portale unterscheidbar machen

> Stand: 26.06.2026 · verifiziert am echten Repo-Stand (`main`)
> Betroffene Repos:
> - `UliBer1508/hausmanagement-selfhosted` (Hausverwaltung)
> - `UliBer1508/amela-clean-hub-selfhosted` (Reinigung / Amela)
> - `UliBer1508/fresh-spin-portal` (Wäsche / Teuni)
>
> Diese Datei ist die maßgebliche Beschreibung der **App-Identität** (Name,
> Kachelname, Theme-Farbe) der drei installierbaren PWAs.

---

## 1. Das Problem

Alle drei Apps stammen aus derselben Lovable-Vorlage und trugen ähnliche Namen
(„Steinbock …" / „… portal"). Auf dem Homescreen / im Dock erschienen dadurch
mehrere kaum unterscheidbare Kacheln — beim täglichen Wechsel zwischen den Apps
war nicht mehr klar, welche PWA gerade geöffnet/installiert ist.

**Ziel:** Jede App soll an **Name**, **Kachelname** und **Farbe** sofort
erkennbar sein — und der Lovable-Ursprung soll aus den sichtbaren Namen
verschwinden (einheitliches Schema `Steinbockchalets-…`).

---

## 2. Festgelegtes Schema (verbindlich)

| App | Voller Name (`name`) | Kachel (`short_name` / iOS-Titel) | Theme-Farbe |
|---|---|---|---|
| **Hausverwaltung** | `Steinbockchalets-Hausverwaltung` | `Hausverwaltung` | **Orange** `#c2410c` |
| **Reinigung** (Amela) | `Steinbockchalets-Reinigungsportal` | `Reinigung` | **Blau** `#1e3a8a` |
| **Wäsche** (Teuni) | `Steinbockchalets-Wäscheportal` | `Wäsche` | **Grün** `#10b981` |

### Warum kurzer Kachelname?
Der Homescreen zeigt den **`short_name`** und schneidet ihn nach ca. 12 Zeichen
ab. Ein langer Name wie „Steinbockchalets-Hausverwaltung" würde als
„Steinbockch…" erscheinen — bei allen drei gleich, also wieder verwechselbar.
Deshalb: voller Name überall dort, wo Platz ist; **kurzes, eindeutiges Wort**
(Hausverwaltung / Reinigung / Wäsche) auf der Kachel.

### Wo die Theme-Farbe wirkt
Die `theme_color` färbt die **PWA-Hülle** (Titel-/Statusleiste, Splash beim
Öffnen) — nicht das App-Innere. Beispiel Hausverwaltung: Titelleiste jetzt
orange, die UI innen bleibt grün. Das reicht zur Unterscheidung und ist der
risikoarme Weg (kein Eingriff ins Design-System).

---

## 3. Was wo geändert wurde — dateigenau

### 3.1 Hausverwaltung (`hausmanagement-selfhosted`)
Manifest ist **in `vite.config.ts` eingebettet** (VitePWA-Plugin).

| Datei | Änderung |
|---|---|
| `vite.config.ts` (`manifest`-Objekt) | `name` → `Steinbockchalets-Hausverwaltung` · `short_name` → `Hausverwaltung` · `theme_color` → `#c2410c` |
| `index.html` | `theme-color` → `#c2410c` · `apple-mobile-web-app-title` → `Hausverwaltung` · `application-name` → `Steinbockchalets-Hausverwaltung` · `msapplication-TileColor` → `#c2410c` · `mask-icon` color → `#c2410c` · `<title>` → `Steinbockchalets-Hausverwaltung` |

**Status: erledigt & verifiziert** (Titelleiste erscheint orange mit neuem Namen).

### 3.2 Reinigung / Amela (`amela-clean-hub-selfhosted`)
Manifest ist **in `vite.config.ts` eingebettet** (wie Hausverwaltung).
Farbe war bereits blau (`#1e3a8a`) — nur Namen anzupassen.

| Datei | Änderung |
|---|---|
| `vite.config.ts` (`manifest`-Objekt) | `name` → `Steinbockchalets-Reinigungsportal` · `short_name` → `Reinigung` (war „Amela Clean") · `theme_color` bleibt `#1e3a8a` |
| `index.html` | `apple-mobile-web-app-title` → `Reinigung` (war „Amela Clean") · `<title>` → `Steinbockchalets-Reinigungsportal` · `<html lang>` „en" → „de" |

> ⚠️ **Achtung Doppelgänger-Repo:** Es existieren zwei Amela-Repos —
> `amela-clean-hub` (alt, Lovable) und `amela-clean-hub-selfhosted` (aktuell).
> Änderungen **nur im `-selfhosted`**. Das alte nicht anfassen.

Optional offen (nur Link-Vorschau, unkritisch): `author`, `og:title`,
`twitter:*`, `og:image` zeigen noch auf Lovable bzw. den alten Namen.

### 3.3 Wäsche / Teuni (`fresh-spin-portal`)
Manifest ist eine **echte Datei** `public/manifest.json` (NICHT in vite.config).
Farbe war bereits grün (`#10b981`) — nur Namen anzupassen.

| Datei | Änderung |
|---|---|
| `public/manifest.json` | `name` → `Steinbockchalets-Wäscheportal` · `short_name` → `Wäsche` (war „Wäscheportal") · `theme_color` bleibt `#10b981` |
| `index.html` | `apple-mobile-web-app-title` → `Wäsche` (war „Wäscheportal") · `<title>` → `Steinbockchalets-Wäscheportal` |

> Hinweis: Repo heißt `fresh-spin-portal` (**ohne** `-selfhosted`, anders als
> Amela). Frühere Notizen mit `fresh-spin-portal-selfhosted` waren falsch.

Optional offen (unkritisch): `author` = „Lovable", `og:*` / `twitter:*` auf
altem Namen/Lovable-Bild.

---

## 4. Wichtig: installierte PWA aktualisiert sich nicht von selbst

Eine bereits auf Homescreen/Dock **installierte** PWA übernimmt geänderten
Namen, Farbe und Icon **nicht automatisch**. Nach dem Deploy (Vercel) muss die
betroffene Kachel **einmal entfernt und neu installiert** werden, damit die
neuen Werte greifen.

---

## 5. Icons — bewusst NICHT vereinheitlicht

Diskutiert wurde, das Steinbock-Firmenlogo auf alle drei Apps zu legen. Das
wurde **bewusst verworfen**, weil identische Icons das Verwechslungsproblem
zurückbringen würden.

**Ist-Zustand der Icons (belassen):**
- Hausverwaltung: Steinbock-Logo
- Reinigung/Amela: blaues „Amela"-Icon
- Wäsche/Teuni: grünes Icon

Diese drei sind bereits optisch verschieden → zusammen mit Name + Farbe ist die
Unterscheidung ausreichend gelöst. **Entscheidung: so lassen.**

> Falls später doch einheitliches Branding gewünscht: gemeinsames Steinbock-Logo
> mit **drei verschiedenen Farbhintergründen** (orange/blau/grün), je App vier
> Icon-Größen ersetzen (`pwa-192x192`, `pwa-512x512`, maskable, `apple-touch-icon`
> bzw. bei Amela/Teuni die `icon-*`-Dateien). Logo als Bilddatei nötig.

---

## 6. Live-Links (Referenz)

| App | URL |
|---|---|
| Hausverwaltung | `https://hausmanagement.steinbockchalets-charge.com` |
| Reinigung (Amela) | `https://amela.steinbockchalets-charge.com` |
| Wäsche (Teuni) | `https://teuni.steinbockchalets-charge.com` |

---

## 7. Verifikations-Checkliste

- [x] Hausverwaltung: Name/Farbe geändert, Titelleiste orange bestätigt
- [ ] Reinigung/Amela: Änderungen committet, Deploy geprüft
- [ ] Wäsche/Teuni: Änderungen committet, Deploy geprüft
- [ ] Je App: alte Kachel entfernt + neu installiert → neuer Name/Farbe sichtbar
- [x] Icons: Entscheidung „belassen" dokumentiert
