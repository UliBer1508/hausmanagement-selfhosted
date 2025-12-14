import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

export interface EmailSettings {
  email: string;
  display_name: string;
}

export interface ProfileSettings {
  user_name: string;
  company_name: string;
}

export interface AppearanceSettings {
  theme: 'light' | 'dark';
  language: string;
  compact_view: boolean;
}

type SettingsValue = EmailSettings | ProfileSettings | AppearanceSettings | Record<string, unknown>;

export function useSystemSettings<T extends SettingsValue>(key: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['system-settings', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      
      if (error) throw error;
      return data?.value as T | null;
    },
  });

  const mutation = useMutation({
    mutationFn: async (value: T) => {
      // First check if the setting exists
      const { data: existing } = await supabase
        .from('system_settings')
        .select('id')
        .eq('key', key)
        .maybeSingle();
      
      const jsonValue = value as unknown as Json;
      
      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('system_settings')
          .update({ 
            value: jsonValue,
            updated_at: new Date().toISOString()
          })
          .eq('key', key);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('system_settings')
          .insert([{ 
            key, 
            value: jsonValue
          }]);
        if (error) throw error;
      }
      
      return value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings', key] });
    },
  });

  return {
    data,
    isLoading,
    error,
    saveSettings: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

// Convenience hooks for specific settings
export function useEmailSettings() {
  return useSystemSettings<EmailSettings>('email_settings');
}

export function useProfileSettings() {
  return useSystemSettings<ProfileSettings>('profile_settings');
}

export function useAppearanceSettings() {
  return useSystemSettings<AppearanceSettings>('appearance_settings');
}
