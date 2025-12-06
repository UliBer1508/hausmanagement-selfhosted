import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { format, addDays } from 'date-fns';

export interface LinenDemandAnalysis {
  itemType: string;
  label: string;
  currentStock: number;
  totalDemand: number;
  deficit: number;
  status: 'sufficient' | 'low' | 'critical';
  bookingDetails: Array<{
    guestName: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    demand: number;
  }>;
}

export const useLinenManagement = (houseId: string) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch linen set definitions
  const { data: linenDefinitions } = useQuery({
    queryKey: ['linen-definitions', houseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', houseId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data || {};
    },
    enabled: !!houseId,
  });

  // Fetch house data with linen stock
  const { data: houseData } = useQuery({
    queryKey: ['house-linen-data', houseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name, linen_stock, ordered_linen')
        .eq('id', houseId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!houseId,
  });

  // Fetch upcoming bookings
  const fetchUpcomingBookings = (lookaheadDays: number) => 
    useQuery({
      queryKey: ['upcoming-bookings', houseId, lookaheadDays],
      queryFn: async () => {
        const lookaheadDate = format(addDays(new Date(), lookaheadDays), 'yyyy-MM-dd');
        
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('house_id', houseId)
          .gte('check_in', format(new Date(), 'yyyy-MM-dd'))
          .lte('check_in', lookaheadDate)
          .order('check_in', { ascending: true });
        
        if (error) throw error;
        return data || [];
      },
      enabled: !!houseId,
    });

  // Calculate linen demand
  const calculateLinenDemand = (
    linenDef: any,
    upcomingBookings: any[],
    houseLinenStock: any,
    selectedBookings: string[] = []
  ): LinenDemandAnalysis[] => {
    if (!linenDef || !upcomingBookings || !houseLinenStock) return [];

    const linenTypes = [
      { key: 'bedding', label: 'Bettwäsche', perGuestKey: 'bedding_per_guest', perBookingKey: null },
      { key: 'large_towels', label: 'Badetücher', perGuestKey: 'large_towels_per_guest', perBookingKey: null },
      { key: 'small_towels', label: 'Handtücher klein', perGuestKey: 'small_towels_per_guest', perBookingKey: null },
      { key: 'sauna_towels', label: 'Saunatücher', perGuestKey: 'sauna_towels_per_guest', perBookingKey: null },
      { key: 'bath_mats', label: 'Badematten', perGuestKey: null, perBookingKey: 'bath_mats_per_booking' },
      { key: 'sink_towels', label: 'Waschbecken', perGuestKey: null, perBookingKey: 'sink_towels_per_booking' },
      { key: 'kitchen_towels', label: 'Geschirrtücher', perGuestKey: null, perBookingKey: 'kitchen_towels_per_booking' },
      { key: 'blankets', label: 'Decken', perGuestKey: 'blankets_per_guest', perBookingKey: null },
      { key: 'pillow_cases', label: 'Kissenbezüge', perGuestKey: 'pillow_cases_per_guest', perBookingKey: null },
    ];

    const bookingsToConsider = selectedBookings.length > 0 
      ? upcomingBookings.filter(b => selectedBookings.includes(b.id))
      : upcomingBookings;

    return linenTypes.map(type => {
      const currentStock = houseLinenStock[type.key] || 0;
      const orderedStock = houseLinenStock.ordered_linen?.[type.key] || 0;
      const availableStock = currentStock + orderedStock;
      
      let totalDemand = 0;
      const bookingDetails: LinenDemandAnalysis['bookingDetails'] = [];

      bookingsToConsider.forEach(booking => {
        let bookingDemand = 0;
        
        if (type.perGuestKey) {
          bookingDemand = booking.number_of_guests * (linenDef[type.perGuestKey] || 0);
        } else if (type.perBookingKey) {
          bookingDemand = linenDef[type.perBookingKey] || 0;
        }

        if (bookingDemand > 0) {
          bookingDetails.push({
            guestName: booking.guest_name,
            checkIn: booking.check_in,
            checkOut: booking.check_out,
            guests: booking.number_of_guests,
            demand: bookingDemand
          });
        }
        
        totalDemand += bookingDemand;
      });

      const deficit = Math.max(0, totalDemand - availableStock);
      let status: LinenDemandAnalysis['status'] = 'sufficient';
      
      if (deficit > 0) {
        status = 'critical';
      } else if (totalDemand > availableStock * 0.8) {
        status = 'low';
      }

      return {
        itemType: type.key,
        label: type.label,
        currentStock: availableStock,
        totalDemand,
        deficit,
        status,
        bookingDetails: bookingDetails.sort((a, b) => 
          new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
        )
      };
    }).filter(item => item.totalDemand > 0);
  };

  // Create linen order mutation
  const createLinenOrderMutation = useMutation({
    mutationFn: async (orderData: {
      orderItems: Record<string, number>;
      notes?: string;
      deliveryDate?: string;
      linenColor?: string;
    }) => {
      const totalItems = Object.values(orderData.orderItems).reduce((sum, count) => sum + count, 0);
      
      const { data, error } = await supabase
        .from('linen_orders')
        .insert({
          house_id: houseId,
          provider_id: 'd8110105-8ac9-45e3-ad32-aaf42393744c', // Default laundry provider
          items: orderData.orderItems,
          total_items: totalItems,
          status: 'pending',
          order_date: format(new Date(), 'yyyy-MM-dd'),
          delivery_date: orderData.deliveryDate || format(addDays(new Date(), 2), 'yyyy-MM-dd'),
          notes: orderData.notes || 'Automatische Bestellung basierend auf Bedarfsanalyse',
          linen_color: orderData.linenColor || 'white_striped',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['linen-orders', houseId] });
      queryClient.invalidateQueries({ queryKey: ['house-linen-data', houseId] });
      console.log('✅ Standard Bestellung erfolgreich erstellt:', {
        orderId: data.id,
        houseId: houseId,
        items: data.items,
        totalItems: data.total_items
      });
      toast({
        title: "Bestellung erstellt",
        description: "Die Wäschebestellung wurde erfolgreich erstellt.",
      });
    },
    onError: (error) => {
      console.error('❌ Standard Bestellfehler detailliert:', {
        error: error.message,
        details: error,
        houseId: houseId,
        timestamp: new Date().toISOString()
      });
      toast({
        title: "Fehler",
        description: "Die Bestellung konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  // Send order email mutation
  const sendOrderEmailMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase
        .from('linen_orders')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linen-orders', houseId] });
      toast({
        title: "E-Mail gesendet",
        description: "Die Bestellung wurde per E-Mail an den Lieferanten gesendet.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Die E-Mail konnte nicht gesendet werden.",
        variant: "destructive",
      });
      console.error('Error sending order email:', error);
    },
  });

  return {
    linenDefinitions,
    houseData,
    fetchUpcomingBookings,
    calculateLinenDemand,
    createLinenOrderMutation,
    sendOrderEmailMutation,
  };
};