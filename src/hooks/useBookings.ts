import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Booking } from "@/types";

export const useBookings = () => {
  return useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, guests!bookings_guest_id_fkey(*)')
        .neq('status', 'cancelled')
        .order('check_in', { ascending: true });
      
      if (error) throw error;
      return data as Booking[];
    },
  });
};

export const useBookingsByHouse = (houseId: string) => {
  return useQuery({
    queryKey: ['bookings', 'house', houseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, guests!bookings_guest_id_fkey(*)')
        .eq('house_id', houseId)
        .order('check_in', { ascending: true });
      
      if (error) throw error;
      return data as Booking[];
    },
    enabled: !!houseId,
  });
};

export const useCreateBooking = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('bookings')
        .insert([booking])
        .select('*, guests!bookings_guest_id_fkey(*)')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['bookings-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['connected-bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      
      // Force immediate refetch for connected view
      await queryClient.refetchQueries({ queryKey: ['connected-bookings'] });
    },
  });
};

export const useUpdateBooking = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Booking> & { id: string }) => {
      const { data, error } = await supabase
        .from('bookings')
        .update(updates)
        .eq('id', id)
        .select('*, guests!bookings_guest_id_fkey(*)')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['bookings-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['connected-bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      
      // Force immediate refetch
      await queryClient.refetchQueries({ queryKey: ['connected-bookings'] });
    },
  });
};

export const useDeleteBooking = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      // Atomic cascade delete via Postgres function — all-or-nothing transaction.
      // Removes booking + every related row (service_tasks, linen_orders, guest_*, etc.)
      const { error } = await supabase.rpc('delete_booking_cascade', {
        p_booking_id: id,
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['bookings-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['connected-bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['service-tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.refetchQueries({ queryKey: ['connected-bookings'] });
    },
  });
};