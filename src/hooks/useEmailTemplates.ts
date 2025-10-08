import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface EmailTemplate {
  id: string;
  template_key: string;
  name: string;
  subject: string;
  content: string;
  is_system: boolean;
  created_at?: string;
  updated_at?: string;
}

export const useEmailTemplates = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all templates from database
  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('template_key');

      if (error) {
        console.error('Error fetching email templates:', error);
        throw error;
      }

      return data as EmailTemplate[];
    },
  });

  // Convert array to Record<string, EmailTemplate> for backward compatibility
  const templatesRecord = templates.reduce((acc, template) => {
    acc[template.template_key] = template;
    return acc;
  }, {} as Record<string, EmailTemplate>);

  // Create new template
  const createTemplate = useMutation({
    mutationFn: async (template: Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('email_templates')
        .insert([template])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Vorlage erstellt',
        description: 'Die E-Mail-Vorlage wurde erfolgreich erstellt.',
      });
    },
    onError: (error) => {
      console.error('Error creating template:', error);
      toast({
        title: 'Fehler',
        description: 'Die Vorlage konnte nicht erstellt werden.',
        variant: 'destructive',
      });
    },
  });

  // Update existing template
  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EmailTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('email_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Vorlage aktualisiert',
        description: 'Die E-Mail-Vorlage wurde erfolgreich aktualisiert.',
      });
    },
    onError: (error) => {
      console.error('Error updating template:', error);
      toast({
        title: 'Fehler',
        description: 'Die Vorlage konnte nicht aktualisiert werden.',
        variant: 'destructive',
      });
    },
  });

  // Delete template
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Vorlage gelöscht',
        description: 'Die E-Mail-Vorlage wurde erfolgreich gelöscht.',
      });
    },
    onError: (error) => {
      console.error('Error deleting template:', error);
      toast({
        title: 'Fehler',
        description: 'Die Vorlage konnte nicht gelöscht werden.',
        variant: 'destructive',
      });
    },
  });

  return {
    templates: templatesRecord,
    templatesArray: templates,
    isLoading,
    error,
    createTemplate: createTemplate.mutate,
    updateTemplate: updateTemplate.mutate,
    deleteTemplate: deleteTemplate.mutate,
    isCreating: createTemplate.isPending,
    isUpdating: updateTemplate.isPending,
    isDeleting: deleteTemplate.isPending,
  };
};
