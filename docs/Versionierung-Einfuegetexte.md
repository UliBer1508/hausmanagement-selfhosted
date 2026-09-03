# Einfuegetexte zur Versionierung

Diese Datei ist eine Arbeitsanweisung, kein Dauerdokument. Nach dem Einfuegen
der beiden Bloecke kann sie geloescht werden.

---

## Einfuegung 1 — `AGENTS.md`

**Wohin:** In den Abschnitt `## Abschluss jeder Änderung`, als zusaetzlicher
Aufzaehlungspunkt am Ende (nach „Kurz-Changelog ausgeben").

**Einzufuegender Text:**

```markdown
- **Versionsnummer:** wird automatisch hochgezählt — nicht von Hand in
  `package.json` ändern. Steuerung über die Commit-Message: `[minor]` für ein
  abgeschlossenes Feature, `[major]` für einen großen Meilenstein, sonst
  Patch. `[skip version]` unterdrückt den Bump (z. B. bei reinen Doku-Commits).
  Hintergrund und die Abgrenzung zu `public/version.json`:
  `docs/Versionierung-und-Auto-Bump.md`.
```

---

## Einfuegung 2 — `AGENTS.md`, Referenzliste

**Wohin:** In den Abschnitt `## Ausführliche Referenzen im Repo`, als letzter
Listenpunkt.

**Einzufuegender Text:**

```markdown
- `docs/Versionierung-und-Auto-Bump.md` — die ZWEI Versionsnummern des Projekts
  (`package.json` = Footer-Anzeige, `public/version.json` = PWA-Cache-Busting).
  Lesen, bevor man einen der beiden Mechanismen anfasst oder für kaputt hält.
```

---

## Einfuegung 3 — `docs/Steinbock-Chalets-Gesamtdokumentation-MASTER.md`

**Wohin:** Abschnitt `### Deploy-Wege` (etwa Zeile 590), als neuer Punkt nach
der Zeile „**Frontend:** GitHub Push → Vercel baut automatisch → hart neu laden."

**Einzufuegender Text:**

```markdown
- **Versionierung:** zwei getrennte Nummern, nicht verwechseln.
  `package.json` → Footer-Anzeige, wird von der GitHub Action
  `.github/workflows/version-bump.yml` bei jedem Push auf `main` automatisch
  hochgezählt (`[minor]`/`[major]`/`[skip version]` in der Commit-Message
  steuern den Typ). `public/version.json` → PWA-Cache-Busting, wird vom
  `versionStampPlugin` in `vite.config.ts` bei jedem Build neu erzeugt; der
  Stand dieser Datei im Repo ist ein veraltetes Build-Artefakt und bewusst
  nicht gepflegt. Details: `docs/Versionierung-und-Auto-Bump.md`.
```

---

## Optional — `docs/ARBEITSWEISE-CLAUDE-LESSONS.md`

**Wohin:** als neue Lesson am Ende. Nur einfuegen, wenn die Lesson-Nummerierung
fortlaufend gepflegt wird — die Nummer bitte an den Bestand anpassen.

**Einzufuegender Text:**

```markdown
### Lesson X — Ein veraltetes Build-Artefakt im Repo ist kein Fehler

**Situation (03.09.2026):** Die Frage „warum haben wir keine neue
Versionsnummer?" führte zunächst zu der Diagnose, der PWA-Update-Mechanismus
sei kaputt: `public/version.json` trug im Repo einen Stand vom 22.06.2026, den
letzten Commit hatte noch `lovable-dev[bot]` gesetzt. Die Schlussfolgerung
lautete, die Lovable-Pipeline habe die Datei früher gepflegt und seit der
Migration mache das niemand mehr.

**Tatsächlich:** `vite.config.ts` enthält seit jeher einen
`versionStampPlugin`, der die Datei bei jedem Build neu schreibt. Der Stand im
Repo ist irrelevant — Build-Artefakte werden nicht zurückcommittet. Der
Mechanismus funktionierte die ganze Zeit.

**Der eigentliche Punkt** war eine völlig andere Nummer: die `version` in
`package.json`, die der Footer anzeigt und die nie jemand hochgezählt hat.

**Lehre:** Zwei Dinge, die gleich heißen, sind nicht dasselbe. Und: Der Zustand
einer generierten Datei im Repository beweist nichts über den Zustand im
Deployment. Prüfen heißt hier, die Datei **live** unter ihrer URL abzurufen —
nicht ihren Git-Stand anzusehen. Vor der Diagnose „X ist kaputt" muss die
erzeugende Stelle (Build-Config, Plugin, Action) gelesen worden sein, nicht nur
das Ergebnis.
```
