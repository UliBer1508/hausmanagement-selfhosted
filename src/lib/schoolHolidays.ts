/**
 * Zweistufiges Ferien-Gewichtungssystem für Marktauslastungs-Berechnungen.
 *
 * Stufe 1: Statische Länder mit verlässlichen, jährlich wiederkehrenden
 *          Ferienzeiträumen (DE, AT, NL, CZ, PL, HU, CH, BE, FR, IT).
 * Stufe 2: Länder mit mondkalenderabhängigen Ferien (IL, SA, AE, KW, QA,
 *          BH, JO, EG). Hier werden nur grobe saisonale Reisemuster
 *          modelliert — das sind APPROXIMATIONEN, keine exakten Feriendaten.
 */

type DateRange = { start: string; end: string }; // 'MM-DD'

// ───────────── Stufe 1: Statische Ferienzeiträume ─────────────
// Pro Land grob zusammengefasst: Sommerferien, Weihnachten, Herbst-/
// Frühjahrsferien (wo relevant) sowie wichtigste nationale Feiertage.
const STATIC_RANGES: Record<string, DateRange[]> = {
  // Deutschland — Bayern + NRW kombiniert (häufigste Quellmärkte)
  DE: [
    // Bayern Sommerferien (Ende Juli – Mitte September)
    { start: '07-29', end: '09-13' },
    // NRW Sommerferien (Mitte Juli – Ende August)
    { start: '07-15', end: '08-30' },
    // Bayern Pfingstferien
    { start: '05-28', end: '06-09' },
    // NRW Herbstferien
    { start: '10-04', end: '10-19' },
    // Bayern Herbstferien
    { start: '10-27', end: '11-03' },
    // Weihnachten
    { start: '12-23', end: '01-06' },
    // Nationale Feiertage
    { start: '01-01', end: '01-01' },
    { start: '05-01', end: '05-01' },
    { start: '10-03', end: '10-03' },
    { start: '12-25', end: '12-26' },
  ],
  AT: [
    { start: '07-05', end: '09-10' },     // Sommerferien
    { start: '12-23', end: '01-06' },
    { start: '02-05', end: '02-18' },     // Semesterferien
    { start: '10-26', end: '11-02' },     // Herbstferien
    { start: '01-01', end: '01-01' },
    { start: '05-01', end: '05-01' },
    { start: '12-25', end: '12-26' },
  ],
  NL: [
    { start: '07-08', end: '09-03' },     // Zomervakantie
    { start: '12-23', end: '01-07' },
    { start: '02-17', end: '03-03' },     // Voorjaarsvakantie
    { start: '04-27', end: '05-05' },     // Meivakantie + Koningsdag
    { start: '10-14', end: '10-29' },     // Herfstvakantie
    { start: '01-01', end: '01-01' },
    { start: '12-25', end: '12-26' },
  ],
  CZ: [
    { start: '07-01', end: '08-31' },     // Hlavni prazdniny
    { start: '12-23', end: '01-02' },
    { start: '02-05', end: '03-12' },     // Jarni prazdniny (rotierend, Spannweite)
    { start: '01-01', end: '01-01' },
    { start: '05-01', end: '05-08' },
    { start: '07-05', end: '07-06' },
    { start: '09-28', end: '09-28' },
    { start: '10-28', end: '10-28' },
    { start: '11-17', end: '11-17' },
    { start: '12-24', end: '12-26' },
  ],
  PL: [
    { start: '06-22', end: '08-31' },     // Wakacje
    { start: '12-23', end: '01-06' },
    { start: '01-15', end: '02-28' },     // Ferie zimowe (rotierend, Spannweite)
    { start: '05-01', end: '05-03' },
    { start: '08-15', end: '08-15' },
    { start: '11-01', end: '11-01' },
    { start: '11-11', end: '11-11' },
    { start: '12-25', end: '12-26' },
  ],
  HU: [
    { start: '06-16', end: '08-31' },     // Nyari szunet
    { start: '12-22', end: '01-02' },
    { start: '03-15', end: '03-15' },
    { start: '05-01', end: '05-01' },
    { start: '08-20', end: '08-20' },
    { start: '10-23', end: '10-23' },
    { start: '12-25', end: '12-26' },
  ],
  CH: [
    { start: '07-05', end: '08-17' },     // Sommerferien (kantonal stark variabel)
    { start: '12-22', end: '01-04' },
    { start: '02-08', end: '02-23' },     // Sportferien
    { start: '01-01', end: '01-02' },
    { start: '08-01', end: '08-01' },     // Bundesfeier
    { start: '12-25', end: '12-26' },
  ],
  BE: [
    { start: '07-01', end: '08-31' },     // Grandes vacances
    { start: '12-23', end: '01-07' },
    { start: '02-24', end: '03-09' },     // Carnaval
    { start: '10-27', end: '11-04' },     // Toussaint
    { start: '07-21', end: '07-21' },     // Nationalfeiertag
    { start: '11-11', end: '11-11' },
    { start: '12-25', end: '12-26' },
  ],
  FR: [
    { start: '07-05', end: '09-01' },     // Grandes vacances
    { start: '12-20', end: '01-05' },
    { start: '02-08', end: '03-09' },     // Vacances d'hiver (rotierend, Spannweite)
    { start: '10-18', end: '11-03' },     // Toussaint
    { start: '05-01', end: '05-01' },
    { start: '05-08', end: '05-08' },
    { start: '07-14', end: '07-14' },
    { start: '08-15', end: '08-15' },
    { start: '11-11', end: '11-11' },
    { start: '12-25', end: '12-26' },
  ],
  IT: [
    { start: '06-10', end: '09-12' },     // Vacanze estive
    { start: '12-23', end: '01-06' },
    { start: '01-01', end: '01-01' },
    { start: '04-25', end: '04-25' },
    { start: '05-01', end: '05-01' },
    { start: '06-02', end: '06-02' },
    { start: '08-15', end: '08-15' },
    { start: '11-01', end: '11-01' },
    { start: '12-08', end: '12-08' },
    { start: '12-25', end: '12-26' },
  ],
};

const STATIC_CODES = new Set(Object.keys(STATIC_RANGES));
const DYNAMIC_CODES = new Set(['IL', 'SA', 'AE', 'KW', 'QA', 'BH', 'JO', 'EG']);

// ───────────── Normalisierung von Freitext-Nationalitäten ─────────────
const COUNTRY_ALIASES: Record<string, string> = {
  // DE
  'DE': 'DE', 'DEU': 'DE', 'GER': 'DE',
  'DEUTSCHLAND': 'DE', 'GERMANY': 'DE', 'ALEMANIA': 'DE',
  // AT
  'AT': 'AT', 'AUT': 'AT', 'OESTERREICH': 'AT', 'ÖSTERREICH': 'AT', 'AUSTRIA': 'AT',
  // NL
  'NL': 'NL', 'NLD': 'NL', 'NIEDERLANDE': 'NL', 'NETHERLANDS': 'NL', 'HOLLAND': 'NL', 'NEDERLAND': 'NL',
  // CZ
  'CZ': 'CZ', 'CZE': 'CZ', 'TSCHECHIEN': 'CZ', 'CZECH REPUBLIC': 'CZ', 'CZECHIA': 'CZ', 'CESKO': 'CZ',
  // PL
  'PL': 'PL', 'POL': 'PL', 'POLEN': 'PL', 'POLAND': 'PL', 'POLSKA': 'PL',
  // HU
  'HU': 'HU', 'HUN': 'HU', 'UNGARN': 'HU', 'HUNGARY': 'HU', 'MAGYARORSZAG': 'HU',
  // CH
  'CH': 'CH', 'CHE': 'CH', 'SCHWEIZ': 'CH', 'SWITZERLAND': 'CH', 'SUISSE': 'CH', 'SVIZZERA': 'CH',
  // BE
  'BE': 'BE', 'BEL': 'BE', 'BELGIEN': 'BE', 'BELGIUM': 'BE', 'BELGIQUE': 'BE', 'BELGIE': 'BE',
  // FR
  'FR': 'FR', 'FRA': 'FR', 'FRANKREICH': 'FR', 'FRANCE': 'FR',
  // IT
  'IT': 'IT', 'ITA': 'IT', 'ITALIEN': 'IT', 'ITALY': 'IT', 'ITALIA': 'IT',
  // IL
  'IL': 'IL', 'ISR': 'IL', 'ISRAEL': 'IL',
  // SA
  'SA': 'SA', 'SAU': 'SA', 'KSA': 'SA', 'SAUDI ARABIA': 'SA', 'SAUDI-ARABIEN': 'SA', 'SAUDIARABIEN': 'SA',
  // AE
  'AE': 'AE', 'ARE': 'AE', 'UAE': 'AE', 'UNITED ARAB EMIRATES': 'AE',
  'VAE': 'AE', 'VEREINIGTE ARABISCHE EMIRATE': 'AE',
  // KW
  'KW': 'KW', 'KWT': 'KW', 'KUWAIT': 'KW',
  // QA
  'QA': 'QA', 'QAT': 'QA', 'QATAR': 'QA', 'KATAR': 'QA',
  // BH
  'BH': 'BH', 'BHR': 'BH', 'BAHRAIN': 'BH',
  // JO
  'JO': 'JO', 'JOR': 'JO', 'JORDAN': 'JO', 'JORDANIEN': 'JO',
  // EG
  'EG': 'EG', 'EGY': 'EG', 'EGYPT': 'EG', 'AEGYPTEN': 'EG', 'ÄGYPTEN': 'EG', 'AGYPTEN': 'EG',
};

/** Mapped einen Freitext-Wert auf einen ISO-2-Code oder null wenn unbekannt. */
export function normalizeCountryCode(input: string): string | null {
  if (!input) return null;
  const key = input.trim().toUpperCase();
  if (!key) return null;
  return COUNTRY_ALIASES[key] ?? null;
}

// ───────────── Helpers ─────────────
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

function inRange(date: Date, range: DateRange): boolean {
  const md = `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const { start, end } = range;
  if (start > end) return md >= start || md <= end; // Jahreswechsel
  return md >= start && md <= end;
}

function isEasterWeek(date: Date): boolean {
  const e = easterSunday(date.getUTCFullYear());
  // UTC-Tagesgrenze vergleichen, damit Lokalzeit-Offsets nicht zu Off-by-one fuehren
  const dateUtcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const diff = Math.abs((dateUtcMidnight - e.getTime()) / 86400000);
  return diff <= 3;
}

function staticCountryHasHoliday(date: Date, code: string): boolean {
  const ranges = STATIC_RANGES[code];
  if (!ranges) return false;
  if (ranges.some((r) => inRange(date, r))) return true;
  if (isEasterWeek(date)) return true;
  return false;
}

// ───────────── Stufe 1 ─────────────
/**
 * Multiplikator [1.0 .. 1.40] basierend auf Anzahl der Stufe-1-Länder
 * mit Ferien/Feiertag am Datum.
 * 0 → 1.0, 1 → 1.10, 2 → 1.20, 3 → 1.30, 4+ → 1.40
 */
export function getStaticHolidayWeight(date: Date, countryCodes: string[]): number {
  if (!countryCodes || countryCodes.length === 0) return 1.0;
  const unique = Array.from(new Set(countryCodes.map((c) => c.toUpperCase())))
    .filter((c) => STATIC_CODES.has(c));
  let count = 0;
  for (const c of unique) {
    if (staticCountryHasHoliday(date, c)) count++;
  }
  if (count === 0) return 1.0;
  if (count === 1) return 1.10;
  if (count === 2) return 1.20;
  if (count === 3) return 1.30;
  return 1.40;
}

// ───────────── Stufe 2 ─────────────
/**
 * Approximation für Länder mit mondkalenderabhängigen Ferien (Ramadan, Eid,
 * Pessach, etc.). Diese Werte sind grobe saisonale Reisemuster und KEINE
 * exakten Feriendaten — eine präzise Berechnung erfordert eine externe
 * Kalender-API mit jährlich aktualisierten Daten.
 *
 * - Juli/August → 1.20 (Sommerflucht aus Hitze, klassische Eid-Reisesaison)
 * - Dezember   → 1.10 (Winterreisen)
 * - Sonst       → 1.0
 *
 * Der Wert skaliert nicht mit der Anzahl Länder, da das Reisemuster regional
 * sehr ähnlich ist.
 */
export function getDynamicHolidayWeight(date: Date, countryCodes: string[]): number {
  if (!countryCodes || countryCodes.length === 0) return 1.0;
  const hasDynamic = countryCodes
    .map((c) => c.toUpperCase())
    .some((c) => DYNAMIC_CODES.has(c));
  if (!hasDynamic) return 1.0;
  const month = date.getUTCMonth(); // 0-basiert, UTC-konsistent
  if (month === 6 || month === 7) return 1.20; // Juli/August
  if (month === 11) return 1.10;               // Dezember
  return 1.0;
}

// ───────────── Hauptfunktion ─────────────
/**
 * Kombiniert Stufe 1 (statisch) und Stufe 2 (dynamisch). Da sich Effekte
 * (z.B. Sommer in Europa und im Nahen Osten) überlappen würden, wird das
 * Maximum statt der Summe verwendet.
 */
export function getHolidayWeight(date: Date, countryCodes: string[]): number {
  if (!countryCodes || countryCodes.length === 0) return 1.0;

  const normalized = countryCodes
    .map((c) => normalizeCountryCode(c))
    .filter((c): c is string => c !== null);

  if (normalized.length === 0) return 1.0;

  const staticCodes = normalized.filter((c) => STATIC_CODES.has(c));
  const dynamicCodes = normalized.filter((c) => DYNAMIC_CODES.has(c));

  const w1 = getStaticHolidayWeight(date, staticCodes);
  const w2 = getDynamicHolidayWeight(date, dynamicCodes);
  return Math.max(w1, w2);
}