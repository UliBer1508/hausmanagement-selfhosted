/**
 * Marktsuche je Vermietungsart (23.11.2026).
 *
 * Es gibt ZWEI getrennte Märkte, die nichts miteinander zu tun haben:
 *
 *   touristisch  → Nachtpreise auf Booking.com / Airbnb (Gäste, Zeitraum)
 *                  Vergleichsobjekte: competitor_properties + weekly_pricing
 *   Langzeit     → Kaltmiete je m² auf Immobilienportalen (Wohnfläche, Land)
 *                  Ergebnis: rental_price_analysis
 *
 * Welcher Markt gilt, entscheidet allein `houses.rental_type`.
 * Diese Datei ist die EINE Stelle für:
 *   - die gespeicherten Suchparameter (`houses.scrape_search_params`), getrennt je Markt
 *   - die Immobilienportale je Land für die Mietpreissuche
 * Die Edge Function `scrape-competitor-prices` hat dieselbe Portalliste
 * (Deno kann `src/` nicht importieren) — bei Änderungen BEIDE Stellen anpassen.
 */

export type Market = 'tourist' | 'long_term';

export const marketOf = (rentalType: string | null | undefined): Market =>
  rentalType === 'long_term' ? 'long_term' : 'tourist';

export interface TouristSearchParams {
  location?: string;
  guests?: number;
  platforms?: string[];
}

export interface RentalSearchParams {
  rooms?: number;
  radius_km?: number;
  platforms?: string[];
}

export interface SavedSearchParams {
  tourist?: TouristSearchParams;
  rental?: RentalSearchParams;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Liest `houses.scrape_search_params`. Bis 23.11.2026 lag dort EIN flaches Objekt,
 * das beide Dialogzweige überschrieben haben (beim Venediger Chalet standen nach
 * der Umstellung auf Festvermietung noch Gäste/Ort der Ferienvermietung drin).
 * Altformat: mit `sqm` oder `radius_km` = Langzeit, sonst touristisch.
 * Die Wohnfläche gehört NICHT in die Suchparameter — Quelle ist `houses.living_area_sqm`.
 */
export const readSearchParams = (raw: unknown): SavedSearchParams => {
  if (!isObject(raw)) return {};
  if ('tourist' in raw || 'rental' in raw) {
    return {
      tourist: isObject(raw.tourist) ? (raw.tourist as TouristSearchParams) : undefined,
      rental: isObject(raw.rental) ? (raw.rental as RentalSearchParams) : undefined,
    };
  }
  if ('sqm' in raw || 'radius_km' in raw || 'rooms' in raw) {
    const { rooms, radius_km, platforms } = raw as RentalSearchParams;
    return { rental: { rooms, radius_km, platforms } };
  }
  const { location, guests, platforms } = raw as TouristSearchParams;
  return { tourist: { location, guests, platforms } };
};

/** Speichert die Parameter EINES Marktes, ohne die des anderen zu überschreiben. */
export const writeSearchParams = (
  raw: unknown,
  market: Market,
  params: TouristSearchParams | RentalSearchParams,
): SavedSearchParams => {
  const current = readSearchParams(raw);
  return market === 'long_term'
    ? { ...current, rental: params as RentalSearchParams }
    : { ...current, tourist: params as TouristSearchParams };
};

export type RentalCountry = 'AT' | 'DE';

export const rentalCountryOf = (country: string | null | undefined): RentalCountry =>
  country === 'AT' ? 'AT' : 'DE';

export interface RentalPortal {
  id: string;
  label: string;
}

/** Immobilienportale je Land — gleiche Liste in der Edge Function (RENTAL_PORTALS). */
export const RENTAL_PORTALS: Record<RentalCountry, RentalPortal[]> = {
  AT: [
    { id: 'willhaben', label: 'willhaben' },
    { id: 'immoscout24-at', label: 'ImmoScout24.at' },
    { id: 'derstandard', label: 'derStandard Immobilien' },
    { id: 'immmo', label: 'immmo.at' },
  ],
  DE: [
    { id: 'immoscout24', label: 'ImmoScout24' },
    { id: 'immowelt', label: 'Immowelt' },
    { id: 'ebay-kleinanzeigen', label: 'Kleinanzeigen' },
  ],
};

/** Nur Portale, die es im Land gibt; „alle" bleibt erhalten. */
export const portalsForCountry = (platforms: string[] | undefined, country: RentalCountry): string[] => {
  const known = RENTAL_PORTALS[country].map(p => p.id);
  const valid = (platforms ?? []).filter(p => p === 'alle' || known.includes(p));
  return valid.length > 0 ? valid : ['alle'];
};

/** Standard-Umkreis der Mietpreissuche — ländliche Regionen haben wenige Inserate */
export const DEFAULT_RENTAL_RADIUS_KM = 20;

/** Mögliche Kaltmiete = Wohnfläche × €/m², auf volle 10 € gerundet. */
export const possibleColdRent = (sqm: number | null | undefined, pricePerSqm: number | null | undefined): number | null => {
  const s = Number(sqm ?? 0);
  const p = Number(pricePerSqm ?? 0);
  if (!(s > 0) || !(p > 0)) return null;
  return Math.round((s * p) / 10) * 10;
};
