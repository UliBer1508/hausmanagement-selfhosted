/**
 * Länderspezifische Schulferien & Feiertage für Marktauslastung-Berechnung.
 *
 * getHolidayWeight liefert einen Multiplikator [1.0 .. 1.45] basierend
 * darauf, wie viele der übergebenen Länder am Datum Ferien/Feiertage haben.
 */

type DateRange = { start: string; end: string }; // 'MM-DD' oder 'YYYY-MM-DD'

// Statische jährlich wiederkehrende Ferien-/Feiertagsfenster (MM-DD)
const RECURRING_RANGES: Record<string, DateRange[]> = {
  DE: [
    { start: '07-25', end: '09-10' }, // Sommer (grob NRW/Bayern überschneidend)
    { start: '12-23', end: '01-06' }, // Weihnachten
    { start: '01-01', end: '01-01' },
    { start: '05-01', end: '05-01' },
    { start: '10-03', end: '10-03' },
    { start: '12-25', end: '12-26' },
    // Bayern Pfingstferien (ca.)
    { start: '05-28', end: '06-09' },
    // NRW Herbstferien (ca.)
    { start: '10-04', end: '10-19' },
  ],
  AT: [
    { start: '07-05', end: '09-10' },
    { start: '12-23', end: '01-06' },
    { start: '02-05', end: '02-18' }, // Semesterferien
    { start: '01-01', end: '01-01' },
    { start: '05-01', end: '05-01' },
    { start: '10-26', end: '10-26' },
    { start: '12-25', end: '12-26' },
  ],
  NL: [
    { start: '07-08', end: '09-03' },
    { start: '12-23', end: '01-07' },
    { start: '02-17', end: '03-03' }, // Voorjaarsvakantie
    { start: '10-14', end: '10-29' }, // Herfstvakantie
    { start: '04-27', end: '04-27' }, // Koningsdag
    { start: '01-01', end: '01-01' },
    { start: '05-05', end: '05-05' },
    { start: '12-25', end: '12-26' },
  ],
  CZ: [
    { start: '07-01', end: '08-31' },
    { start: '12-23', end: '01-02' },
    { start: '02-05', end: '03-12' }, // Jarni prazdniny rotierend
    { start: '01-01', end: '01-01' },
    { start: '05-01', end: '05-08' },
    { start: '07-05', end: '07-06' },
    { start: '09-28', end: '09-28' },
    { start: '10-28', end: '10-28' },
    { start: '11-17', end: '11-17' },
    { start: '12-24', end: '12-26' },
  ],
  HU: [
    { start: '06-16', end: '08-31' },
    { start: '12-22', end: '01-02' },
    { start: '03-15', end: '03-15' },
    { start: '05-01', end: '05-01' },
    { start: '08-20', end: '08-20' },
    { start: '10-23', end: '10-23' },
    { start: '12-25', end: '12-26' },
  ],
  PL: [
    { start: '06-22', end: '08-31' },
    { start: '12-23', end: '01-06' },
    { start: '01-01', end: '01-06' },
    { start: '05-01', end: '05-03' },
    { start: '08-15', end: '08-15' },
    { start: '11-01', end: '11-01' },
    { start: '11-11', end: '11-11' },
    { start: '12-25', end: '12-26' },
  ],
};

/** Berechne Ostersonntag (Gauss/Meeus) für ein Jahr. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function inRecurringRange(date: Date, range: DateRange): boolean {
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const { start, end } = range;
  // Überschreitung Jahreswechsel
  if (start > end) return md >= start || md <= end;
  return md >= start && md <= end;
}

/** Ist Datum innerhalb ±3 Tage um Ostersonntag (1 Woche)? */
function isEasterWeek(date: Date): boolean {
  const e = easterSunday(date.getUTCFullYear());
  const diff = Math.abs((date.getTime() - e.getTime()) / 86400000);
  return diff <= 3;
}

function countryHasHoliday(date: Date, country: string): boolean {
  const ranges = RECURRING_RANGES[country];
  if (!ranges) return false;
  if (ranges.some((r) => inRecurringRange(date, r))) return true;
  // Ostern (in allen unterstützten Ländern relevant)
  if (isEasterWeek(date)) return true;
  return false;
}

/**
 * Multiplikator zwischen 1.0 und 1.45.
 * 0 Länder mit Ferien => 1.0
 * 1 Land => 1.10
 * 2 Länder => 1.20
 * 3 Länder => 1.35
 * 4+ Länder => 1.45
 */
export function getHolidayWeight(date: Date, countryCodes: string[]): number {
  if (!countryCodes || countryCodes.length === 0) return 1.0;
  const unique = Array.from(new Set(countryCodes.map((c) => c.toUpperCase())));
  let count = 0;
  for (const c of unique) {
    if (countryHasHoliday(date, c)) count++;
  }
  if (count === 0) return 1.0;
  if (count === 1) return 1.1;
  if (count === 2) return 1.2;
  if (count === 3) return 1.35;
  return 1.45;
}