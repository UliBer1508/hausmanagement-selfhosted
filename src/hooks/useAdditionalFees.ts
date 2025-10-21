import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface AdditionalFees {
  booking_com: PlatformFees;
  airbnb: PlatformFees;
}

interface PlatformFees {
  service_fee_per_stay: number;
  tourist_tax_per_night: number;
  cleaning_fee_per_stay: number;
  electricity_fee_per_stay: number;
  linen_fee_per_stay: number;
  vat_percentage: number;
}

function getDefaultFees(): AdditionalFees {
  return {
    booking_com: {
      service_fee_per_stay: 0,
      tourist_tax_per_night: 2.50,
      cleaning_fee_per_stay: 80,
      electricity_fee_per_stay: 40,
      linen_fee_per_stay: 30,
      vat_percentage: 19
    },
    airbnb: {
      service_fee_per_stay: 0,
      tourist_tax_per_night: 2.50,
      cleaning_fee_per_stay: 80,
      electricity_fee_per_stay: 40,
      linen_fee_per_stay: 30,
      vat_percentage: 19
    }
  };
}

export const useAdditionalFees = (houseId: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Laden der Nebenkosten
  const { data: fees, isLoading } = useQuery({
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

  // Speichern der Nebenkosten
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
      queryClient.invalidateQueries({ queryKey: ['houses-full'] });
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
    fees: fees || getDefaultFees(),
    isLoading,
    saveFees: saveFeesMutation.mutate,
    isSaving: saveFeesMutation.isPending,
  };
};

// Hilfsfunktion zur Berechnung der Gesamtkosten
export function calculateAdditionalFees(
  fees: PlatformFees, 
  booking: { nights: number; guests: number }
): number {
  const subtotal = 
    fees.service_fee_per_stay +
    fees.tourist_tax_per_night * booking.nights * booking.guests +
    fees.cleaning_fee_per_stay +
    fees.electricity_fee_per_stay +
    fees.linen_fee_per_stay;
  
  return subtotal * (1 + fees.vat_percentage / 100);
}
