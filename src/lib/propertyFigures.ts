import { differenceInCalendarDays, differenceInYears, parseISO } from 'date-fns';
import type { ArrearsPayment } from '@/lib/tenantArrears';

/**
 * Kennzahlen je Objekt für die Karte „Objekt" im Häuser-Tab (22.11.2026).
 * Reine Rechnung — Daten lädt `hooks/usePropertyStatus.ts`.
 *
 * Festvermietung (aus `tenant_payments`):
 * - Mieteinnahmen im laufenden Jahr = bezahlte Zahlungen (Monatsmiete UND
 *   Sonderzahlung) mit Eingangsdatum im Jahr. Fehlt das Datum: Fälligkeit.
 * - Jahresmiete Soll = heutige Warmmiete × 12 (Mietänderungen berücksichtigt).
 * - Kaltmiete je m² = heutige Kaltmiete / Wohnfläche.
 *
 * Buchungen (aus `bookings`, Anreise im laufenden Jahr, ohne Stornos):
 * - `booking_amount` ist die AUSZAHLUNG des Portals, nicht der Gastpreis
 *   (Geschäftsregel 12.09.2026) — deshalb „Auszahlungen", nicht „Umsatz".
 * - Belegung = gebuchte Nächte / Tage des Jahres (inkl. künftiger Buchungen).
 */

export interface FigureBooking {
  check_in: string;
  check_out: string;
  booking_amount: number | null;
}

export interface PropertyFigures {
  year: number;
  /** Festvermietung: eingegangene Zahlungen im Jahr */
  rentReceivedYear: number;
  /** Festvermietung: heutige Warmmiete × 12 */
  rentTargetYear: number;
  /** Kaltmiete je m² (0, wenn keine Fläche) */
  coldRentPerSqm: number;
  /** Volle Jahre seit Vertragsbeginn (null ohne Datum) */
  tenantYears: number | null;
  /** Buchungen mit Anreise im Jahr */
  bookingsYear: number;
  nightsYear: number;
  payoutYear: number;
  /** Gebuchte Nächte / Tage des Jahres in Prozent */
  occupancyYear: number;
}

export interface PropertyFigureInput {
  payments: ArrearsPayment[];
  bookings: FigureBooking[];
  activeRent: number;
  activeAdditionalCosts: number;
  livingAreaSqm: number;
  contractStart: string | null;
  today: Date;
}

export const buildPropertyFigures = (input: PropertyFigureInput): PropertyFigures => {
  const { payments, bookings, activeRent, activeAdditionalCosts, livingAreaSqm, contractStart, today } = input;
  const year = today.getFullYear();
  const yearPrefix = String(year);

  const rentReceivedYear = payments
    .filter(p => p.status === 'paid' && (p.payment_date ?? p.due_date)?.startsWith(yearPrefix))
    .reduce((s, p) => s + Number(p.amount), 0);

  const yearBookings = bookings.filter(b => b.check_in.startsWith(yearPrefix));
  const nightsYear = yearBookings.reduce(
    (s, b) => s + Math.max(0, differenceInCalendarDays(parseISO(b.check_out.slice(0, 10)), parseISO(b.check_in.slice(0, 10)))),
    0,
  );
  const daysInYear = differenceInCalendarDays(new Date(year + 1, 0, 1), new Date(year, 0, 1));

  return {
    year,
    rentReceivedYear,
    rentTargetYear: (activeRent + activeAdditionalCosts) * 12,
    coldRentPerSqm: livingAreaSqm > 0 && activeRent > 0 ? activeRent / livingAreaSqm : 0,
    tenantYears: contractStart ? Math.max(0, differenceInYears(today, parseISO(contractStart))) : null,
    bookingsYear: yearBookings.length,
    nightsYear,
    payoutYear: yearBookings.reduce((s, b) => s + Number(b.booking_amount ?? 0), 0),
    occupancyYear: Math.round((nightsYear / daysInYear) * 100),
  };
};
