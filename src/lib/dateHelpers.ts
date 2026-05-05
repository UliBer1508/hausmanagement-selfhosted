import { format } from 'date-fns';
import { todayISO, toISODate } from '@/lib/dateHelpers';

/**
 * Returns today's date in local timezone as 'yyyy-MM-dd'.
 * Use this instead of `todayISO()`
 * which returns UTC date and may differ at end of day.
 */
export const todayISO = (): string => format(new Date(), 'yyyy-MM-dd');

/**
 * Formats a Date object as 'yyyy-MM-dd' in local timezone.
 * Use this instead of `toISODate(someDate)`.
 */
export const toISODate = (date: Date | string | number): string =>
  format(new Date(date), 'yyyy-MM-dd');
