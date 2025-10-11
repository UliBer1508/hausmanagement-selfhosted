import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ServiceTask } from "@/types";

export const useServiceTasks = () => {
  return useQuery({
    queryKey: ['service_tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_tasks')
        .select(`
          *,
          houses:house_id (*),
          bookings:booking_id (*)
        `)
        .order('scheduled_date', { ascending: false });
      
      if (error) throw error;
      return data as ServiceTask[];
    },
  });
};

export const useServiceTasksByStatus = (status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'delayed') => {
  return useQuery({
    queryKey: ['service_tasks', 'status', status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_tasks')
        .select(`
          *,
          houses:house_id (*),
          bookings:booking_id (*)
        `)
        .eq('status', status)
        .order('scheduled_date', { ascending: false });
      
      if (error) throw error;
      return data as ServiceTask[];
    },
    enabled: !!status,
  });
};

export const useServiceTasksByProvider = (providerId: string) => {
  return useQuery({
    queryKey: ['service_tasks', 'provider', providerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_tasks')
        .select(`
          *,
          houses:house_id (*),
          bookings:booking_id (*)
        `)
        .eq('provider_id', providerId)
        .order('scheduled_date', { ascending: false });
      
      if (error) throw error;
      return data as ServiceTask[];
    },
    enabled: !!providerId,
  });
};

export const useCreateServiceTask = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (task: Omit<ServiceTask, 'id' | 'created_at' | 'updated_at' | 'houses' | 'bookings' | 'title' | 'description' | 'progress' | 'items'>) => {
      const { data, error } = await supabase
        .from('service_tasks')
        .insert([task])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_tasks'] });
    },
  });
};

export const useUpdateServiceTask = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ServiceTask> & { id: string }) => {
      const { data, error } = await supabase
        .from('service_tasks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_tasks'] });
    },
  });
};

export const useDeleteServiceTask = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_tasks')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_tasks'] });
    },
  });
};