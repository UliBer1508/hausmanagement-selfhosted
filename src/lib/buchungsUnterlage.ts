/**
 * buchungsUnterlage.ts — Buchungsdaten aus einer Portal-Unterlage lesen.
 *
 * Seit 01.10.2026. Zweck: Steht eine Buchung aus einer Buchungsunterlage
 * noch nicht im System, soll „Buchung anlegen" das normale Buchungsformular
 * VORAUSGEFUELLT oeffnen. Gespeichert wird erst, wenn Uli prueft und
 * bestaetigt — ueber denselben Weg wie jede Handeingabe (useBookings),
 * damit Gastanlage, Reinigung und Waesche wie gewohnt laufen.
 *
 * Eingabe ist der Text aus pdfToText() (lib/pdfText.ts), NICHT pdftotext:
 * Die Zeilen sehen dort so aus (an zwei echten Unterlagen belegt,
 * 1FYTQE8D und 1UWK1MG8):
 *
 *   Buchungsnummer 1FYTQE8D Gastname Christoffer Krellwitz
 *   Hauscode AT-5742-64 Anzahl der Gäste 4
 *   Buchungsdatum 30-09-2026 Anzahl der Haustiere 0
 *   Anreise 10-07-2027 Zahlungspolitik Innerhalb 2 Wochen vor dem Aufenthalt
 *   Abreise 17-07-2027
 *   Nettowert der Buchung ¬ 1689,60        (¬ = verlorenes €-Zeichen)
 *   Miete
 *   ¬ 1274,00
 *
 * Bisher nur Belvilla. Weitere Portale bekommen eine eigene Funktion und
 * werden in leseBuchungsUnterlage() eingehaengt — erst, wenn ein echtes
 * Beispiel vorliegt (nicht raten, wie ein Layout aussehen koennte).
 */

export interface GeleseneBuchung {
  portal: 'belvilla';
  nummer: string;
  gast: string;
  gaeste: number;
  haustiere: number;
  /** YYYY-MM-DD */
  anreise: string;
  abreise: string;
  /** Auszahlung an Uli (Nettowert der Buchung) — entspricht bookings.booking_amount. */
  betrag: number | null;
  miete: number | null;
  zusatzkosten: number | null;
  /** Objektnummer beim Portal, z. B. AT-5742-64 */
  hauscode: string | null;
}

const zahl = (s?: string | null): number | null => {
  if (!s) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** 10-07-2027 -> 2027-07-10 */
const isoDatum = (s?: string | null): string | null => {
  const m = s?.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

export function leseBelvillaBuchung(text: string): GeleseneBuchung | null {
  if (!/belvilla/i.test(text) || !/Buchungsübersicht/i.test(text)) return null;

  const kopf = text.match(/Buchungsnummer\s+(\S+)\s+Gastname\s+(.+)$/m);
  const anreise = isoDatum(text.match(/^Anreise\s+(\d{2}-\d{2}-\d{4})/m)?.[1]);
  const abreise = isoDatum(text.match(/^Abreise\s+(\d{2}-\d{2}-\d{4})/m)?.[1]);
  if (!kopf || !anreise || !abreise) return null;

  const betrag = (re: RegExp) => zahl(text.match(re)?.[1]);

  return {
    portal: 'belvilla',
    nummer: kopf[1].trim(),
    gast: kopf[2].trim(),
    gaeste: Number(text.match(/Anzahl der Gäste\s+(\d+)/)?.[1] ?? 0),
    haustiere: Number(text.match(/Anzahl der Haustiere\s+(\d+)/)?.[1] ?? 0),
    anreise,
    abreise,
    betrag: betrag(/Nettowert der Buchung[^\d\n]*([\d.]+,\d{2})/),
    miete: betrag(/^Miete\s*\n[^\d\n]*([\d.]+,\d{2})/m),
    zusatzkosten: betrag(/^Zusätzliche Kosten\s*\n[^\d\n]*([\d.]+,\d{2})/m),
    hauscode: text.match(/Hauscode\s+(\S+)/)?.[1] ?? null,
  };
}

/** Einstieg: probiert alle bekannten Portal-Layouts. */
export function leseBuchungsUnterlage(text: string): GeleseneBuchung | null {
  return leseBelvillaBuchung(text);
}

/** Notiztext fuer die Buchung — woher die Daten stammen und was nicht im Formular Platz hat. */
export function notizAusUnterlage(b: GeleseneBuchung): string {
  const euro = (n: number | null) => (n == null ? null : `${n.toFixed(2).replace('.', ',')} €`);
  const teile = [
    `Aus Belvilla-Buchungsübersicht ${b.nummer}`,
    b.miete != null ? `Miete ${euro(b.miete)}` : null,
    b.zusatzkosten != null ? `Zusatzkosten ${euro(b.zusatzkosten)}` : null,
    b.haustiere > 0 ? `Haustiere: ${b.haustiere}` : null,
  ].filter(Boolean);
  return teile.join(' · ');
}
