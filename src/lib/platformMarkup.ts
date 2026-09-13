// Plattform-Aufschlag: Umrechnung Netto-Auszahlung <-> Verkaufspreis
//
// HINTERGRUND (geklaert mit Uli am 12.09.2026):
// `bookings.booking_amount` enthaelt bei ALLEN Buchungen den Betrag, den Uli
// vom Portal AUSGEZAHLT bekommt - nicht den Preis, den der Gast zahlt. Die
// Portale schlagen ihre Provision oben drauf:
//   - Belvilla: laut Belvilla +30 % (von Uli bezweifelt, vermutlich mehr)
//   - Booking.com / Airbnb / VRBO: 15-30 %
//   - Direktbuchung: 0 % (Uli bekommt den ganzen Betrag)
//
// WARUM DAS WICHTIG IST: Die Preisempfehlung in der Lueckenanalyse wurde
// bisher aus `booking_amount` gerechnet und als Nachtpreis angezeigt. Damit
// war sie in der Einheit "Netto-Auszahlung", waehrend der Wert, den Uli im
// Portal eintraegt, ein VERKAUFSPREIS ist. Folge: die Empfehlung lag
// systematisch 15-30 % zu niedrig, unabhaengig von jedem Marktvergleich.
// Ausserdem sind AirROI-Marktpreise Verkaufspreise - ein Vergleich mit
// Netto-Auszahlungen vergleicht zwei verschiedene Einheiten.
//
// EINZIGE QUELLE DER WAHRHEIT: Diese Datei. Die Edge Functions nutzen die
// spiegelbildliche Kopie in `supabase/functions/_shared/platformMarkup.ts`
// (Deno kann `src/` nicht importieren). Wer hier etwas aendert, MUSS die
// Kopie im selben Schritt nachziehen - sonst laufen die beiden Rechenwege
// auseinander (genau der "Doppelgaenger"-Fehler, der den Bug vom 06.09.
// verursacht hat).

/** Aufschlag-Saetze in Prozent, gespeichert in system_settings key `platform_markups`. */
export interface PlatformMarkupSettings {
  /** Fallback fuer Plattformen ohne eigenen Eintrag und fuer unbekannte/leere Plattform. */
  default_percent: number;
  /** Aufschlag je Plattform-Schluessel (wie in `bookings.platform` gespeichert). */
  by_platform: Record<string, number>;
}

// Startwerte: 25 % ueberall (Uli-Vorgabe 12.09.2026), Direktbuchung 0 %.
// Belvilla gibt selbst 30 % an - in den Einstellungen anpassbar.
export const DEFAULT_PLATFORM_MARKUPS: PlatformMarkupSettings = {
  default_percent: 25,
  by_platform: {
    'belvilla': 25,
    'booking.com': 25,
    'airbnb': 25,
    'vrbo': 25,
    'fewo-direkte': 25,
    'direct': 0,
    'manual': 0,
  },
};

/** Plattformen, die in der Einstellungs-Oberflaeche angeboten werden. */
export const MARKUP_PLATFORM_LABELS: Array<{ key: string; label: string }> = [
  { key: 'belvilla', label: 'Belvilla' },
  { key: 'booking.com', label: 'Booking.com' },
  { key: 'airbnb', label: 'Airbnb' },
  { key: 'vrbo', label: 'VRBO' },
  { key: 'fewo-direkte', label: 'FeWo-direkt' },
  { key: 'direct', label: 'Direktbuchung' },
];

/** Normalisiert einen Plattform-Wert aus der DB auf einen Markup-Schluessel. */
export function normalizePlatformKey(platform: string | null | undefined): string {
  const p = String(platform ?? '').trim().toLowerCase();
  if (!p || p === 'unknown' || p === 'none') return '';
  if (p === 'manual') return 'direct'; // beides = Direktbuchung, siehe getPlatformLabel
  return p;
}

/**
 * Liefert den Aufschlag in Prozent fuer eine Plattform.
 * Unbekannte/leere Plattform -> `default_percent` (konservativ: wir wissen nicht,
 * ob Provision anfiel, nehmen aber an dass ja - sonst empfehlen wir zu niedrig).
 */
export function resolveMarkupPercent(
  platform: string | null | undefined,
  settings?: PlatformMarkupSettings | null,
): number {
  const cfg = settings ?? DEFAULT_PLATFORM_MARKUPS;
  const key = normalizePlatformKey(platform);
  if (!key) return cfg.default_percent;
  const v = cfg.by_platform?.[key];
  return Number.isFinite(v) ? (v as number) : cfg.default_percent;
}

/**
 * Rechnet eine Netto-Auszahlung in den zugehoerigen Verkaufspreis hoch.
 * Verkaufspreis = Auszahlung x (1 + Aufschlag/100)
 *
 * WICHTIG: immer PRO BUCHUNG mit deren eigener Plattform anwenden, BEVOR
 * gemittelt wird. Ein Monatsdurchschnitt mischt Plattformen mit
 * unterschiedlichen Saetzen - ein Aufschlag auf den Durchschnitt waere falsch.
 */
export function grossFromNet(
  netAmount: number,
  platform: string | null | undefined,
  settings?: PlatformMarkupSettings | null,
): number {
  if (!Number.isFinite(netAmount) || netAmount <= 0) return 0;
  const percent = resolveMarkupPercent(platform, settings);
  return Math.round(netAmount * (1 + percent / 100) * 100) / 100;
}

/** Gegenrichtung: was bleibt von einem Verkaufspreis als Auszahlung uebrig. */
export function netFromGross(
  grossAmount: number,
  platform: string | null | undefined,
  settings?: PlatformMarkupSettings | null,
): number {
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return 0;
  const percent = resolveMarkupPercent(platform, settings);
  return Math.round((grossAmount / (1 + percent / 100)) * 100) / 100;
}

/** Fuellt fehlende Felder aus gespeicherten Einstellungen mit den Startwerten auf. */
export function withMarkupDefaults(
  stored?: Partial<PlatformMarkupSettings> | null,
): PlatformMarkupSettings {
  return {
    default_percent: Number.isFinite(stored?.default_percent)
      ? (stored!.default_percent as number)
      : DEFAULT_PLATFORM_MARKUPS.default_percent,
    by_platform: { ...DEFAULT_PLATFORM_MARKUPS.by_platform, ...(stored?.by_platform ?? {}) },
  };
}
