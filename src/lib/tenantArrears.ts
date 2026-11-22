import type { TenantPayment } from '@/types';

/**
 * Mietrückstand eines festvermieteten Objekts aus `tenant_payments`.
 *
 * EINE Stelle für diese Rechnung (22.11.2026). Genutzt von:
 * - `components/Legal/LegalCaseCard.tsx` (Fenster „Mietrückstand")
 * - `lib/propertyIssues.ts` (Häuser-Tab, Karte „Issues und To-dos")
 *
 * Regel: offene Monatsmieten (`pending`/`overdue`, `payment_type <> 'special'`),
 * die bis heute fällig waren, minus Sonderzahlungen seit dem ältesten offenen
 * Monat. Sonderzahlungen sind noch keinem Monat zugeordnet (geplant:
 * `tenant_payment_allocations`), mindern aber den tatsächlichen Rückstand.
 */
export type ArrearsPayment = Pick<TenantPayment, 'amount' | 'status' | 'due_date' | 'payment_date' | 'payment_type'>;

export interface ArrearsResult {
  /** Anzahl offener Monatsmieten bis heute */
  months: number;
  /** Summe der offenen Monatsmieten */
  openTotal: number;
  /** Sonderzahlungen seit dem ältesten offenen Monat */
  specialTotal: number;
  /** Tatsächlicher Rückstand (nie negativ) */
  rest: number;
  /** Fälligkeit der ältesten offenen Monatsmiete (yyyy-MM-dd) */
  earliest: string;
}

/** @param today Stichtag als 'yyyy-MM-dd' (lokaler Tag) */
export const calculateArrears = (payments: ArrearsPayment[], today: string): ArrearsResult | null => {
  const openRent = payments.filter(p =>
    p.payment_type !== 'special' &&
    (p.status === 'overdue' || p.status === 'pending') &&
    p.due_date <= today,
  );
  if (openRent.length === 0) return null;

  const openTotal = openRent.reduce((s, p) => s + Number(p.amount), 0);
  const earliest = openRent.map(p => p.due_date).sort()[0];
  const specialTotal = payments
    .filter(p => p.payment_type === 'special' && p.status === 'paid' && (p.payment_date ?? p.due_date) >= earliest)
    .reduce((s, p) => s + Number(p.amount), 0);

  return { months: openRent.length, openTotal, specialTotal, rest: Math.max(0, openTotal - specialTotal), earliest };
};
