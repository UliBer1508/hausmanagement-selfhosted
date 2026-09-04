# Versionierung — zwei getrennte Versionsbegriffe

> Angelegt 03.09.2026. Grund: Die Versionsnummer im Footer stand seit dem
> 05.05.2026 unveraendert auf `2.0.0`, obwohl seitdem die komplette Migration
> auf selfhosted, die Gastdaten-Entdopplung, die Dokumentenverwaltung und das
> Belegungsraster in den Portalen dazugekommen sind. Der Grund war kein Fehler,
> sondern eine Luecke: Es gab **keinen** Prozess, der diese Zahl pflegt.

## Das Wichtigste in einem Satz

Es gibt **zwei voneinander unabhaengige Versionsnummern** im Projekt. Sie sehen
aehnlich aus, haben aber nichts miteinander zu tun. Wer sie verwechselt, sucht
den Fehler an der falschen Stelle.

| | `package.json` -> Feld `version` | `public/version.json` |
|---|---|---|
| **Zweck** | Anzeige im Footer der App | PWA-Cache-Busting (erkennt neue Deploys) |
| **Format** | Semver, z. B. `2.0.1` | Zeitstempel-Hash, z. B. `mqpj6zar` |
| **Erzeugt von** | GitHub Action `.github/workflows/version-bump.yml` | `versionStampPlugin` in `vite.config.ts` |
| **Wann** | bei jedem Push auf `main` | bei jedem Build (`buildStart`-Hook) |
| **Im Git sichtbar?** | ja, wird zurueckcommittet | nein — Build-Artefakt, die Datei im Repo ist veraltet und das ist korrekt so |
| **Gelesen von** | `src/components/Layout/AppLayout.tsx` | `src/hooks/useAppVersionCheck.ts` |
| **Technische Wirkung** | keine, rein kosmetisch | erzwingt Reload installierter PWAs |

## 1. `package.json` — die sichtbare Versionsnummer

### Wo sie erscheint

`src/components/Layout/AppLayout.tsx` importiert die `package.json` direkt und
zeigt das Feld im Footer:

```tsx
import pkg from '../../../package.json';
...
© {new Date().getFullYear()} Steinbock Chalets · v{pkg.version}
```

Sie haengt an **nichts** anderem: kein Git-Tag, kein Changelog, kein
Build-Schritt wertet sie aus. Wer sie aendert, aendert nur die Anzeige.

### Wie sie hochgezaehlt wird

Der Workflow `.github/workflows/version-bump.yml` laeuft bei jedem Push auf
`main`, ruft `npm version <typ> --no-git-tag-version` auf und committet die
geaenderte `package.json` als `version-bot` zurueck.

**Steuerung ueber die Commit-Message:**

| Commit-Message enthaelt | Ergebnis | Wann verwenden |
|---|---|---|
| `[major]` | `2.x.x` -> `3.0.0` | grosser Meilenstein (z. B. Start des KI-Systems) |
| `[minor]` | `2.0.x` -> `2.1.0` | Feature abgeschlossen |
| nichts davon | `2.0.0` -> `2.0.1` | Standard, jede normale Aenderung |
| `[skip version]` | keine Aenderung | Doku-Commits, Nachtraege |

### Warum es keine Endlosschleife gibt

Der Bump-Commit des Bots traegt selbst `[skip version]` in der Message. Die
`if`-Bedingung des Jobs prueft genau darauf und ueberspringt den Lauf. Ohne
diesen Marker wuerde sich der Workflow endlos selbst neu ausloesen.

### Voraussetzung im Repo

Unter *Settings -> Actions -> General -> Workflow permissions* muss
**„Read and write permissions"** aktiv sein. Sonst scheitert der letzte
Schritt (`git push`) mit HTTP 403. Am 03.09.2026 geprueft und aktiv.

### Nebeneffekt

Jeder Push loest **zwei** Vercel-Builds aus: den eigenen und den des
Bump-Commits. Bei der Aenderungsfrequenz dieses Projekts unkritisch, aber es
erklaert doppelte Eintraege in der Vercel-Build-Liste — das ist kein Fehler.

## 2. `public/version.json` — das PWA-Cache-Busting

### Wozu

Installierte PWAs halten sich hartnaeckig an ihren Cache. Damit ein neuer
Deploy beim Nutzer ankommt, ohne dass er Strg+Umschalt+R drueckt, gibt es eine
Datei, deren Inhalt sich bei **jedem** Build aendert.

### Erzeugung

`vite.config.ts`, Plugin `versionStampPlugin`, Hook `buildStart`:

```js
const payload = {
  version: Date.now().toString(36),
  builtAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(dir, "version.json"), JSON.stringify(payload));
```

Vite kopiert `public/` anschliessend nach `dist/`. Die Datei ist damit
Bestandteil jedes Deploys — mit einem bei jedem Build anderen Wert.

### Auswertung

`src/hooks/useAppVersionCheck.ts`, eingehaengt in `AppLayout.tsx`:

- pollt `/version.json` alle 20 Sekunden, zusaetzlich bei `visibilitychange`
- merkt sich den Wert beim ersten Aufruf
- weicht ein spaeterer Wert davon ab: Service Worker aktualisieren,
  `SKIP_WAITING` senden, Seite neu laden

In `vite.config.ts` ist `/version.json` ausserdem als `NetworkOnly` konfiguriert
— die Pruefdatei darf niemals aus dem Cache kommen, sonst prueft sie sich selbst
ins Leere.

### Wichtig: die Datei im Git ist veraltet — und das ist richtig

`public/version.json` liegt mit einem Stand vom 22.06.2026 im Repo. Das ist
**kein** Fehler und muss **nicht** korrigiert werden. Die Datei wird im
Build-Container von Vercel ueberschrieben; dieser Stand wird bewusst nie nach
GitHub zurueckcommittet. Ein Build-Artefakt gehoert nicht ins Repo.

> **Fehlerquelle:** Wer den alten Stand im Repo sieht, haelt den
> Update-Mechanismus fuer kaputt und baut ihn ein zweites Mal. Genau das ist am
> 03.09.2026 beinahe passiert. Der Beweis liegt nicht im Repo, sondern im
> Live-Aufruf von `https://hausmanagement.steinbockchalets-charge.com/version.json`.

## 3. Fehlersuche

**Footer zeigt eine alte Versionsnummer**
1. `package.json` auf `main` pruefen — steht dort schon die neue Nummer?
2. Falls nein: GitHub -> Tab *Actions* -> Lauf „Auto Version Bump" ansehen.
   Rot beim letzten Schritt = Permissions-Problem (siehe oben).
3. Falls ja: Vercel-Build-Status pruefen. Ein fehlgeschlagener Build liefert
   weiter den alten Stand aus — es ist dann **kein** Cache-Problem.

**App zeigt altes Verhalten, obwohl der Code auf `main` korrekt ist**
1. Zuerst Vercel-Build-Status (Lesson: der Build kann fehlgeschlagen sein).
2. Dann `/version.json` **live** aufrufen — aendert sich `builtAt` nach einem
   Deploy? Wenn nicht, greift der Stamp-Plugin nicht.
3. Erst danach an Cache oder Service Worker denken.

**Der Workflow laeuft zweimal / der Bot committet endlos**
`[skip version]` fehlt in der Bot-Commit-Message oder die `if`-Bedingung im
Workflow wurde geaendert. Workflow sofort deaktivieren
(*Actions -> Auto Version Bump -> Disable workflow*), dann korrigieren.

## 4. Historischer Rest

`useAppVersionCheck.ts` enthaelt noch eine Lovable-Erkennung:

```js
const isPreviewHost =
  host.includes("id-preview--") || host.includes("lovableproject.com");
```

Lovable wird nicht mehr genutzt. Der Code ist wirkungslos, aber harmlos —
bewusst stehen gelassen, um nicht ohne Anlass in laufende Logik einzugreifen.

## Beteiligte Dateien

| Datei | Rolle |
|---|---|
| `.github/workflows/version-bump.yml` | zaehlt `package.json` hoch (neu, 03.09.2026) |
| `package.json` | Feld `version` — Quelle der Footer-Anzeige |
| `src/components/Layout/AppLayout.tsx` | zeigt `pkg.version` im Footer |
| `vite.config.ts` | `versionStampPlugin` erzeugt `public/version.json` |
| `public/version.json` | Build-Artefakt; Stand im Repo ist bedeutungslos |
| `src/hooks/useAppVersionCheck.ts` | pollt und erzwingt den Reload |
