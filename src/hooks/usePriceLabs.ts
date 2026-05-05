import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PriceLabsListing {
  id: string;
  listing_id: string;
  pms: string;
  name: string;
  base_price?: number;
  min_price?: number;
  max_price?: number;
  health_score?: string;
}

export interface PriceLabsLinkedListing {
  id: string;
  house_id: string;
  pricelabs_listing_id: string;
  pms_name: string | null;
  listing_name: string | null;
  base_price: number | null;
  min_price: number | null;
  max_price: number | null;
  health_score: string | null;
  last_synced_at: string | null;
}

export interface PriceLabsMarketData {
  id: string;
  house_id: string;
  pricelabs_listing_id: string;
  data_date: string;
  neighborhood_data: any;
  fetched_at: string;
}

// Fetch all PriceLabs listings from API
export const usePriceLabsListings = () => {
  return useQuery({
    queryKey: ['pricelabs-listings'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('pricelabs-sync', {
        body: { action: 'list-listings' }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      // PriceLabs returns listings array
      return (data?.listings || data || []) as PriceLabsListing[];
    },
    staleTime: 10 * 60 * 1000, // 10 min cache
    retry: 1,
  });
};

// Fetch linked listings from DB for a house
export const useLinkedListings = (house_id: string) => {
  return useQuery({
    queryKey: ['pricelabs-linked', house_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pricelabs_listings')
        .select('*')
        .eq('house_id', house_id);

      if (error) throw error;
      return data as PriceLabsLinkedListing[];
    },
    enabled: !!house_id,
  });
};

// Link a PriceLabs listing to a house
export const useLinkListing = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ house_id, listing }: { house_id: string; listing: PriceLabsListing }) => {
      const { data, error } = await supabase
        .from('pricelabs_listings')
        .upsert({
          house_id,
          pricelabs_listing_id: listing.listing_id || listing.id,
          pms_name: listing.pms,
          listing_name: listing.name,
          base_price: listing.base_price,
          min_price: listing.min_price,
          max_price: listing.max_price,
          health_score: listing.health_score,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: 'house_id,pricelabs_listing_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Listing verknüpft",
        description: `PriceLabs Listing wurde mit dem Haus verknüpft.`,
      });
      queryClient.invalidateQueries({ queryKey: ['pricelabs-linked', variables.house_id] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Verknüpfen",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Unlink a listing
export const useUnlinkListing = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, house_id }: { id: string; house_id: string }) => {
      const { error } = await supabase
        .from('pricelabs_listings')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { house_id };
    },
    onSuccess: (data) => {
      toast({ title: "Listing-Verknüpfung entfernt" });
      queryClient.invalidateQueries({ queryKey: ['pricelabs-linked', data.house_id] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Sync neighborhood data for a listing
export const useSyncNeighborhood = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ house_id, listing_id, pms }: { house_id: string; listing_id: string; pms?: string }) => {
      const { data, error } = await supabase.functions.invoke('pricelabs-sync', {
        body: { action: 'get-neighborhood', listing_id, pms }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Cache in DB
      const { error: insertError } = await supabase
        .from('pricelabs_market_data')
        .insert({
          house_id,
          pricelabs_listing_id: listing_id,
          data_date: new Date().toISOString().split('T')[0],
          neighborhood_data: data,
          fetched_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Error caching market data:', insertError);
      }

      // Update last_synced_at on linked listing
      await supabase
        .from('pricelabs_listings')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('house_id', house_id)
        .eq('pricelabs_listing_id', listing_id);

      return data;
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Marktdaten aktualisiert",
        description: "Neighborhood Data wurde erfolgreich geladen.",
      });
      queryClient.invalidateQueries({ queryKey: ['pricelabs-market-data', variables.house_id] });
      queryClient.invalidateQueries({ queryKey: ['pricelabs-linked', variables.house_id] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Laden der Marktdaten",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Fetch cached market data from DB
export const usePriceLabsMarketData = (house_id: string) => {
  return useQuery({
    queryKey: ['pricelabs-market-data', house_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pricelabs_market_data')
        .select('*')
        .eq('house_id', house_id)
        .order('fetched_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      return (data?.[0] || null) as PriceLabsMarketData | null;
    },
    enabled: !!house_id,
  });
};

// ─── House pricing config (base/min/max + calibration) ───────────────────────
export interface HousePricingConfig {
  base_price?: number;
  min_price?: number;
  max_price?: number;
  calibration?: any;
}

export const useHousePricingConfig = (house_id: string) => {
  return useQuery({
    queryKey: ['house-pricing-config', house_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('pricing_config')
        .eq('id', house_id)
        .maybeSingle();
      if (error) throw error;
      return ((data?.pricing_config as any) ?? {}) as HousePricingConfig;
    },
    enabled: !!house_id,
  });
};

export const useSaveHousePricingConfig = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ house_id, config }: { house_id: string; config: HousePricingConfig }) => {
      const { data: existing, error: rErr } = await supabase
        .from('houses').select('pricing_config').eq('id', house_id).maybeSingle();
      if (rErr) throw rErr;
      const merged = { ...((existing?.pricing_config as any) ?? {}), ...config };
      const { error } = await supabase
        .from('houses').update({ pricing_config: merged }).eq('id', house_id);
      if (error) throw error;
      return merged;
    },
    onSuccess: (_d, vars) => {
      toast({ title: 'Preiskonfiguration gespeichert' });
      queryClient.invalidateQueries({ queryKey: ['house-pricing-config', vars.house_id] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
    },
    onError: (e: Error) => {
      toast({ title: 'Fehler beim Speichern', description: e.message, variant: 'destructive' });
    },
  });
};
