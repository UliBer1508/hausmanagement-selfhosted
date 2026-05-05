import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const DEFAULT_PRICING_CONFIG = {
  // AirROI Filter
  airroi_room_type: 'entire_home' as 'entire_home' | 'private_room' | 'shared_room',
  airroi_min_bedrooms: 2,
  airroi_num_months: 24 as 6 | 12 | 24 | 36,
  airroi_currency: 'eur' as 'eur' | 'usd' | 'native',

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

const PRICING_KEY = 'pricing_config';

function mergeWithDefaults(value: any): PricingConfig {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PRICING_CONFIG };
  return { ...DEFAULT_PRICING_CONFIG, ...value };
}

export function usePricingSettings() {
  return useQuery({
    queryKey: ['system_settings', PRICING_KEY],
    queryFn: async (): Promise<PricingConfig> => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', PRICING_KEY)
        .maybeSingle();
      if (error) throw error;
      return mergeWithDefaults(data?.value);
    },
  });
}

export function useSavePricingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: PricingConfig) => {
      const { error } = await supabase
        .from('system_settings')
        .upsert(
          { key: PRICING_KEY, value: cfg as any, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        );
      if (error) throw error;
      return cfg;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system_settings', PRICING_KEY] });
    },
  });
}