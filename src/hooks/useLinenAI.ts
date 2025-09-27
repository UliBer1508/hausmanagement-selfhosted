import { useState, useCallback, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";

interface AISettings {
  lookahead_bookings: number;
  safety_buffer: number;
  max_storage_ratio: number;
  reorder_threshold: number;
  seasonal_factor: boolean;
  prices: {
    bedding: number;
    large_towels: number;
    small_towels: number;
    bath_mats: number;
    sink_towels: number;
    sauna_towels: number;
  };
}

interface OptimizationResult {
  current_stock: any;
  upcoming_demand: any;
  recommended_stock: any;
  order_suggestion: {
    items: Record<string, any>;
    total_items: number;
    has_urgent_items: boolean;
    estimated_cost: number;
    order_priority: string;
  };
  ai_insights: string[];
  confidence_score: number;
  storage_utilization: number;
}

export const useLinenAI = () => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [aiSettings, setAISettings] = useState<AISettings>({
    lookahead_bookings: 3,
    safety_buffer: 1.2,
    max_storage_ratio: 1.5,
    reorder_threshold: 0.8,
    seasonal_factor: false,
    prices: {
      bedding: 30,
      large_towels: 18,
      small_towels: 10,
      bath_mats: 15,
      sink_towels: 8,
      sauna_towels: 20
    }
  });

  const runOptimization = useCallback(async (houseId: string): Promise<OptimizationResult | null> => {
    setIsOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('optimize-linen-inventory', {
        body: {
          house_id: houseId,
          ai_settings: aiSettings
        }
      });

      if (error) {
        console.error('AI optimization error:', error);
        throw error;
      }

      setOptimization(data);
      return data;

    } catch (error) {
      console.error('Failed to run AI optimization:', error);
      return null;
    } finally {
      setIsOptimizing(false);
    }
  }, [aiSettings]);

  const updateAISettings = useCallback((newSettings: Partial<AISettings>) => {
    setAISettings(prev => ({
      ...prev,
      ...newSettings
    }));
  }, []);

  const saveAISettings = useCallback(async (houseId: string) => {
    try {
      // Speichere AI-Einstellungen in der Datenbank
      const { error } = await supabase
        .from('ai_linen_settings')
        .upsert({
          house_id: houseId,
          lookahead_bookings: aiSettings.lookahead_bookings,
          safety_buffer: aiSettings.safety_buffer,
          max_storage_ratio: aiSettings.max_storage_ratio,
          reorder_threshold: aiSettings.reorder_threshold,
          seasonal_factor: aiSettings.seasonal_factor,
          prices: aiSettings.prices
        });

      if (error) {
        console.error('Error saving AI settings:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to save AI settings:', error);
      return false;
    }
  }, [aiSettings]);

  const loadAISettings = useCallback(async (houseId: string) => {
    try {
      // Lade AI-Einstellungen aus der Datenbank
      const { data, error } = await supabase
        .from('ai_linen_settings')
        .select('*')
        .eq('house_id', houseId)
        .maybeSingle();

      if (error) {
        console.error('Error loading AI settings:', error);
        return;
      }

      if (data) {
        // Sichere Typ-Konvertierung für JSONB prices
        const defaultPrices = {
          bedding: 30,
          large_towels: 18,
          small_towels: 10,
          bath_mats: 15,
          sink_towels: 8,
          sauna_towels: 20
        };

        const prices = data.prices && typeof data.prices === 'object' 
          ? { ...defaultPrices, ...data.prices as any }
          : defaultPrices;

        setAISettings({
          lookahead_bookings: data.lookahead_bookings,
          safety_buffer: data.safety_buffer,
          max_storage_ratio: data.max_storage_ratio,
          reorder_threshold: data.reorder_threshold,
          seasonal_factor: data.seasonal_factor,
          prices
        });
      }
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    }
  }, []);

  const generateOrderFromOptimization = useCallback((optimization: OptimizationResult, houseId: string) => {
    if (!optimization.order_suggestion.items || Object.keys(optimization.order_suggestion.items).length === 0) {
      return null;
    }

    // Generiere Bestellstruktur aus AI-Empfehlung
    const orderItems: any = {};
    
    Object.entries(optimization.order_suggestion.items).forEach(([itemType, details]: [string, any]) => {
      orderItems[itemType] = details.order_quantity;
    });

    return {
      house_id: houseId,
      order_date: new Date().toISOString().split('T')[0],
      delivery_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // +2 Tage
      items: orderItems,
      total_items: optimization.order_suggestion.total_items,
      status: 'pending',
      notes: `KI-generierte Bestellung - Vertrauen: ${(optimization.confidence_score * 100).toFixed(0)}%`,
      delivery_type: 'delivery'
    };
  }, []);

  const getOptimizationSummary = useCallback((optimization: OptimizationResult | null) => {
    if (!optimization) return null;

    const totalCurrent = Object.values(optimization.current_stock).reduce((sum: number, val: any) => sum + (val || 0), 0);
    const totalRecommended = Object.values(optimization.recommended_stock).reduce((sum: number, val: any) => sum + (val || 0), 0);
    const totalOrderNeeded = optimization.order_suggestion.total_items;

    return {
      current_total: totalCurrent,
      recommended_total: totalRecommended,
      order_needed: totalOrderNeeded,
      confidence: optimization.confidence_score,
      storage_efficiency: optimization.storage_utilization,
      has_urgent_orders: optimization.order_suggestion.has_urgent_items,
      estimated_cost: optimization.order_suggestion.estimated_cost,
      insights_count: optimization.ai_insights.length
    };
  }, []);

  return {
    // State
    isOptimizing,
    optimization,
    aiSettings,
    
    // Actions
    runOptimization,
    updateAISettings,
    saveAISettings,
    loadAISettings,
    generateOrderFromOptimization,
    getOptimizationSummary,
    
    // Reset
    clearOptimization: () => setOptimization(null)
  };
};