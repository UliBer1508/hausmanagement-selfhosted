import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface LinenAutomationSettings {
  id: string;
  is_enabled: boolean;
  lookahead_bookings: number;
  delivery_advance_days: number;
  min_advance_days: number;
  default_provider_id: string | null;
  delivery_timing: 'day_before_cleaning' | 'day_of_cleaning' | 'relative_to_checkin';
  created_at: string;
  updated_at: string;
}

export const useLinenAutomationSettings = () => {
  const queryClient = useQueryClient();

  // Query: Settings laden
  const query = useQuery({
    queryKey: ['linen-automation-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_automation_settings')
        .select('*')
        .single();
      
      if (error) throw error;
      return data as LinenAutomationSettings;
    },
  });

  // Mutation: Settings speichern
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Omit<LinenAutomationSettings, 'id' | 'created_at' | 'updated_at'>>) => {
      const { data, error } = await supabase
        .from('linen_automation_settings')
        .update(updates)
        .eq('id', query.data?.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linen-automation-settings'] });
      toast({
        title: "Einstellungen gespeichert",
        description: "Die Wäsche-Automatisierungseinstellungen wurden erfolgreich aktualisiert.",
      });
    },
    onError: (error) => {
      console.error('Error updating linen automation settings:', error);
      toast({
        title: "Fehler beim Speichern",
        description: "Die Einstellungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updateSettings: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
};
