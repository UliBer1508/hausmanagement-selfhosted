import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Types
export interface CompetitorProperty {
  id: string;
  house_id: string;
  competitor_name: string;
  property_name: string;
  property_url?: string;
  platform?: string;
  address?: string;
  distance_km?: number;
  max_guests?: number;
  bedrooms?: number;
  bathrooms?: number;
  amenities?: string[];
  rating?: number;
  review_count?: number;
  normalized_rating?: number;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailyPricing {
  id: string;
  house_id?: string;
  competitor_property_id?: string;
  date: string;
  price: number;
  currency: string;
  min_stay?: number;
  is_available: boolean;
  source: string;
  scraped_at?: string;
}

export interface PriceComparisonData {
  date: string;
  own_price?: number;
  competitor_prices: {
    [competitor_id: string]: {
      price: number;
      property_name: string;
    };
  };
  average_competitor_price?: number;
  price_difference?: number;
  price_difference_percent?: number;
}

// Hook: Lade Wettbewerber für ein Haus
export const useCompetitorProperties = (house_id: string) => {
  return useQuery({
    queryKey: ['competitor-properties', house_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('competitor_properties')
        .select('*')
        .eq('house_id', house_id)
        .eq('is_active', true)
        .order('distance_km', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data as CompetitorProperty[];
    },
    enabled: !!house_id,
  });
};

// Hook: Lade Preisvergleich für einen Zeitraum
export const usePriceComparison = (
  house_id: string, 
  date_from: string, 
  date_to: string
) => {
  return useQuery({
    queryKey: ['price-comparison', house_id, date_from, date_to],
    queryFn: async () => {
      // Lade eigene Preise
      const { data: ownPrices, error: ownError } = await supabase
        .from('daily_pricing')
        .select('*')
        .eq('house_id', house_id)
        .gte('date', date_from)
        .lte('date', date_to)
        .order('date');

      if (ownError) throw ownError;

      // Lade Wettbewerber
      const { data: competitors, error: competitorError } = await supabase
        .from('competitor_properties')
        .select('id, property_name')
        .eq('house_id', house_id)
        .eq('is_active', true);

      if (competitorError) throw competitorError;

      // Lade Wettbewerber-Preise
      const competitorIds = competitors?.map(c => c.id) || [];
      
      let competitorPrices: DailyPricing[] = [];
      if (competitorIds.length > 0) {
        const { data: prices, error: pricesError } = await supabase
          .from('daily_pricing')
          .select('*')
          .in('competitor_property_id', competitorIds)
          .gte('date', date_from)
          .lte('date', date_to)
          .order('date');

        if (pricesError) throw pricesError;
        competitorPrices = prices || [];
      }

      // Gruppiere Preise nach Datum
      const dateMap: { [date: string]: PriceComparisonData } = {};

      // Füge eigene Preise hinzu
      ownPrices?.forEach(price => {
        if (!dateMap[price.date]) {
          dateMap[price.date] = {
            date: price.date,
            competitor_prices: {}
          };
        }
        dateMap[price.date].own_price = price.price;
      });

      // Füge Wettbewerber-Preise hinzu
      competitorPrices.forEach(price => {
        if (!dateMap[price.date]) {
          dateMap[price.date] = {
            date: price.date,
            competitor_prices: {}
          };
        }
        
        const competitor = competitors?.find(c => c.id === price.competitor_property_id);
        if (competitor && price.competitor_property_id) {
          dateMap[price.date].competitor_prices[price.competitor_property_id] = {
            price: price.price,
            property_name: competitor.property_name
          };
        }
      });

      // Berechne Durchschnitte und Differenzen
      const comparisonData: PriceComparisonData[] = Object.values(dateMap).map(data => {
        const competitorPriceValues = Object.values(data.competitor_prices).map(cp => cp.price);
        
        if (competitorPriceValues.length > 0) {
          const avg = competitorPriceValues.reduce((a, b) => a + b, 0) / competitorPriceValues.length;
          data.average_competitor_price = Math.round(avg * 100) / 100;
          
          if (data.own_price && data.average_competitor_price) {
            data.price_difference = Math.round((data.own_price - data.average_competitor_price) * 100) / 100;
            data.price_difference_percent = Math.round((data.price_difference / data.average_competitor_price) * 100 * 100) / 100;
          }
        }
        
        return data;
      });

      // Sortiere nach Datum
      comparisonData.sort((a, b) => a.date.localeCompare(b.date));

      return {
        comparison_data: comparisonData,
        competitors: competitors || [],
        own_prices_count: ownPrices?.length || 0,
        competitor_prices_count: competitorPrices.length
      };
    },
    enabled: !!house_id && !!date_from && !!date_to,
    staleTime: 5 * 60 * 1000, // 5 Minuten
  });
};

// Hook: Suche Wettbewerber mit Perplexity
export const useSearchCompetitors = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ house_id, search_radius_km }: { house_id: string; search_radius_km?: number }) => {
      const { data, error } = await supabase.functions.invoke('search-competitors', {
        body: { house_id, search_radius_km }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Wettbewerber gefunden",
        description: `${data.competitors?.length || 0} potenzielle Wettbewerber entdeckt.`,
      });
      queryClient.invalidateQueries({ queryKey: ['competitor-properties', variables.house_id] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler bei der Suche",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Hook: Füge Wettbewerber hinzu
export const useAddCompetitor = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ house_id, competitor_data, enable_scraping }: any) => {
      const { data, error } = await supabase.functions.invoke('add-competitor', {
        body: { house_id, competitor_data, enable_scraping }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Wettbewerber hinzugefügt",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['competitor-properties', variables.house_id] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Hinzufügen",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Hook: Starte Preis-Scraping
export const useScrapePrices = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('scrape-competitor-prices', {
        body: {}
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const successCount = data.results?.filter((r: any) => r.success).length || 0;
      toast({
        title: "Preis-Scraping abgeschlossen",
        description: `${successCount} Wettbewerber erfolgreich aktualisiert.`,
      });
      queryClient.invalidateQueries({ queryKey: ['price-comparison'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Scraping",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// Hook: Lösche Wettbewerber
export const useDeleteCompetitor = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ competitor_id, house_id }: { competitor_id: string; house_id: string }) => {
      const { error } = await supabase
        .from('competitor_properties')
        .delete()
        .eq('id', competitor_id);

      if (error) throw error;
      return { competitor_id, house_id };
    },
    onSuccess: (data) => {
      toast({
        title: "Wettbewerber gelöscht",
        description: "Der Wettbewerber wurde erfolgreich entfernt.",
      });
      queryClient.invalidateQueries({ queryKey: ['competitor-properties', data.house_id] });
      queryClient.invalidateQueries({ queryKey: ['price-comparison'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Löschen",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
