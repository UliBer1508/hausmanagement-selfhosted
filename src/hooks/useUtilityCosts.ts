import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UtilityCostCategory {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  default_distribution_key: string;
  is_active: boolean;
}

export interface UtilitySettings {
  id: string;
  house_id: string;
  total_area_sqm: number | null;
  tenant_area_sqm: number | null;
  total_units: number;
  tenant_persons: number;
}

export interface UtilityCost {
  id: string;
  house_id: string;
  category_id: string;
  year: number;
  total_amount: number;
  distribution_key: string | null;
  notes: string | null;
  category?: UtilityCostCategory;
}

export interface UtilityCostInput {
  house_id: string;
  category_id: string;
  year: number;
  total_amount: number;
  distribution_key?: string | null;
  notes?: string | null;
}

export interface UtilityStatement {
  id: string;
  house_id: string;
  year: number;
  period_start: string;
  period_end: string;
  total_costs: number;
  tenant_share: number;
  prepayments: number;
  result: number;
  cost_breakdown: CostBreakdownItem[];
  status: 'draft' | 'final' | 'sent';
  generated_at: string;
  sent_at: string | null;
}

export interface CostBreakdownItem {
  category_name: string;
  total_amount: number;
  tenant_share: number;
  distribution_key: string;
  percentage: number;
}

// Distribution key calculation helpers
export const calculateTenantShare = (
  totalAmount: number,
  distributionKey: string,
  settings: UtilitySettings
): { share: number; percentage: number } => {
  const { total_area_sqm, tenant_area_sqm, total_units, tenant_persons } = settings;

  switch (distributionKey) {
    case 'wohnflaeche':
      if (total_area_sqm && tenant_area_sqm) {
        const percentage = (tenant_area_sqm / total_area_sqm) * 100;
        return { share: totalAmount * (percentage / 100), percentage };
      }
      return { share: totalAmount, percentage: 100 };

    case 'personen':
      // Assuming total persons = tenant_persons (single tenant scenario)
      // For multi-tenant, you'd need total_persons in settings
      const totalPersons = tenant_persons * (total_units || 1);
      const personPercentage = (tenant_persons / totalPersons) * 100;
      return { share: totalAmount * (personPercentage / 100), percentage: personPercentage };

    case 'einheiten':
      if (total_units) {
        const unitPercentage = (1 / total_units) * 100;
        return { share: totalAmount * (unitPercentage / 100), percentage: unitPercentage };
      }
      return { share: totalAmount, percentage: 100 };

    case 'verbrauch_70_30':
      // 70% nach Verbrauch (hier vereinfacht nach Fläche), 30% Grundkosten
      if (total_area_sqm && tenant_area_sqm) {
        const areaPercentage = (tenant_area_sqm / total_area_sqm) * 100;
        const percentage = areaPercentage; // Simplified
        return { share: totalAmount * (percentage / 100), percentage };
      }
      return { share: totalAmount, percentage: 100 };

    default:
      return { share: totalAmount, percentage: 100 };
  }
};

export const distributionKeyLabels: Record<string, string> = {
  wohnflaeche: 'Wohnfläche (m²)',
  personen: 'Personenzahl',
  einheiten: 'Wohneinheiten',
  verbrauch_70_30: '70/30 Verbrauch',
};

// Hooks
export const useUtilityCostCategories = () => {
  return useQuery({
    queryKey: ['utility-cost-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('utility_cost_categories')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as UtilityCostCategory[];
    },
  });
};

export const useUtilitySettings = (houseId: string | null) => {
  return useQuery({
    queryKey: ['utility-settings', houseId],
    queryFn: async () => {
      if (!houseId) return null;

      const { data, error } = await supabase
        .from('utility_settings')
        .select('*')
        .eq('house_id', houseId)
        .maybeSingle();

      if (error) throw error;
      return data as UtilitySettings | null;
    },
    enabled: !!houseId,
  });
};

export const useUtilityCosts = (houseId: string | null, year: number) => {
  return useQuery({
    queryKey: ['utility-costs', houseId, year],
    queryFn: async () => {
      if (!houseId) return [];

      const { data, error } = await supabase
        .from('utility_costs')
        .select(`
          *,
          category:utility_cost_categories(*)
        `)
        .eq('house_id', houseId)
        .eq('year', year);

      if (error) throw error;
      return data as UtilityCost[];
    },
    enabled: !!houseId,
  });
};

export const useUtilityStatements = (houseId: string | null) => {
  return useQuery({
    queryKey: ['utility-statements', houseId],
    queryFn: async () => {
      if (!houseId) return [];

      const { data, error } = await supabase
        .from('utility_statements')
        .select('*')
        .eq('house_id', houseId)
        .order('year', { ascending: false });

      if (error) throw error;
      
      // Transform the data to match our interface
      return (data || []).map(stmt => ({
        ...stmt,
        cost_breakdown: (stmt.cost_breakdown as unknown as CostBreakdownItem[]) || [],
      })) as UtilityStatement[];
    },
    enabled: !!houseId,
  });
};

export const useSaveUtilitySettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Omit<UtilitySettings, 'id'> & { id?: string }) => {
      const { data, error } = await supabase
        .from('utility_settings')
        .upsert(settings, { onConflict: 'house_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['utility-settings', variables.house_id] });
      toast.success('Einstellungen gespeichert');
    },
    onError: (error) => {
      toast.error('Fehler beim Speichern: ' + error.message);
    },
  });
};

export const useSaveUtilityCost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cost: UtilityCostInput & { id?: string }) => {
      const { data, error } = await supabase
        .from('utility_costs')
        .upsert({
          ...cost,
          distribution_key: cost.distribution_key || null,
          notes: cost.notes || null,
        }, { onConflict: 'house_id,category_id,year' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['utility-costs', variables.house_id, variables.year] });
    },
    onError: (error) => {
      toast.error('Fehler beim Speichern: ' + error.message);
    },
  });
};

export const useDeleteUtilityCost = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, houseId, year }: { id: string; houseId: string; year: number }) => {
      const { error } = await supabase
        .from('utility_costs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { houseId, year };
    },
    onSuccess: ({ houseId, year }) => {
      queryClient.invalidateQueries({ queryKey: ['utility-costs', houseId, year] });
    },
    onError: (error) => {
      toast.error('Fehler beim Löschen: ' + error.message);
    },
  });
};

export const useGenerateStatement = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      houseId,
      year,
      costs,
      settings,
      prepayments,
    }: {
      houseId: string;
      year: number;
      costs: UtilityCost[];
      settings: UtilitySettings;
      prepayments: number;
    }) => {
      // Calculate breakdown
      const breakdown: CostBreakdownItem[] = costs.map((cost) => {
        const distributionKey = cost.distribution_key || cost.category?.default_distribution_key || 'wohnflaeche';
        const { share, percentage } = calculateTenantShare(cost.total_amount, distributionKey, settings);
        return {
          category_name: cost.category?.name || 'Unbekannt',
          total_amount: cost.total_amount,
          tenant_share: share,
          distribution_key: distributionKey,
          percentage,
        };
      });

      const totalCosts = costs.reduce((sum, c) => sum + c.total_amount, 0);
      const tenantShare = breakdown.reduce((sum, b) => sum + b.tenant_share, 0);
      const result = tenantShare - prepayments;

      const statementData = {
        house_id: houseId,
        year,
        period_start: `${year}-01-01`,
        period_end: `${year}-12-31`,
        total_costs: totalCosts,
        tenant_share: tenantShare,
        prepayments,
        result,
        cost_breakdown: breakdown,
        status: 'draft' as const,
      };

      const { data, error } = await supabase
        .from('utility_statements')
        .upsert(statementData as any, { onConflict: 'house_id,year' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['utility-statements', variables.houseId] });
      toast.success('Abrechnung erstellt');
    },
    onError: (error) => {
      toast.error('Fehler: ' + error.message);
    },
  });
};

export const useUpdateStatementStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status, houseId }: { id: string; status: 'draft' | 'final' | 'sent'; houseId: string }) => {
      const updateData: Record<string, unknown> = { status };
      if (status === 'sent') {
        updateData.sent_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('utility_statements')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { data, houseId };
    },
    onSuccess: ({ houseId }) => {
      queryClient.invalidateQueries({ queryKey: ['utility-statements', houseId] });
      toast.success('Status aktualisiert');
    },
    onError: (error) => {
      toast.error('Fehler: ' + error.message);
    },
  });
};
