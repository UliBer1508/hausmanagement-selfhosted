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

export interface WeeklyPricing {
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
  created_at?: string;
  period_total_price?: number;
  period_check_in?: string;
  period_check_out?: string;
  period_nights?: number;
  is_expanded?: boolean;
}

export interface MonthlyPricing {
  id: string;
  house_id?: string;
  competitor_property_id?: string;
  check_in_date: string;
  check_out_date: string;
  base_price_7nights?: number;
  markup_percentage?: number;
  final_price_7nights?: number;
  currency: string;
  source: string;
  scraped_at?: string;
  created_at?: string;
}

export interface CompetitorPriceHistoryEntry {
  captured_at: string;
  period_start: string;
  period_end: string;
  nights_count: number;
  avg_price: number;
  currency: string;
  source: string;
  price_change_percent?: number;
  entries: WeeklyPricing[];
}

export interface PriceComparisonData {
  date: string;
  check_in?: string;
  check_out?: string;
  nights?: number;
  own_price?: number;
  competitor_prices: {
    [competitor_id: string]: {
      price: number;
      property_name: string;
      check_out?: string;
      nights?: number;
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

// Hook: Lade monatlichen Preisvergleich (15. des Monats)
export const usePriceComparison = (
  house_id: string, 
  date_from: string, 
  date_to: string
) => {
  return useQuery({
    queryKey: ['price-comparison-monthly', house_id, date_from, date_to],
    queryFn: async () => {
      // Lade eigene monatliche Preise
      const { data: ownPrices, error: ownError } = await supabase
        .from('monthly_pricing' as any)
        .select('*')
        .eq('house_id', house_id)
        .is('competitor_property_id', null)
        .gte('check_in_date', date_from)
        .lte('check_in_date', date_to)
        .order('check_in_date') as any;

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
      
      let competitorPrices: MonthlyPricing[] = [];
      if (competitorIds.length > 0) {
        const { data: prices, error: pricesError } = await supabase
          .from('monthly_pricing' as any)
          .select('*')
          .in('competitor_property_id', competitorIds)
          .is('house_id', null)
          .gte('check_in_date', date_from)
          .lte('check_in_date', date_to)
          .order('check_in_date') as any;

        if (pricesError) throw pricesError;
        competitorPrices = (prices || []) as MonthlyPricing[];
      }

      // Gruppiere nach Check-in-Datum
      const periodMap: { [check_in: string]: any } = {};

      // Eigene Preise
      ownPrices?.forEach((price: any) => {
        const checkIn = price.check_in_date;
        if (!periodMap[checkIn]) {
          periodMap[checkIn] = {
            date: checkIn,
            check_in: checkIn,
            check_out: price.check_out_date,
            nights: 7,
            competitor_prices: {}
          };
        }
        periodMap[checkIn].own_price = price.final_price_7nights || price.base_price_7nights;
      });

      // Wettbewerber-Preise
      competitorPrices.forEach((price: any) => {
        const checkIn = price.check_in_date;
        if (!periodMap[checkIn]) {
          periodMap[checkIn] = {
            date: checkIn,
            check_in: checkIn,
            check_out: price.check_out_date,
            nights: 7,
            competitor_prices: {}
          };
        }
        
        const competitor = competitors?.find(c => c.id === price.competitor_property_id);
        if (competitor && price.competitor_property_id) {
          periodMap[checkIn].competitor_prices[price.competitor_property_id] = {
            price: price.base_price_7nights,
            property_name: competitor.property_name,
            check_out: price.check_out_date,
            nights: 7
          };
        }
      });

      // Berechne Durchschnitte
      const comparisonData: PriceComparisonData[] = Object.values(periodMap).map((data: any) => {
        const competitorPriceValues = Object.values(data.competitor_prices).map((cp: any) => cp.price);
        
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

      // Sortiere nach Check-in Datum
      comparisonData.sort((a, b) => a.date.localeCompare(b.date));

      return {
        comparison_data: comparisonData,
        competitors: competitors || [],
        own_prices_count: ownPrices?.length || 0,
        competitor_prices_count: competitorPrices.length
      };
    },
    enabled: !!house_id && !!date_from && !!date_to,
    staleTime: 5 * 60 * 1000,
  });
};

// Hook: Suche Wettbewerber mit Perplexity
export const useSearchCompetitors = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      house_id, 
      search_radius_km,
      min_rating,
      platforms,
      property_types
    }: { 
      house_id: string; 
      search_radius_km?: number;
      min_rating?: number;
      platforms?: string[];
      property_types?: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke('search-competitors', {
        body: { 
          house_id, 
          search_radius_km, 
          min_rating,
          platforms,
          property_types
        }
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
    mutationFn: async ({ 
      house_id, 
      competitor_data, 
      enable_scraping,
      pricing
    }: { 
      house_id: string; 
      competitor_data: any; 
      enable_scraping: boolean;
      pricing?: { checkin: Date; checkout: Date; total: number } | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('add-competitor', {
        body: { house_id, competitor_data, enable_scraping }
      });

      if (error) throw error;
      
      // Wenn Pricing-Daten vorhanden sind, direkt in weekly_pricing speichern
      if (pricing && data.competitor_id) {
        const nights = Math.ceil(
          (pricing.checkout.getTime() - pricing.checkin.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // Speichere als Gesamtpreis (7-Nächte-Periode)
        const weeklyEntry = {
          competitor_property_id: data.competitor_id,
          date: pricing.checkin.toISOString().split('T')[0],
          price: pricing.total,
          period_total_price: pricing.total,
          period_check_in: pricing.checkin.toISOString().split('T')[0],
          period_check_out: pricing.checkout.toISOString().split('T')[0],
          period_nights: nights,
          is_expanded: false,
          currency: 'EUR',
          is_available: true,
          source: 'manual',
          scraped_at: new Date().toISOString(),
        };
        
        // Insert in weekly_pricing
        const { error: pricingError } = await supabase
          .from('weekly_pricing' as any)
          .insert(weeklyEntry);
        
        if (pricingError) {
          console.error('Error inserting pricing data:', pricingError);
          toast({
            title: "Teilweise erfolgreich",
            description: "Wettbewerber gespeichert, aber Preise konnten nicht gespeichert werden",
            variant: "destructive"
          });
        }
      }
      
      return data;
    },
    onSuccess: (data, variables) => {
      const nights = variables.pricing ? Math.ceil(
        (variables.pricing.checkout.getTime() - variables.pricing.checkin.getTime()) / (1000 * 60 * 60 * 24)
      ) : 0;
      
      toast({
        title: "Wettbewerber hinzugefügt",
        description: nights > 0 
          ? `Wettbewerber inkl. ${nights} Nächte Preisdaten gespeichert` 
          : data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['competitor-properties', variables.house_id] });
      queryClient.invalidateQueries({ queryKey: ['price-comparison'] });
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
        body: { manual: true }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const total = data.total || 0;
      const successful = data.successful || 0;
      const failed = data.failed || 0;
      
      if (failed === 0) {
        toast({
          title: "✅ Preise erfolgreich aktualisiert",
          description: `${successful} Wettbewerber wurden gescraped`,
        });
      } else {
        toast({
          title: "⚠️ Scraping teilweise erfolgreich",
          description: `${successful}/${total} erfolgreich, ${failed} fehlgeschlagen`,
          variant: "destructive"
        });
      }
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

// Hook: Aktualisiere Wettbewerber
export const useUpdateCompetitor = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      competitor_id, 
      house_id, 
      competitor_data,
      pricing
    }: { 
      competitor_id: string; 
      house_id: string; 
      competitor_data: any;
      pricing?: { checkin: Date; checkout: Date; total: number } | null;
    }) => {
      const { data, error } = await supabase
        .from('competitor_properties')
        .update({
          competitor_name: competitor_data.competitor_name,
          property_name: competitor_data.property_name,
          property_url: competitor_data.property_url,
          platform: competitor_data.platform,
          address: competitor_data.address,
          distance_km: competitor_data.distance_km,
          max_guests: competitor_data.max_guests,
          bedrooms: competitor_data.bedrooms,
          bathrooms: competitor_data.bathrooms,
          amenities: competitor_data.amenities,
          rating: competitor_data.rating,
          review_count: competitor_data.review_count,
          notes: competitor_data.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', competitor_id)
        .select()
        .single();

      if (error) throw error;
      
      // Wenn Pricing-Daten vorhanden sind, in daily_pricing speichern
      if (pricing) {
        const nights = Math.ceil(
          (pricing.checkout.getTime() - pricing.checkin.getTime()) / (1000 * 60 * 60 * 24)
        );
        const pricePerNight = pricing.total / nights;
        
        // Erstelle Einträge für jeden Tag
        const dailyEntries = [];
        const currentDate = new Date(pricing.checkin);
        
        for (let i = 0; i < nights; i++) {
          dailyEntries.push({
            competitor_property_id: competitor_id,
            date: new Date(currentDate).toISOString().split('T')[0],
            price: pricePerNight,
            currency: 'EUR',
            is_available: true,
            source: 'manual',
            scraped_at: new Date().toISOString(),
          });
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        // Bulk Insert in daily_pricing
        const { error: pricingError } = await supabase
          .from('daily_pricing')
          .insert(dailyEntries);
        
        if (pricingError) {
          console.error('Error inserting pricing data:', pricingError);
          toast({
            title: "Teilweise erfolgreich",
            description: "Wettbewerber aktualisiert, aber Preise konnten nicht gespeichert werden",
            variant: "destructive"
          });
        }
      }
      
      return { data, house_id, nights: pricing ? Math.ceil(
        (pricing.checkout.getTime() - pricing.checkin.getTime()) / (1000 * 60 * 60 * 24)
      ) : 0 };
    },
    onSuccess: (result) => {
      toast({
        title: "Wettbewerber aktualisiert",
        description: result.nights > 0 
          ? `Änderungen gespeichert inkl. ${result.nights} Nächte Preisdaten` 
          : "Die Änderungen wurden erfolgreich gespeichert.",
      });
      queryClient.invalidateQueries({ queryKey: ['competitor-properties', result.house_id] });
      queryClient.invalidateQueries({ queryKey: ['price-comparison'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler beim Aktualisieren",
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

// Hook: Lade Preis-Historie für einen Wettbewerber
export const useCompetitorPriceHistory = (competitor_id: string) => {
  return useQuery({
    queryKey: ['competitor-price-history', competitor_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_pricing' as any)
        .select('*')
        .eq('competitor_property_id', competitor_id)
        .order('scraped_at', { ascending: false, nullsFirst: false }) as any;

      if (error) throw error;
      
      // Gruppiere nach scraped_at (Erfassungszeitpunkt)
      const groupedByCapture: { [key: string]: WeeklyPricing[] } = {};
      
      data?.forEach((entry: any) => {
        const captureDate = entry.scraped_at 
          ? new Date(entry.scraped_at).toISOString().split('T')[0]
          : entry.created_at 
          ? new Date(entry.created_at).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        
        if (!groupedByCapture[captureDate]) {
          groupedByCapture[captureDate] = [];
        }
        groupedByCapture[captureDate].push(entry);
      });
      
      // Berechne Statistiken pro Erfassung
      const history: CompetitorPriceHistoryEntry[] = Object.entries(groupedByCapture).map(([captureDate, entries]) => {
        const prices = entries.map(e => e.price);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const dates = entries.map(e => e.date).sort();
        
        return {
          captured_at: captureDate,
          period_start: dates[0],
          period_end: dates[dates.length - 1],
          nights_count: entries.length,
          avg_price: Math.round(avgPrice * 100) / 100,
          currency: entries[0]?.currency || 'EUR',
          source: entries[0]?.source || 'manual',
          entries: entries
        };
      });
      
      // Sortiere: Neueste zuerst
      history.sort((a, b) => b.captured_at.localeCompare(a.captured_at));
      
      // Berechne Preis-Änderungen
      for (let i = 0; i < history.length - 1; i++) {
        const current = history[i].avg_price;
        const previous = history[i + 1].avg_price;
        const change = ((current - previous) / previous) * 100;
        history[i].price_change_percent = Math.round(change * 10) / 10;
      }
      
      return history;
    },
    enabled: !!competitor_id,
  });
};

// Hook: Update Scraping Params
export const useUpdateScrapingParams = () => {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async ({ house_id, check_in, check_out }: { 
      house_id: string; 
      check_in: string; 
      check_out: string; 
    }) => {
      console.log('[useUpdateScrapingParams] Updating scraping params:', { house_id, check_in, check_out });

      // Alle aktiven Wettbewerber für dieses Haus finden
      const { data: competitors, error: fetchError } = await supabase
        .from('competitor_properties')
        .select('id')
        .eq('house_id', house_id)
        .eq('is_active', true);

      if (fetchError) throw fetchError;

      if (!competitors || competitors.length === 0) {
        throw new Error('Keine aktiven Wettbewerber gefunden');
      }

      console.log(`[useUpdateScrapingParams] Found ${competitors.length} competitors to update`);

      // Scraping-Params für alle Wettbewerber updaten
      const { error: updateError } = await supabase
        .from('price_scraping_config')
        .update({
          scraping_params: { check_in, check_out }
        })
        .in('competitor_property_id', competitors.map(c => c.id));

      if (updateError) throw updateError;

      console.log('[useUpdateScrapingParams] Successfully updated scraping params');
    },
    onError: (error: Error) => {
      console.error('[useUpdateScrapingParams] Error:', error);
      toast({
        title: "Fehler beim Speichern der Parameter",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
