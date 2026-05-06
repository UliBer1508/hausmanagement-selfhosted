// Single source of truth for pricing defaults.
// Imported by both the frontend (src/hooks/usePricingSettings.ts)
// and Supabase Edge Functions (airroi-sync, import-inside-airbnb).
// Keep this file free of any runtime imports (no Deno / browser APIs)
// so it works in both environments.

export const DEFAULT_PRICING_CONFIG = {
  // AirROI Filter
  airroi_room_type: 'entire_home' as 'entire_home' | 'private_room' | 'shared_room',
  airroi_min_bedrooms: 2,
  airroi_num_months: 24 as 6 | 12 | 24 | 36,
  airroi_currency: 'eur' as 'eur' | 'usd' | 'native',

  // AirROI Marktdefinition (direkt an AirROI Markets API)
  airroi_country: 'Austria',
  airroi_region: 'Salzburg',
  airroi_locality: 'Neukirchen am Großvenediger',
  airroi_district: '',

  // Saisonalität (0=Jan ... 11=Dez)
  season_factors: [0.75, 0.78, 0.90, 1.00, 1.10, 1.25, 1.50, 1.55, 1.20, 0.95, 0.80, 1.10] as number[],

  // Wochentag (0=So ... 6=Sa)
  dow_factors: [1.10, 0.80, 0.82, 0.88, 1.00, 1.28, 1.32] as number[],

  // Lead-Time-Stufen [maxTage, Faktor]
  lead_time_steps: [
    [1, 0.75], [3, 0.82], [7, 0.90], [14, 0.96],
    [30, 1.00], [60, 1.05], [120, 1.12], [180, 1.18], [999, 1.22],
  ] as [number, number][],

  // Marktauslastungs-Stufen [maxAuslastung, Faktor]
  occupancy_steps: [
    [0.20, 0.82], [0.40, 0.92], [0.60, 1.00],
    [0.75, 1.12], [0.88, 1.28], [1.00, 1.45],
  ] as [number, number][],

  // Events
  event_factor_small: 1.15,
  event_factor_large: 1.35,
  event_factor_festival: 1.60,

  // Lücken
  gap_factor_1day: 0.82,
  gap_factor_2days: 0.88,
  gap_factor_3plus: 0.94,

  // Grenzen
  price_floor_ratio: 0.55,
  price_ceiling_ratio: 2.80,
};

export type PricingConfig = typeof DEFAULT_PRICING_CONFIG;

export const DEFAULT_SEASON_FACTORS = DEFAULT_PRICING_CONFIG.season_factors;

export const DEFAULT_AIRROI_CONFIG = {
  airroi_room_type: DEFAULT_PRICING_CONFIG.airroi_room_type,
  airroi_min_bedrooms: DEFAULT_PRICING_CONFIG.airroi_min_bedrooms,
  airroi_num_months: DEFAULT_PRICING_CONFIG.airroi_num_months,
  airroi_currency: DEFAULT_PRICING_CONFIG.airroi_currency,
  airroi_country: DEFAULT_PRICING_CONFIG.airroi_country,
  airroi_region: DEFAULT_PRICING_CONFIG.airroi_region,
  airroi_locality: DEFAULT_PRICING_CONFIG.airroi_locality,
  airroi_district: DEFAULT_PRICING_CONFIG.airroi_district,
  season_factors: DEFAULT_PRICING_CONFIG.season_factors,
};