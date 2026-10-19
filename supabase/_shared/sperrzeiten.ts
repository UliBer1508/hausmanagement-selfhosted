// =============================================================================
// _shared/sperrzeiten.ts — eigene Sperrzeiten (SQL 66) für die Edge Functions
// =============================================================================
//
// Genutzt von: ical-sync, kalender-abgleich.
// (ical-export und analyze-vacancy brauchen nur die Zeiträume selbst.)
//
// EINE Regel, wann eine Portal-Belegung als Uli's EIGENE SPERRE gilt — damit
// Sync (Kollision, Änderungs-Hinweis) und Abgleich (Einordnung, Langsperre,
// fehlende Buchung) nicht auseinanderlaufen.
//
// Datum: Tabelle `sperrzeiten` speichert letzter_tag EINSCHLIESSLICH (letzte
// gesperrte Nacht). Hier wird alles in Nächte [von, bis) mit bis EXKLUSIV
// umgerechnet — dasselbe Format wie DTEND, check_out und external_blocks.
// Alle Rechnungen in UTC auf reinen Kalendertagen, keine Zeitzone.

export interface SperrzeitZeile {
  erster_tag: string;
  letzter_tag: string;
}

const tag = (v: unknown): string => String(v ?? '').slice(0, 10);

/** Alle Nächte [von, bis) als YYYY-MM-DD, bis exklusiv. */
export function naechteZwischen(von: unknown, bis: unknown): string[] {
  const out: string[] = [];
  const d = new Date(tag(von) + 'T00:00:00Z');
  const ende = new Date(tag(bis) + 'T00:00:00Z');
  let guard = 0;
  while (d < ende && guard++ < 1000) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const folgeTag = (t: unknown): string =>
  new Date(Date.parse(tag(t) + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);

/** Menge aller gesperrten Nächte aus den Tabellenzeilen. */
export function sperrNaechteAus(zeilen: SperrzeitZeile[] | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const s of zeilen ?? []) {
    for (const t of naechteZwischen(s.erster_tag, folgeTag(s.letzter_tag))) set.add(t);
  }
  return set;
}

/** Zusammenhängende gesperrte Zeiträume, bis exklusiv. */
export function sperrBloecke(sperrNaechte: Set<string>): Array<{ von: string; bis: string }> {
  const sortiert = [...sperrNaechte].sort();
  const out: Array<{ von: string; bis: string }> = [];
  let von: string | null = null;
  let prev: string | null = null;
  for (const t of sortiert) {
    if (von === null) { von = t; prev = t; continue; }
    if (t === folgeTag(prev)) { prev = t; continue; }
    out.push({ von, bis: folgeTag(prev) });
    von = t; prev = t;
  }
  if (von !== null) out.push({ von, bis: folgeTag(prev) });
  return out;
}

/**
 * Ist die Portal-Belegung [von, bis) eine Sperre, die zu Uli's Sperrzeiten
 * gehört?
 *
 * Ja, wenn
 *   1. JEDE Nacht durch eine eigene Sperrzeit oder eine eigene Buchung gedeckt
 *      ist, UND
 *   2. mindestens eine Nacht in einer Sperrzeit liegt, UND
 *   3. die Länge NICHT nach einer Buchung aussieht — oder doch, dann aber nur,
 *      wenn sie die berührten Sperrzeiten VOLLSTÄNDIG abdeckt.
 *
 * Zu 3 (wichtig): Booking.com meldet Buchungen und Sperren gleich
 * („CLOSED - Not available"). Hat Uli vergessen, eine Sperrzeit in
 * Booking.com zu setzen, kann dort ein Gast buchen — die Buchung erscheint
 * dann als Block INNERHALB der Sperrzeit. Ein Block in Buchungslänge
 * (min_naechte … max_naechte), der nur einen TEIL einer Sperrzeit belegt, ist
 * deshalb KEINE eigene Sperre, sondern bleibt für den Abgleich sichtbar
 * (Meldung „Buchung fehlt" mit Hinweis auf die Sperrzeit).
 * Kürzere Blocks sind Mindestaufenthalts-Sperren, längere sind keine Buchung.
 */
export function istEigeneSperre(
  von: unknown,
  bis: unknown,
  sperrNaechte: Set<string>,
  buchungsNaechte: Set<string>,
  minNaechte: number,
  maxNaechte: number,
): boolean {
  if (sperrNaechte.size === 0) return false;
  const tage = naechteZwischen(von, bis);
  if (tage.length === 0) return false;

  let gesperrt = 0;
  for (const t of tage) {
    if (sperrNaechte.has(t)) gesperrt++;
    else if (!buchungsNaechte.has(t)) return false;
  }
  if (gesperrt === 0) return false;

  const n = tage.length;
  if (n < minNaechte || n > maxNaechte) return true;

  // Buchungslänge: nur eigene Sperre, wenn jede berührte Sperrzeit ganz
  // im Block liegt.
  const blockVon = tag(von);
  const blockBis = tag(bis);
  return sperrBloecke(sperrNaechte)
    .filter((z) => z.von < blockBis && z.bis > blockVon)
    .every((z) => z.von >= blockVon && z.bis <= blockBis);
}
