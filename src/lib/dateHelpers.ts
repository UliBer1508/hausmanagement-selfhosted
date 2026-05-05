import { format } from 'date-fns';

/**
 * Returns today's date in local timezone as 'yyyy-MM-dd'.
 * Use this instead of native ISO+split, which returns UTC and can be off-by-one.
 */
export const todayISO = (): string => format(new Date(), 'yyyy-MM-dd');

/**
 * Formats a Date (or compatible) value as 'yyyy-MM-dd' in local timezone.
 * Use this instead of native ISO+split for consistent local-date strings.
 */
export const toISODate = (date: Date | string | number): string =>
  format(new Date(date), 'yyyy-MM-dd');
