# Einfügetext für `Steinbock-Chalets-Gesamtdokumentation-MASTER.md` (Website, 19.09.2026)

> Ablage: `hausmanagement-selfhosted/docs/`. Nach dem Einarbeiten in die
> Master-Doku kann diese Datei gelöscht werden.
> Grund: Die Master-Doku nennt noch die alte Website-Datenbank
> `xcohqbdgzprkixeycdhk`. Seit 18.09.2026 läuft die Website auf einer eigenen
> Datenbank.

---

## Änderung 1 — Abschnitt 1, Tabelle „Die Apps“

Zeile **ersetzen**:

```
| Marketing-Website | `web-takeover-buddy` | öffentlich, eigene DB | steinbockchalets.com |
```

durch:

```
| Marketing-Website | `web-takeover-buddy` | öffentlich, eigene DB (`wlmdjljyzdwvpqefwdmy`), Doku: `web-takeover-buddy/docs/WEBSITE-MASTER.md` | steinbockchalets.com |
```

## Änderung 2 — Abschnitt 1, Satz unter der Tabelle

**Ersetzen:**

```
**Gemeinsame Datenbank:** Supabase-Projekt `usblrulkcgucxtkhugck`
(Website nutzt separates Projekt `xcohqbdgzprkixeycdhk`).
```

durch:

```
**Gemeinsame Datenbank:** Supabase-Projekt `usblrulkcgucxtkhugck`
(Konto uli.berresheim@hotmail.de, Organisation über Vercel Marketplace).

**Website-Datenbank (seit 18.09.2026):** Supabase-Projekt
`wlmdjljyzdwvpqefwdmy` („steinbockchalets-webseite“), **Konto
steinbockchalets@gmail.com**, Organisation „steinbockchalets webseite“, Region
West EU (Irland), Free-Tarif ohne Backups. Die frühere Lovable-Datenbank
`xcohqbdgzprkixeycdhk` ist stillgelegt (kein Zugang mehr). Die Website liest
zusätzlich die Belegung aus `public_availability` der Hausverwaltung und
schreibt Anfragen in deren `booking_inquiries` (über `houses.external_house_id`:
Venediger `f5b4588b-96cf-46f7-b84a-5f6750f7088e`, Wald
`a2b4d1f7-f396-40a5-b83f-174ccafa55fd`).
Details, Datenmodell und Regeln: `web-takeover-buddy/docs/WEBSITE-MASTER.md`.
```

## Änderung 3 — Abschnitt 8 „Wichtige Entscheidungen“, neuer Punkt anhängen

```
- **Website: keine Hausinhalte im Code** (19.09.2026). Beschreibung,
  Highlights, Ausstattung und Kennzahlen je Haus stehen in der Website-DB
  (`houses`, `house_features`) und werden im Admin der Website gepflegt. Beide
  Häuser starten mit denselben Werten. Fehlt ein Wert, lässt die Website den
  Block weg — keine festen Rückfalltexte.
- **Wald Chalet auf der Website** (18.09.2026) angelegt; wird bis auf Weiteres
  ausschließlich über Belvilla vermietet und erst freigeschaltet, wenn das
  nicht mehr allein über Belvilla laufen soll.
```
