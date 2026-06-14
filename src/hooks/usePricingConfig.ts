import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

export interface PricingConfig {
  markup_percentage: number;
  standard_guests: number;
}

export interface AdditionalFees {
  service_fee_per_stay: number;
  tourist_tax_per_night: number;
  cleaning_fee_per_stay: number;
  electricity_fee_per_stay: number;
  linen_fee_per_stay: number;
  vat_percentage: number;
}

export type FeeMode = 'flat' | 'per_person';

export interface FeeItem {
  mode: FeeMode;
  amount: number;
}

export interface AdditionalFeesV2 {
  service_fee: FeeItem;
  tourist_tax: FeeItem;
  cleaning_fee: FeeItem;
  electricity_fee: FeeItem;
  linen_fee: FeeItem;
  vat_percentage: number;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function getDefaultFeesV2(): AdditionalFeesV2 {
  return {
    service_fee: { mode: 'flat', amount: 0 },
    tourist_tax: { mode: 'per_person', amount: 2.5 },
    cleaning_fee: { mode: 'flat', amount: 80 },
    electricity_fee: { mode: 'flat', amount: 40 },
    linen_fee: { mode: 'flat', amount: 30 },
    vat_percentage: 19,
  };
}

/**
 * Normalise stored JSON (flat legacy OR structured v2) into AdditionalFeesV2.
 * Flat values are mapped to mode "flat" and preserved.
 */
export function normalizeFeesV2(raw: any): AdditionalFeesV2 {
  const def = getDefaultFeesV2();
  if (!raw || typeof raw !== 'object') return def;

  const pick = (
    structuredKey: keyof AdditionalFeesV2,
    legacyKey: string,
    fallbackMode: FeeMode,
  ): FeeItem => {
    const v = (raw as any)[structuredKey];
    if (v && typeof v === 'object' && 'amount' in v) {
      const mode: FeeMode = v.mode === 'per_person' ? 'per_person' : 'flat';
      return { mode, amount: r2(Number(v.amount) || 0) };
    }
    const legacy = (raw as any)[legacyKey];
    if (typeof legacy === 'number') {
      return { mode: fallbackMode, amount: r2(legacy) };
    }
    return (def[structuredKey] as FeeItem);
  };

  return {
    service_fee: pick('service_fee', 'service_fee_per_stay', 'flat'),
    // tourist_tax legacy field is per night/person → per_person
    tourist_tax: pick('tourist_tax', 'tourist_tax_per_night', 'per_person'),
    cleaning_fee: pick('cleaning_fee', 'cleaning_fee_per_stay', 'flat'),
    electricity_fee: pick('electricity_fee', 'electricity_fee_per_stay', 'flat'),
    linen_fee: pick('linen_fee', 'linen_fee_per_stay', 'flat'),
    vat_percentage:
      typeof raw.vat_percentage === 'number' ? r2(raw.vat_percentage) : def.vat_percentage,
  };
}

/**
 * Build a legacy-flat representation alongside v2 so older consumers
 * (analytics, calculateFinalPrice) keep working without changes.
 * standardGuests is used as a sensible per-stay equivalent for per_person fees.
 */
export function flattenFeesV2(v2: AdditionalFeesV2, standardGuests = 6): AdditionalFees {
  const flat = (f: FeeItem) =>
    f.mode === 'per_person' ? r2(f.amount * standardGuests) : r2(f.amount);
  return {
    service_fee_per_stay: flat(v2.service_fee),
    // tourist tax is always per-night/person downstream
    tourist_tax_per_night: r2(v2.tourist_tax.amount),
    cleaning_fee_per_stay: flat(v2.cleaning_fee),
    electricity_fee_per_stay: flat(v2.electricity_fee),
    linen_fee_per_stay: flat(v2.linen_fee),
    vat_percentage: v2.vat_percentage,
  };
}

/** Calculate the additional-cost contribution of a single fee item. */
export function calcFeeItem(
  item: FeeItem,
  ctx: { guests: number; nights: number },
  isTouristTax = false,
): number {
  if (item.mode === 'per_person') {
    return isTouristTax
      ? r2(item.amount * ctx.guests * ctx.nights)
      : r2(item.amount * ctx.guests);
  }
  return r2(item.amount);
}

function getDefaultPricingConfig(): PricingConfig {
  return {
    markup_percentage: 0,
    standard_guests: 6,
  };
}

function getDefaultFees(): AdditionalFees {
  return {
    service_fee_per_stay: 0,
    tourist_tax_per_night: 2.50,
    cleaning_fee_per_stay: 80,
    electricity_fee_per_stay: 40,
    linen_fee_per_stay: 30,
    vat_percentage: 19
  };
}

export const usePricingConfig = (houseId: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['pricing-config', houseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('pricing_config')
        .eq('id', houseId)
        .single();
      
      if (error) throw error;
      return (data.pricing_config as unknown as PricingConfig) || getDefaultPricingConfig();
    },
    enabled: !!houseId,
  });

  const { data: fees, isLoading: feesLoading } = useQuery({
    queryKey: ['additional-fees', houseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('additional_fees')
        .eq('id', houseId)
        .single();
      
      if (error) throw error;
      return data.additional_fees as unknown as Record<string, any> | null;
    },
    enabled: !!houseId,
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (newConfig: PricingConfig) => {
      const { error } = await supabase
        .from('houses')
        .update({ pricing_config: newConfig as any })
        .eq('id', houseId);
      
      if (error) throw error;
      return newConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-config', houseId] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      toast({
        title: 'Preisaufschlag gespeichert',
        description: 'Die Einstellungen wurden erfolgreich aktualisiert.',
      });
    },
    onError: (error) => {
      console.error('Error saving pricing config:', error);
      toast({
        title: 'Fehler',
        description: 'Die Einstellungen konnten nicht gespeichert werden.',
        variant: 'destructive',
      });
    },
  });

  const saveFeesMutation = useMutation({
    mutationFn: async (newFees: AdditionalFees | AdditionalFeesV2) => {
      // Detect shape: v2 has the nested objects (service_fee.amount etc.)
      const isV2 =
        newFees &&
        typeof (newFees as any).service_fee === 'object' &&
        (newFees as any).service_fee !== null &&
        'amount' in (newFees as any).service_fee;

      const v2: AdditionalFeesV2 = isV2
        ? (newFees as AdditionalFeesV2)
        : normalizeFeesV2(newFees);
      const flat = flattenFeesV2(v2, config?.standard_guests ?? 6);
      // Persist both shapes so legacy consumers keep working.
      const payload = { ...flat, ...v2 };
      const { error } = await supabase
        .from('houses')
        .update({ additional_fees: payload as any })
        .eq('id', houseId);
      
      if (error) throw error;
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['additional-fees', houseId] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      toast({
        title: 'Nebenkosten gespeichert',
        description: 'Die Einstellungen wurden erfolgreich aktualisiert.',
      });
    },
    onError: (error) => {
      console.error('Error saving fees:', error);
      toast({
        title: 'Fehler',
        description: 'Die Nebenkosten konnten nicht gespeichert werden.',
        variant: 'destructive',
      });
    },
  });

  return {
    config: config || getDefaultPricingConfig(),
    fees: flattenFeesV2(normalizeFeesV2(fees), (config?.standard_guests ?? 6)),
    feesV2: normalizeFeesV2(fees),
    isLoading: configLoading || feesLoading,
    saveConfig: saveConfigMutation.mutate,
    saveFees: saveFeesMutation.mutate,
    isSaving: saveConfigMutation.isPending || saveFeesMutation.isPending,
  };
};

export interface PriceCalculationResult {
  basePrice: number;
  additionalCosts: number;
  subtotal: number;
  markup: number;
  nettoTotal: number;
  vat: number;
  finalPrice: number;
  breakdown: {
    serviceFee: number;
    touristTax: number;
    cleaning: number;
    electricity: number;
    linen: number;
  };
}

export function calculateFinalPrice(
  basePrice: number,
  fees: AdditionalFees,
  markupPercentage: number,
  guests: number = 6,
  nights: number = 7
): PriceCalculationResult {
  const breakdown = {
    serviceFee: fees.service_fee_per_stay,
    touristTax: fees.tourist_tax_per_night * nights * guests,
    cleaning: fees.cleaning_fee_per_stay,
    electricity: fees.electricity_fee_per_stay,
    linen: fees.linen_fee_per_stay,
  };
  
  const additionalCosts = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  const subtotal = basePrice + additionalCosts;
  const markup = subtotal * (markupPercentage / 100);
  const nettoTotal = subtotal + markup;
  const vat = nettoTotal * (fees.vat_percentage / 100);
  const finalPrice = nettoTotal + vat;
  
  return {
    basePrice: Math.round(basePrice * 100) / 100,
    additionalCosts: Math.round(additionalCosts * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    markup: Math.round(markup * 100) / 100,
    nettoTotal: Math.round(nettoTotal * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    finalPrice: Math.round(finalPrice * 100) / 100,
    breakdown,
  };
}
