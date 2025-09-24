import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Provider } from "@/types";

export const useServiceProviders = () => {
  return useQuery({
    queryKey: ['service_providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_providers')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Transform data to match the Provider interface
      return data.map(provider => ({
        id: provider.id,
        name: provider.name,
        service_type: provider.service_type,
        email: provider.contact_email,
        phone: provider.contact_phone,
        is_active: provider.is_active,
        has_portal: provider.has_portal,
        avatar: null, // Add avatar support later if needed
      })) as Provider[];
    },
  });
};

export const useServiceProvidersByType = (serviceType: 'cleaning' | 'laundry') => {
  return useQuery({
    queryKey: ['service_providers', 'type', serviceType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_providers')
        .select('*')
        .eq('service_type', serviceType)
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (error) throw error;
      
      return data.map(provider => ({
        id: provider.id,
        name: provider.name,
        service_type: provider.service_type,
        email: provider.contact_email,
        phone: provider.contact_phone,
        is_active: provider.is_active,
        has_portal: provider.has_portal,
        avatar: null,
      })) as Provider[];
    },
    enabled: !!serviceType,
  });
};

export const useCreateServiceProvider = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (provider: Omit<Provider, 'id'>) => {
      const { data, error } = await supabase
        .from('service_providers')
        .insert([{
          name: provider.name,
          service_type: provider.service_type,
          contact_email: provider.email,
          contact_phone: provider.phone,
          is_active: provider.is_active ?? true,
          has_portal: provider.has_portal ?? false,
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_providers'] });
    },
  });
};

export const useUpdateServiceProvider = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Provider> & { id: string }) => {
      const { data, error } = await supabase
        .from('service_providers')
        .update({
          name: updates.name,
          service_type: updates.service_type,
          contact_email: updates.email,
          contact_phone: updates.phone,
          is_active: updates.is_active,
          has_portal: updates.has_portal,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_providers'] });
    },
  });
};

export const useDeleteServiceProvider = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_providers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_providers'] });
    },
  });
};