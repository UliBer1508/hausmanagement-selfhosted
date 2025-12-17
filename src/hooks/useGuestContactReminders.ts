import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format, differenceInDays } from "date-fns";

export interface GuestContactReminder {
  id: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  number_of_guests: number;
  number_of_adults: number | null;
  number_of_children: number | null;
  guest_contact_status: string;
  houses: {
    id: string;
    name: string;
  } | null;
  daysUntilCheckIn: number;
  isFamily: boolean;
}

export const useGuestContactReminders = () => {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  // Query für Gäste die kontaktiert werden müssen (5-10 Tage vor Check-in)
  const { data: guestsToContact, isLoading, error } = useQuery({
    queryKey: ['guest-contact-reminders', today],
    queryFn: async () => {
      const fiveDaysFromNow = addDays(new Date(), 5);
      const tenDaysFromNow = addDays(new Date(), 10);

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          guest_name,
          guest_email,
          guest_phone,
          check_in,
          check_out,
          number_of_guests,
          number_of_adults,
          number_of_children,
          guest_contact_status,
          houses!bookings_house_id_fkey!inner(id, name, rental_type)
        `)
        .gte('check_in', fiveDaysFromNow.toISOString())
        .lte('check_in', tenDaysFromNow.toISOString())
        .eq('guest_contact_status', 'pending')
        .eq('status', 'confirmed')
        .eq('houses.rental_type', 'tourist')
        .order('check_in');

      if (error) throw error;

      // Tage bis Check-in und Familien-Status berechnen
      return (data || []).map(booking => ({
        ...booking,
        daysUntilCheckIn: differenceInDays(new Date(booking.check_in), new Date()),
        isFamily: (booking.number_of_children || 0) > 0
      })) as GuestContactReminder[];
    },
    staleTime: 1000 * 60 * 5, // 5 Minuten Cache
  });

  // Mutation um Status auf 'contacted' zu setzen
  const markAsContactedMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from('bookings')
        .update({ guest_contact_status: 'contacted' })
        .eq('id', bookingId);

      if (error) throw error;
      return bookingId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-contact-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['morning-guest-contact'] });
    },
  });

  // Mutation um Status auf 'not_required' zu setzen
  const markAsNotRequiredMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase
        .from('bookings')
        .update({ guest_contact_status: 'not_required' })
        .eq('id', bookingId);

      if (error) throw error;
      return bookingId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-contact-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['morning-guest-contact'] });
    },
  });

  return {
    guestsToContact: guestsToContact || [],
    isLoading,
    error,
    markAsContacted: markAsContactedMutation.mutate,
    markAsNotRequired: markAsNotRequiredMutation.mutate,
    isUpdating: markAsContactedMutation.isPending || markAsNotRequiredMutation.isPending,
  };
};
