// Plattform-Aufschlag fuer Edge Functions.
//
// SPIEGELKOPIE von `src/lib/platformMarkup.ts`. Deno kann `src/` nicht
// importieren, deshalb existiert die Logik zweimal. Die Frontend-Datei ist
// die fuehrende Quelle - wer dort etwas aendert, MUSS diese Datei im selben
// Schritt nachziehen. Sonst laufen die beiden Rechenwege auseinander (genau
// der "Doppelgaenger"-Fehler, der den Nachtpreis-Bug vom 06.09.2026
// verursacht hat).
//
// Hintergrund: `bookings.booking_amount` ist die NETTO-AUSZAHLUNG vom Portal,
// nicht der Gastpreis. AirROI-Marktpreise sind Verkaufspreise. Ohne
// Umrechnung vergleicht man zwei verschiedene Einheiten und empfiehlt
// systematisch 15-30 % zu niedrig.

export interface PlatformMarkupSettings {
  default_percent: number;
  by_platform: Record<string, number>;
}

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

export function normalizePlatformKey(platform: string | null | undefined): string {
  const p = String(platform ?? '').trim().toLowerCase();
  if (!p || p === 'unknown' || p === 'none') return '';
  if (p === 'manual') return 'direct';
  return p;
}

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
 * Netto-Auszahlung -> Verkaufspreis.
 * IMMER pro Buchung mit deren eigener Plattform anwenden, BEVOR gemittelt wird.
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

export function netFromGross(
  grossAmount: number,
  platform: string | null | undefined,
  settings?: PlatformMarkupSettings | null,
): number {
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return 0;
  const percent = resolveMarkupPercent(platform, settings);
  return Math.round((grossAmount / (1 + percent / 100)) * 100) / 100;
}

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

/** Laedt die Saetze aus system_settings key `platform_markups`. */
export async function loadPlatformMarkups(supabase: any): Promise<PlatformMarkupSettings> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'platform_markups')
      .maybeSingle();
    return withMarkupDefaults(data?.value as any);
  } catch {
    return DEFAULT_PLATFORM_MARKUPS;
  }
}
