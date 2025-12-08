import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ExternalArticleMapping {
  id: string;
  internal_item_key: string;
  external_artikelnummer: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useExternalArticleMapping = () => {
  const queryClient = useQueryClient();

  // Query: Load all mappings
  const query = useQuery({
    queryKey: ['external-article-mapping'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_article_mapping')
        .select('*')
        .order('internal_item_key');
      
      if (error) throw error;
      return data as ExternalArticleMapping[];
    },
  });

  // Mutation: Upsert mapping (create or update)
  const upsertMutation = useMutation({
    mutationFn: async (mapping: { internal_item_key: string; external_artikelnummer: string }) => {
      // Check if mapping exists
      const { data: existing } = await supabase
        .from('external_article_mapping')
        .select('id')
        .eq('internal_item_key', mapping.internal_item_key)
        .single();

      if (existing) {
        // Update
        const { error } = await supabase
          .from('external_article_mapping')
          .update({ 
            external_artikelnummer: mapping.external_artikelnummer,
            is_active: true 
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('external_article_mapping')
          .insert({
            internal_item_key: mapping.internal_item_key,
            external_artikelnummer: mapping.external_artikelnummer,
            is_active: true
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-article-mapping'] });
    },
    onError: (error) => {
      console.error('Error upserting mapping:', error);
      toast({
        title: "Fehler beim Speichern",
        description: "Das Artikel-Mapping konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  // Mutation: Save multiple mappings at once
  const saveMappingsMutation = useMutation({
    mutationFn: async (mappings: { internal_item_key: string; external_artikelnummer: string }[]) => {
      // Delete all existing and insert fresh
      // This is simpler than complex upsert logic for bulk updates
      for (const mapping of mappings) {
        if (!mapping.external_artikelnummer.trim()) continue;
        
        const { data: existing } = await supabase
          .from('external_article_mapping')
          .select('id')
          .eq('internal_item_key', mapping.internal_item_key)
          .single();

        if (existing) {
          await supabase
            .from('external_article_mapping')
            .update({ 
              external_artikelnummer: mapping.external_artikelnummer.trim(),
              is_active: true 
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('external_article_mapping')
            .insert({
              internal_item_key: mapping.internal_item_key,
              external_artikelnummer: mapping.external_artikelnummer.trim(),
              is_active: true
            });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-article-mapping'] });
      toast({
        title: "Artikel-Mapping gespeichert",
        description: "Die Zuordnungen wurden erfolgreich aktualisiert.",
      });
    },
    onError: (error) => {
      console.error('Error saving mappings:', error);
      toast({
        title: "Fehler beim Speichern",
        description: "Die Artikel-Mappings konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    },
  });

  // Mutation: Delete mapping
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('external_article_mapping')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-article-mapping'] });
    },
    onError: (error) => {
      console.error('Error deleting mapping:', error);
      toast({
        title: "Fehler beim Löschen",
        description: "Das Mapping konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  // Helper: Get mapping for an item key
  const getMappingForItem = (itemKey: string): string | undefined => {
    return query.data?.find(m => m.internal_item_key === itemKey)?.external_artikelnummer;
  };

  return {
    mappings: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    upsertMapping: upsertMutation.mutate,
    saveMappings: saveMappingsMutation.mutateAsync,
    deleteMapping: deleteMutation.mutate,
    isSaving: upsertMutation.isPending || saveMappingsMutation.isPending,
    getMappingForItem,
  };
};
