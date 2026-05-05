import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { toISODate } from '@/lib/dateHelpers';

export interface TenantRentChange {
  id: string;
  house_id: string;
  effective_date: string;
  new_rent: number;
  old_rent?: number;
  new_additional_costs?: number;
  old_additional_costs?: number;
  reason?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export function useTenantRentChanges(houseId?: string) {
  return useQuery({
    queryKey: ['tenant-rent-changes', houseId],
    queryFn: async () => {
      let query = supabase
        .from('tenant_rent_changes')
        .select('*')
        .order('effective_date', { ascending: false });
      
      if (houseId) {
        query = query.eq('house_id', houseId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as TenantRentChange[];
    },
  });
}

export function useCreateRentChange() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (rentChange: Omit<TenantRentChange, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('tenant_rent_changes')
        .insert(rentChange)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-rent-changes'] });
      toast.success('Mietänderung erfolgreich gespeichert');
    },
    onError: (error) => {
      console.error('Error creating rent change:', error);
      toast.error('Fehler beim Speichern der Mietänderung');
    },
  });
}

export function useUpdateRentChange() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TenantRentChange> & { id: string }) => {
      const { data, error } = await supabase
        .from('tenant_rent_changes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-rent-changes'] });
      toast.success('Mietänderung aktualisiert');
    },
    onError: (error) => {
      console.error('Error updating rent change:', error);
      toast.error('Fehler beim Aktualisieren');
    },
  });
}

export function useDeleteRentChange() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tenant_rent_changes')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-rent-changes'] });
      toast.success('Mietänderung gelöscht');
    },
    onError: (error) => {
      console.error('Error deleting rent change:', error);
      toast.error('Fehler beim Löschen');
    },
  });
}

// Helper: Ermittelt die gültige Miete zu einem bestimmten Datum
export function getActiveRent(
  rentChanges: TenantRentChange[],
  baseMontlyRent: number,
  date: Date = new Date()
): number {
  const dateStr = toISODate(date);
  
  // Finde die letzte Mietänderung, die vor oder am Datum wirksam wurde
  const applicableChange = rentChanges
    .filter(rc => rc.effective_date <= dateStr)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  
  return applicableChange ? applicableChange.new_rent : baseMontlyRent;
}

// Helper: Ermittelt die gültigen Nebenkosten zu einem bestimmten Datum
export function getActiveAdditionalCosts(
  rentChanges: TenantRentChange[],
  baseAdditionalCosts: number,
  date: Date = new Date()
): number {
  const dateStr = toISODate(date);
  
  const applicableChange = rentChanges
    .filter(rc => rc.effective_date <= dateStr && rc.new_additional_costs !== null && rc.new_additional_costs !== undefined)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  
  return applicableChange?.new_additional_costs ?? baseAdditionalCosts;
}

// Helper: Gibt zukünftige Mietänderungen zurück
export function getPendingRentChanges(
  rentChanges: TenantRentChange[],
  fromDate: Date = new Date()
): TenantRentChange[] {
  const dateStr = toISODate(fromDate);
  
  return rentChanges
    .filter(rc => rc.effective_date > dateStr)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
}
