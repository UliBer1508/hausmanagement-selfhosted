import { describe, it, expect } from 'vitest';
import { leseBuchungsUnterlage, notizAusUnterlage } from '@/lib/buchungsUnterlage';

// Text so, wie pdfToText() ihn aus der echten Belvilla-Unterlage 1FYTQE8D liefert
// (gekuerzt auf die gelesenen Zeilen; ¬ ist das verlorene €-Zeichen).
const BELVILLA = `Buchungsübersicht
1FYTQE8D
Buchungsnummer 1FYTQE8D Gastname Christoffer Krellwitz
Hauscode AT-5742-64 Anzahl der Gäste 4
Buchungsdatum 30-09-2026 Anzahl der Haustiere 0
Anreise 10-07-2027 Zahlungspolitik Innerhalb 2 Wochen vor dem Aufenthalt
Abreise 17-07-2027
Nettowert der Buchung ¬ 1689,60
Miete
¬ 1274,00
Zusätzliche Kosten
¬ 415,60
Belvilla AG`;

describe('leseBuchungsUnterlage (Belvilla)', () => {
  it('liest alle Felder', () => {
    expect(leseBuchungsUnterlage(BELVILLA)).toEqual({
      portal: 'belvilla', nummer: '1FYTQE8D', gast: 'Christoffer Krellwitz',
      gaeste: 4, haustiere: 0, anreise: '2027-07-10', abreise: '2027-07-17',
      betrag: 1689.6, miete: 1274, zusatzkosten: 415.6, hauscode: 'AT-5742-64',
    });
  });

  it('erkennt nur Belvilla-Buchungsuebersichten', () => {
    expect(leseBuchungsUnterlage(BELVILLA.replace('Belvilla AG', 'Booking.com'))).toBeNull();
    expect(leseBuchungsUnterlage('Belvilla AG Rechnung 123')).toBeNull();
  });

  it('Notiz nennt Quelle und Aufteilung, Haustiere nur wenn vorhanden', () => {
    const b = leseBuchungsUnterlage(BELVILLA)!;
    expect(notizAusUnterlage(b)).toBe('Aus Belvilla-Buchungsübersicht 1FYTQE8D · Miete 1274,00 € · Zusatzkosten 415,60 €');
    expect(notizAusUnterlage({ ...b, haustiere: 1 })).toContain('Haustiere: 1');
  });
});
