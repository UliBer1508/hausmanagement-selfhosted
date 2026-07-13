# Hausverwaltung — Steinbock Chalets

Zentrale Verwaltungs-App für zwei Ferienobjekte in Österreich (Wald Chalet,
Venediger Chalet): Buchungen, Gäste, Reinigung, Wäsche, Preise, Zahlungen —
plus **Max**, den KI-Assistenten.

**Live:** hausmanagement.steinbockchalets-charge.com

---

## ⚠️ Vor jeder Code-Änderung lesen (Pflicht)

Diese Reihenfolge ist verbindlich. Sie existiert, weil das Überspringen schon
mehrfach Fehler verursacht hat:

| # | Datei | Wofür |
|---|-------|-------|
| 0 | [`docs/ARBEITSWEISE-CLAUDE-LESSONS.md`](docs/ARBEITSWEISE-CLAUDE-LESSONS.md) | Die Fehler, die schon gemacht wurden |
| 1 | [`docs/CODE-INDEX.md`](docs/CODE-INDEX.md) | Landkarte: „Wo ist X?" — inkl. Doppelgänger-Warnungen |
| 2 | [`docs/CODING-GUIDE.md`](docs/CODING-GUIDE.md) | Verbindlicher Standard (Teil A = Muss-Block) |
| 3 | [`docs/Steinbock-Chalets-Gesamtdokumentation-MASTER.md`](docs/Steinbock-Chalets-Gesamtdokumentation-MASTER.md) | Gesamtbild: System, Datenmodell, Max |
| 4 | [`supabase/SQL/README.md`](supabase/SQL/README.md) | **Die Logik in DB-Triggern** — im Code nicht sichtbar! |

[`AGENTS.md`](AGENTS.md) im Root fasst die Regeln kurz zusammen (wird von
KI-Werkzeugen automatisch gelesen).

### Die zwei teuersten Lehren

**Fehlt ein Feld in der UI → zuerst die Supabase-Query prüfen, nicht die Anzeige.**
Supabase liefert bei Joins nur die ausdrücklich genannten Felder — ohne Fehlermeldung.

**Ein Teil der Geschäftslogik liegt in DB-Triggern, nicht im TypeScript-Code.**
Wer nur den Code liest, übersieht die Hälfte der Wirkung. Siehe `supabase/SQL/`.

---

## Architektur in drei Sätzen

**Kein Seiten-Routing.** Alles hängt an Tabs in `src/pages/OriginalDashboard.tsx`
(`switch(activeTab)`). Die Frage lautet nie „welche Route?", sondern „welcher Tab?".

**Max** lebt in der Edge Function `supabase/functions/chat-assistant/` (Gemini 2.5
Flash, 26 Werkzeuge). Er handelt nur nach ausdrücklicher Freigabe.

**Die Kommunikationskette** zu den Dienstleistern (Amela = Reinigung, Teuni =
Wäsche) wird durch **eine ID** zusammengehalten: `related_task_id`. Sie wandert
durch jede Nachricht und löst das Problem „welche Reinigung ist gemeint?".

---

## Stack

React 18 · TypeScript · Vite · TailwindCSS · shadcn/ui · TanStack React Query
Supabase (PostgreSQL + Edge Functions) · Vercel · Cloudflare · PWA
KI: Gemini 2.5 Flash · Zahlungen: Stripe · E-Mail: Gmail SMTP

---

## Verwandte Apps (gemeinsame Datenbank)

| App | Repo | Zweck |
|-----|------|-------|
| Amela-Portal | `amela-clean-hub-selfhosted` | Reinigung |
| Teuni-Portal | `fresh-spin-portal-selfhosted` | Wäsche |
| Heizung/PV | `smartfox-insight-ai-selfhosted` | Energie-Monitoring |
| Website | `web-takeover-buddy` | öffentlich (eigene DB) |

---

## Lokal entwickeln

```sh
npm install
npm run dev
```

**Deploy:** Frontend baut Vercel automatisch bei jedem Push.
Edge Functions:
```sh
supabase functions deploy <name> --project-ref usblrulkcgucxtkhugck
```

**Migrationen:** Wegen desynchroner Historie **kein** `db push` — SQL direkt im
Supabase SQL-Editor ausführen.
