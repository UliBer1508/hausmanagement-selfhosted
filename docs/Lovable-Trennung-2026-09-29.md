# Lovable-Trennung — Abschluss (29.09.2026)

> Zweck: festhalten, wo nach dem Umzug auf Selfhosted (Juli 2026) noch Lovable
> steckte, was entfernt wurde und was bewusst bleibt.
> Gilt für alle vier Repos: Hausverwaltung, Teuni, Amela, Boris.

---

## 1. Zugriffe außerhalb des Codes (entfernt 29.09.2026)

| Wo | Befund | Erledigt |
|---|---|---|
| Supabase → Organization settings → OAuth Apps | App **„Lovable“** (lovable-provision-v2), autorisiert seit 23.11.2025, Zugriff auf **alle Projekte der Organisation** inkl. Produktions-DB `usblrulkcgucxtkhugck` | widerrufen |
| GitHub → Installed GitHub Apps | **lovable.dev**, Lese-/Schreibzugriff auf Code, Administration und Workflows, **alle Repositories** | deinstalliert |
| GitHub → Authorized GitHub Apps | **lovable.dev**, handelt im Namen des Nutzers | widerrufen |

Geprüft und unkritisch: Die Supabase-Organisation läuft über den **Vercel Marketplace**
(Abrechnung über Vercel), nicht über Lovable. Die Portale greifen mit eigenen
Schlüsseln (Vercel-Umgebungsvariablen) auf die DB zu und sind vom Widerruf nicht betroffen.

**Behalten (nicht Lovable):** GitHub-Apps *Vercel* (Auto-Deploy) und *Cursor*,
Freigaben *Claude Github MCP Connector*, *Claude*, *Copilot*, OAuth-App *Supabase*.

---

## 2. Build-Abhängigkeit: Lovable-Paketserver in `bun.lock`

**Befund:** 125 Pakete in `bun.lock` waren fest auf Lovables internen Paketserver
eingetragen (`europe-west1-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/…`),
darunter build-relevante wie `vite` und `postcss`. Vercel installiert mit Bun und
lädt jedes Paket von der Adresse im Lockfile. Der Server war am 29.09.2026 öffentlich
erreichbar — würde Lovable ihn sperren, schlüge jeder weitere Build fehl.

**Änderung:** Adressen auf `""` gesetzt (= öffentlicher npm-Server). Versionen und
sha512-Prüfsummen unverändert; zusätzlich `lovable-tagger` entfernt. Dadurch ordnet
Bun esbuild neu ein — Vite nutzt vorher wie nachher esbuild **0.21.5**.

**Verifiziert:** `bun install --frozen-lockfile` mit leerem Cache (Lovable-Server
dabei blockiert) → erfolgreich; `npm run build` → erfolgreich; `vitest run` → grün.

> Regel ab jetzt: Taucht in `bun.lock` wieder `pkg.dev` oder `lovable` auf,
> ist etwas falsch — nie mit einem Lovable-Werkzeug installieren.

---

## 3. Code-Reste Hausverwaltung (entfernt)

| Datei | Was |
|---|---|
| `vite.config.ts`, `package.json` | Entwicklungs-Plugin `lovable-tagger` (lief nie im Live-Build) |
| `src/main.tsx`, `src/hooks/useAppVersionCheck.ts` | Erkennung der Lovable-Vorschau (toter Code). Iframe-Schutz und `?sw=off` bleiben. |
| `src/hooks/useChat.ts` | HTTP 402 zeigte „Lovable AI Credits aufgebraucht“ — falsch, Max läuft über **Google Gemini**. Jetzt: Meldung der Edge Function bzw. Hinweis auf Gemini-Kontingent. |
| `supabase/functions/search-competitors/index.ts` | „Lovable Workspace aufladen“ → „Perplexity-Konto aufladen“. **Edge Function neu deployen.** |
| `src/hooks/useDynamicPricing.ts` | Kommentar „in dein Lovable-Projekt einbinden“ |
| `AGENTS.md`, `docs/AGENTS.md` | Titel/Einleitung nennen nicht mehr den Lovable-Agenten |

**Bewusst geblieben:** Erwähnungen in Sitzungsprotokollen, Lessons und SQL-Kommentaren.
Insbesondere gilt weiter: **wegen der Lovable-Migrationshistorie kein `db push`**,
SQL direkt im Supabase SQL-Editor.

---

## 4. Portale (29.09.2026 eingespielt und per SHA geprüft)

| Portal | Entfernt |
|---|---|
| Teuni (`fresh-spin-portal-selfhosted`) | README-Vorlage, `.lovable/`, Meta-Tags, `lovable-tagger`, Lovable-Favicon, Vorschau-Erkennung |
| Amela (`amela-clean-hub-selfhosted`) | dito, dazu Lovable-Vorschaubild, `dns-prefetch` und Cache-Regel für `lovableproject.com` |
| Boris (`boris-clean-hub-selfhosted`) | wie Amela; README hieß noch „Amela Cleaning Portal“ |

---

## 5. Offene Punkte

- **Amela-Domain:** `amela.steinbockchalets-charge.com` liefert eine **alte** Version
  (Lovable-Meta-Tags), während `amela-clean-hub-selfhosted.vercel.app` aktuell ist.
  In Vercel prüfen, welchem Projekt die Domain zugeordnet ist, und welche Adresse
  Amela tatsächlich nutzt.
- **`bun.lockb` in Amela und Boris** verweist ebenfalls auf den Lovable-Paketserver
  (daneben liegt eine `package-lock.json` mit öffentlichem npm). Klären, womit Vercel
  dort installiert (Build-Log: `bun install` oder `npm install`), dann vereinheitlichen.
- **Datenbank-Sicherung:** Supabase-Organisation im **Free-Plan**, Dashboard zeigt
  „No backups“. Entscheiden: Pro-Plan oder eigene regelmäßige Sicherung.
