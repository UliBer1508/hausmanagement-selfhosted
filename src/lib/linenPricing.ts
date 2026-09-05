import type { LaundryArticle } from '@/hooks/useLaundryArticles';

/*
 * Preise und Mengen aus dem Wäscheset — die gemeinsame Grundlage.
 *
 * Angelegt am 05.09.2026, als die Auswertungen von den alten Spalten
 * (bedding_per_guest usw.) und von ai_linen_settings.prices auf die
 * Artikeltabellen umgestellt wurden.
 *
 * WARUM DIESE DATEI EXISTIERT
 *
 * Dieselbe Rechnung stand vorher an vier Stellen, jede mit eigenen
 * Ersatzwerten, die sich widersprachen:
 *
 *   useLinenAI.ts                 bedding 30, kitchen_towels fehlte ganz
 *   check-booking-linen-orders    bedding 30, kitchen_towels 12
 *   generate-booking-linen-order  bedding 30, kitchen_towels 5
 *   optimize-linen-inventory      pauschal 15 fuer ALLES
 *
 * Der echte Preis der Bettwaesche ist 9,50. Griff ein Ersatzwert, rechnete
 * das System mit dem Dreifachen — ohne dass es auffiel.
 *
 * DREI REGELN, DIE HIER ZUSAMMENLAUFEN
 *
 * 1. Der Preis haengt am ARTIKEL, nicht am Haus. Der Weg fuehrt ueber die
 *    Artikelnummer an der Set-Zeile, nicht ueber deren Schluesselnamen.
 *    Venediger nennt die Bettwaesche `bettwaesche`, Wald `bettwaescheset` —
 *    beide zeigen auf MW4.
 *
 * 2. Nachfolgekette. Teuni vergibt fuer dieselbe Leistung neue Nummern
 *    (MWR -> MW3 -> MW4). Eine Set-Zeile zeigt auf eine davon; der aktuelle
 *    Preis waechst am Ende der Kette nach.
 *
 * 3. Abrechnungsart. Ein Paket deckt mehrere Set-Positionen ab und wird
 *    EINMAL berechnet; ein Stueckartikel auf mehreren Zeilen wird jedes Mal
 *    berechnet. MWHT steht in beiden Haeusern auf Geschirr- und
 *    WB-Handtuechern und kostet beide Male.
 *
 * UND EINE, DIE NICHT VERHANDELBAR IST
 *
 * Ein fehlender Preis ist NICHT dasselbe wie ein Preis von 0. Positionen
 * ohne Artikel oder ohne Preisstand werden gesammelt und gemeldet, nicht
 * stillschweigend mit 0 eingerechnet. Greift kein einziger Preis, ist das
 * Ergebnis null — "nicht berechenbar" statt "kostenlos".
 */

/** Eine Zeile des Wäschesets, wie sie in custom_categories steht. */
export interface SetZeile {
  label?: string;
  quantity?: number;
  calculation_type?: 'per_guest' | 'per_booking';
  active?: boolean;
  availability?: 'always' | 'seasonal';
  season?: 'winter' | 'summer';
  external_artikelnummer?: Record<string, string>;
  preis_zaehlt?: boolean;
  [k: string]: any;
}

export type SetZeilen = Record<string, SetZeile>;

export interface Kostenergebnis {
  /** Summe der berechenbaren Positionen, oder null wenn keine greift. */
  betrag: number | null;
  /** Betrag je Set-Zeile. Im Paket enthaltene Zeilen stehen auf 0. */
  jeZeile: Record<string, number>;
  /** Set-Zeilen ohne Artikel oder ohne Preisstand. */
  ohnePreis: string[];
}

/** Artikelnummer einer Set-Zeile, in Großschreibung, oder null. */
export const artikelnummerVon = (zeile?: SetZeile): string | null => {
  const nr = zeile?.external_artikelnummer?.['default'];
  return nr ? String(nr).toUpperCase() : null;
};

/**
 * Folgt der Nachfolgekette bis zum aktuellen Artikel.
 *
 * Abbruch nach zehn Schritten: ein versehentlicher Zyklus (A -> B -> A)
 * wuerde die Schleife sonst nie verlassen. Zehn ist grosszuegig — die
 * laengste bekannte Kette hat zwei Glieder.
 */
export const aktuellerArtikel = (
  start: LaundryArticle | undefined,
  alle: LaundryArticle[],
): LaundryArticle | undefined => {
  let cur = start;
  let n = 0;
  while (cur?.nachfolger_id && n < 10) {
    const next = alle.find((a) => a.id === cur!.nachfolger_id);
    if (!next) break;
    cur = next;
    n++;
  }
  return cur;
};

/**
 * Ordnet jeder Set-Zeile ihren aktuellen Artikel zu.
 * Zeilen ohne Artikelnummer oder mit unbekannter Nummer fehlen im Ergebnis.
 */
export const artikelJeZeile = (
  zeilen: SetZeilen,
  artikel: LaundryArticle[],
): Record<string, LaundryArticle> => {
  const zuordnung: Record<string, LaundryArticle> = {};
  for (const [key, zeile] of Object.entries(zeilen ?? {})) {
    const nr = artikelnummerVon(zeile);
    if (!nr) continue;
    const gefunden = artikel.find((a) => a.artikelnummer.toUpperCase() === nr);
    const aktuell = aktuellerArtikel(gefunden, artikel);
    if (aktuell) zuordnung[key] = aktuell;
  }
  return zuordnung;
};

/**
 * Mengen für eine Buchung aus dem Wäscheset.
 *
 * Ersetzt die Rechnung aus den alten Spalten. Die setzt LinenSetRulesTab
 * beim Speichern eines Sets alle auf 0 — und je nach Schreibweise ergab
 * das entweder 1 je Position (`0 || 1`) oder gar nichts (`if (wert)`).
 * Beides war falsch, das zweite fiel nur weniger auf.
 */
export const mengenFuerBuchung = (
  zeilen: SetZeilen,
  anzahlGaeste: number,
  checkIn?: Date,
): Record<string, number> => {
  const mengen: Record<string, number> = {};
  for (const [key, zeile] of Object.entries(zeilen ?? {})) {
    if (!zeile?.active) continue;

    if (zeile.availability === 'seasonal' && checkIn) {
      const monat = checkIn.getMonth() + 1;
      const winter = monat >= 10 || monat <= 4;
      if (zeile.season === 'winter' && !winter) continue;
      if (zeile.season === 'summer' && winter) continue;
    }

    const anzahl = Number(zeile.quantity ?? 0);
    if (!anzahl) continue;

    const menge = zeile.calculation_type === 'per_guest'
      ? anzahlGaeste * anzahl
      : anzahl;
    if (menge > 0) mengen[key] = menge;
  }
  return mengen;
};

/**
 * Kosten für einen Satz Mengen.
 *
 * `mengen` sind nach SET-SCHLUESSEL abgelegt, nicht nach Artikelnummer —
 * so, wie sie auch in linen_orders.items stehen.
 */
export const kostenFuerMengen = (
  mengen: Record<string, number>,
  zeilen: SetZeilen,
  artikel: LaundryArticle[],
): Kostenergebnis => {
  const zuordnung = artikelJeZeile(zeilen, artikel);

  // Welche der bestellten Zeilen teilen sich einen Paketartikel?
  const paketGruppen = new Map<string, string[]>();
  for (const key of Object.keys(mengen)) {
    const a = zuordnung[key];
    if (a?.abrechnungsart === 'paket') {
      paketGruppen.set(a.id, [...(paketGruppen.get(a.id) ?? []), key]);
    }
  }

  // Je Paketgruppe rechnet genau eine Zeile ab. Ist keine oder sind mehrere
  // markiert, gewinnt die erste — damit ueberhaupt ein Betrag entsteht.
  const rechnetAb = new Map<string, string>();
  for (const [artikelId, keys] of paketGruppen) {
    const markiert = keys.filter((k) => zeilen[k]?.preis_zaehlt === true);
    rechnetAb.set(artikelId, markiert.length === 1 ? markiert[0] : keys[0]);
  }

  const jeZeile: Record<string, number> = {};
  const ohnePreis: string[] = [];
  let summe = 0;
  let mitPreis = 0;

  for (const [key, menge] of Object.entries(mengen)) {
    const a = zuordnung[key];

    // Im Paket enthalten: kostet 0 — und das ist etwas anderes als
    // "kein Preis". Deshalb NICHT in ohnePreis aufnehmen.
    if (a?.abrechnungsart === 'paket' && rechnetAb.get(a.id) !== key) {
      jeZeile[key] = 0;
      continue;
    }

    const preis = a?.preis ?? null;
    if (typeof preis !== 'number' || preis <= 0) {
      jeZeile[key] = 0;
      ohnePreis.push(key);
      continue;
    }

    const betrag = menge * preis;
    jeZeile[key] = Math.round(betrag * 100) / 100;
    summe += betrag;
    mitPreis++;
  }

  return {
    betrag: mitPreis > 0 ? Math.round(summe * 100) / 100 : null,
    jeZeile,
    ohnePreis,
  };
};
