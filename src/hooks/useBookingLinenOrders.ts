import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { calculateDeliveryDate } from "@/lib/linenOrderHelpers";

interface BookingLinenConfig {
  id: string;
  house_id: string;
  lookahead_bookings: number;
  warning_days_before: number;
  auto_suggest: boolean;
}

interface BookingOrderStatus {
  booking_id: string;
  guest_name: string;
  check_in: string;
  number_of_guests: number;
  days_until_checkin: number;
  linen_order: {
    exists: boolean;
    order_id?: string;
    status?: string;
    created_at?: string;
  };
  required_items?: Record<string, number>;
  estimated_cost?: number;
  urgency: 'urgent' | 'normal' | 'ok';
}

interface OrderStatusResponse {
  house_id: string;
  house_name: string;
  lookahead_bookings: number;
  warning_days_before: number;
  bookings: BookingOrderStatus[];
  summary: {
    total_bookings: number;
    orders_complete: number;
    orders_missing: number;
    urgent_count: number;
  };
}

export const useBookingLinenOrders = (houseId: string) => {
  const queryClient = useQueryClient();

  // Load configuration
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['booking-linen-config', houseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_linen_config')
        .select('*')
        .eq('house_id', houseId)
        .maybeSingle();
      
      if (error) throw error;
      
      return data || {
        house_id: houseId,
        lookahead_bookings: 3,
        warning_days_before: 7,
        auto_suggest: true,
      } as BookingLinenConfig;
    },
    enabled: !!houseId,
  });

  // Check order status
  const { data: orderStatus, isLoading: statusLoading, refetch } = useQuery<OrderStatusResponse>({
    queryKey: ['booking-orders-status', houseId, config?.lookahead_bookings],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-booking-linen-orders', {
        body: { 
          house_id: houseId,
          lookahead_bookings: config?.lookahead_bookings 
        }
      });

      if (error) throw error;
      return data;
    },
    enabled: !!config && !!houseId,
    refetchInterval: 60000, // Refresh every minute
  });

  // Save configuration
  const saveConfigMutation = useMutation({
    mutationFn: async (updates: Partial<BookingLinenConfig>) => {
      const { data, error } = await supabase
        .from('booking_linen_config')
        .upsert({
          house_id: houseId,
          ...updates,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-linen-config', houseId] });
      queryClient.invalidateQueries({ queryKey: ['booking-orders-status', houseId] });
      toast({
        title: "Einstellungen gespeichert",
        description: "Die Konfiguration wurde erfolgreich aktualisiert.",
      });
    },
    onError: (error) => {
      console.error('Error saving config:', error);
      toast({
        variant: "destructive",
        title: "Fehler beim Speichern",
        description: "Die Einstellungen konnten nicht gespeichert werden.",
      });
    },
  });

  // Create order for booking
  const createOrderMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      console.log(`[createOrder] Creating order for booking: ${bookingId}`);

      // 1. Generate order items via edge function
      const { data: orderData, error: genError } = await supabase.functions.invoke(
        'generate-booking-linen-order',
        { body: { booking_id: bookingId } }
      );

      if (genError) throw genError;

      console.log('[createOrder] Generated order data:', orderData);

      // 2. Insert linen_order into DB
      const { data, error } = await supabase
        .from('linen_orders')
        .insert({
          house_id: orderData.booking.house.id,
          booking_id: bookingId,
          items: orderData.order_items,
          total_items: orderData.total_items,
          status: 'pending',
          order_source: 'booking_required',
          suggested_at: new Date().toISOString(),
          order_date: new Date().toISOString().split('T')[0],
          delivery_date: calculateDeliveryDate(orderData.booking.check_in),
          delivery_type: 'delivery',
        })
        .select()
        .single();

      if (error) throw error;
      
      console.log('[createOrder] Order created:', data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-orders-status', houseId] });
      queryClient.invalidateQueries({ queryKey: ['linen-orders'] });
      refetch();
      toast({
        title: "Bestellung erstellt!",
        description: "Die Wäschebestellung wurde erfolgreich angelegt.",
      });
    },
    onError: (error) => {
      console.error('Error creating order:', error);
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Die Bestellung konnte nicht erstellt werden.",
      });
    },
  });

  // Derived data
  const missingOrders = orderStatus?.bookings.filter(b => !b.linen_order.exists) || [];
  const urgentOrders = orderStatus?.bookings.filter(b => b.urgency === 'urgent' && !b.linen_order.exists) || [];
  const activeOrders = orderStatus?.bookings.filter(
    b => b.linen_order.exists && 
    (b.linen_order.status === 'pending' || b.linen_order.status === 'in-progress')
  ) || [];
  const completedOrders = orderStatus?.bookings.filter(
    b => b.linen_order.exists && b.linen_order.status === 'delivered'
  ) || [];

  return {
    config,
    orderStatus,
    missingOrders,
    urgentOrders,
    activeOrders,
    completedOrders,
    isLoading: configLoading || statusLoading,
    createOrder: createOrderMutation.mutate,
    isCreatingOrder: createOrderMutation.isPending,
    saveConfig: saveConfigMutation.mutate,
    isSavingConfig: saveConfigMutation.isPending,
    refetch,
  };
};
