// ============================================================
// Sperrzeiten — reine Helfer (SQL 66, Tabelle `sperrzeiten`)
// ============================================================
//
// Eine Sperrzeit ist ein Zeitraum, den Uli bewusst NICHT vermieten will.
//
// DATUM — WICHTIG: Beide Felder sind reine Kalendertage ("YYYY-MM-DD").
//   erster_tag  = erste gesperrte Nacht
//   letzter_tag = letzte gesperrte Nacht, EINSCHLIESSLICH
// Eine Abreise am erster_tag und eine Anreise am Tag nach letzter_tag bleiben
// möglich. Verglichen wird deshalb immer über den Tagesschlüssel, NIE über
// new Date("YYYY-MM-DD") — das wäre UTC-Mitternacht und verschiebt sich je
// nach Zeitzone um einen Tag.
//
// Gegenstück für die Edge Functions: supabase/functions/_shared/sperrzeiten.ts

import { format } from "date-fns";

export type SperrGrund = "eigennutzung" | "behoerdliche_auflage" | "renovierung" | "sonstiges";

export interface Sperrzeit {
  id: string;
  house_id: string;
  erster_tag: string;
  letzter_tag: string;
  grund: SperrGrund;
  notiz: string | null;
}

// Reihenfolge = Reihenfolge in der Auswahl.
export const SPERR_GRUENDE: { value: SperrGrund; label: string }[] = [
  { value: "eigennutzung", label: "Eigennutzung" },
  { value: "behoerdliche_auflage", label: "Behördliche Auflage" },
  { value: "renovierung", label: "Renovierung" },
  { value: "sonstiges", label: "Sonstiges" },
];

export const sperrGrundLabel = (g: string): string =>
  SPERR_GRUENDE.find((x) => x.value === g)?.label ?? g;

/** Kalendertag eines Date-Objekts in lokaler Zeit als "YYYY-MM-DD". */
export const tagSchluessel = (d: Date): string => format(d, "yyyy-MM-dd");

/** Liegt die Nacht, die an diesem Kalendertag beginnt, in der Sperrzeit? */
export const istTagGesperrt = (s: Pick<Sperrzeit, "erster_tag" | "letzter_tag">, tag: string): boolean =>
  s.erster_tag <= tag && tag <= s.letzter_tag;

/** Die Sperrzeit eines Hauses, in der dieser Tag liegt (oder undefined). */
export const findeSperrzeit = (
  sperrzeiten: Sperrzeit[] | undefined,
  houseId: string,
  tag: string,
): Sperrzeit | undefined =>
  (sperrzeiten ?? []).find((s) => s.house_id === houseId && istTagGesperrt(s, tag));

/** Anzahl gesperrter Nächte (letzter_tag einschließlich). */
export const sperrNaechte = (s: Pick<Sperrzeit, "erster_tag" | "letzter_tag">): number =>
  Math.round(
    (Date.parse(`${s.letzter_tag}T00:00:00Z`) - Date.parse(`${s.erster_tag}T00:00:00Z`)) / 86400000,
  ) + 1;

/** "YYYY-MM-DD" -> "DD.MM.YYYY" ohne Zeitzonenumrechnung. */
export const tagAnzeigen = (t: string): string => {
  const [j, m, d] = t.slice(0, 10).split("-");
  return `${d}.${m}.${j}`;
};

/** Tag nach letzter_tag als "YYYY-MM-DD" (= erster möglicher Anreisetag). */
export const tagDanach = (t: string): string =>
  new Date(Date.parse(`${t.slice(0, 10)}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/**
 * Sperrzeiten als Belegungen im Buchungsformat (check_in / check_out mit
 * Abreisetag exklusiv). Für Auswertungen, die mit Buchungen rechnen — z. B.
 * die Lückenanalyse: Ein gesperrter Zeitraum ist keine Lücke.
 * Uhrzeit 12:00 lokal, damit new Date(...) in jeder Zeitzone den richtigen
 * Kalendertag trifft.
 */
export const sperrzeitAlsBelegung = (s: Sperrzeit) => ({
  id: `sperre-${s.id}`,
  house_id: s.house_id,
  check_in: `${s.erster_tag}T12:00:00`,
  check_out: `${tagDanach(s.letzter_tag)}T12:00:00`,
  status: "gesperrt",
  ist_sperrzeit: true,
});
