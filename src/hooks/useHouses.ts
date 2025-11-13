import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { House } from "@/types";

export const useHouses = () => {
  return useQuery({
    queryKey: ['houses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as House[];
    },
  });
};

export const useCreateHouse = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (house: Omit<House, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('houses')
        .insert([house])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['houses'] });
    },
  });
};

export const useUpdateHouse = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<House> & { id: string }) => {
      const { data, error } = await supabase
        .from('houses')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['houses'] });
    },
  });
};

export const useDeleteHouse = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('houses')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['houses'] });
    },
  });
};
