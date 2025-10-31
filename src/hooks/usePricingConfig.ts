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
      return (data.additional_fees as unknown as AdditionalFees) || getDefaultFees();
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
    mutationFn: async (newFees: AdditionalFees) => {
      const { error } = await supabase
        .from('houses')
        .update({ additional_fees: newFees as any })
        .eq('id', houseId);
      
      if (error) throw error;
      return newFees;
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
    fees: fees || getDefaultFees(),
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
