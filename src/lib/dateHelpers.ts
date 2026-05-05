import { format } from 'date-fns';

/**
 * Returns today's date in local timezone as 'yyyy-MM-dd'.
 * Use this instead of `new Date().toISOString().split('T')[0]`
 * which returns UTC date and may differ at end of day.
 */
export const todayISO = (): string => format(new Date(), 'yyyy-MM-dd');

/**
 * Formats a Date object as 'yyyy-MM-dd' in local timezone.
 * Use this instead of `someDate.toISOString().split('T')[0]`.
 */
export const toISODate = (date: Date | string | number): string =>
  format(new Date(date), 'yyyy-MM-dd');
