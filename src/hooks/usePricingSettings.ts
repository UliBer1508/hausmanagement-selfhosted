import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_PRICING_CONFIG,
  type PricingConfig,
} from '../../supabase/functions/_shared/pricingDefaults';

export { DEFAULT_PRICING_CONFIG };
export type { PricingConfig };

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