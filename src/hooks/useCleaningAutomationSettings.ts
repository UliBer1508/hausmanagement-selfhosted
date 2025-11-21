import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface CleaningAutomationSettings {
  id: string;
  default_provider_id: string | null;
  schedule_timing: 'on_checkin' | 'on_checkout';
  default_time: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const useCleaningAutomationSettings = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['cleaning-automation-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleaning_automation_settings')
        .select('*')
        .single();
      
      if (error) throw error;
      return data as CleaningAutomationSettings;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Omit<CleaningAutomationSettings, 'id' | 'created_at' | 'updated_at'>>) => {
      const { data, error } = await supabase
        .from('cleaning_automation_settings')
        .update(updates)
        .eq('id', query.data?.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cleaning-automation-settings'] });
      toast({
        title: "Einstellungen gespeichert",
        description: "Die Automatisierungseinstellungen wurden erfolgreich aktualisiert.",
      });
    },
    onError: (error) => {
      console.error('Error updating automation settings:', error);
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
