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
  check_out: string;
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

// Helper function to build default item variants from database custom_categories
const buildDefaultItemVariants = (
  orderItems: Record<string, number>,
  customCategories?: Record<string, any>
): Record<string, string> => {
  const variants: Record<string, string> = {};
  
  Object.keys(orderItems).forEach(key => {
    // Farbe aus Datenbank (custom_categories) lesen - KEINE hardcodierten Defaults
    const definedColor = customCategories?.[key]?.color;
    if (definedColor) {
      variants[key] = definedColor;
    }
  });
  
  return variants;
};

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
      
      // Sort bookings by check-in date (earliest first)
      if (data?.bookings) {
        data.bookings.sort((a: BookingOrderStatus, b: BookingOrderStatus) => {
          const dateA = new Date(a.check_in).getTime();
          const dateB = new Date(b.check_in).getTime();
          return dateA - dateB;
        });
      }
      
      return data;
    },
    enabled: !!config && !!houseId,
    refetchInterval: 60000, // Refresh every minute
  });

  // Query: ALLE Buchungen ohne Bestellung (nicht limitiert)
  const { data: allMissingBookings, isLoading: allMissingLoading } = useQuery({
    queryKey: ['all-missing-bookings', houseId],
    queryFn: async () => {
      // 1. Lade ALLE confirmed Buchungen ab heute
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, guest_name, check_in, check_out, number_of_guests, house_id')
        .eq('house_id', houseId)
        .eq('status', 'confirmed')
        .gte('check_in', new Date().toISOString())
        .order('check_in', { ascending: true });
      
      if (bookingsError) throw bookingsError;
      
      // 2. Lade alle linen_orders für dieses Haus (außer cancelled)
      const { data: orders, error: ordersError } = await supabase
        .from('linen_orders')
        .select('booking_id, status')
        .eq('house_id', houseId)
        .neq('status', 'cancelled');
      
      if (ordersError) throw ordersError;
      
      // 3. Erstelle Set von booking_ids mit existierender Order
      const bookingIdsWithOrders = new Set(orders?.map(o => o.booking_id) || []);
      
      // 4. Filtere Buchungen OHNE Order
      const bookingsWithoutOrders = bookings?.filter(
        b => !bookingIdsWithOrders.has(b.id)
      ) || [];
      
      // 5. Berechne days_until_checkin und urgency
      return bookingsWithoutOrders.map(booking => {
        const checkInDate = new Date(booking.check_in);
        const daysUntilCheckin = Math.ceil(
          (checkInDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        
        return {
          booking_id: booking.id,
          guest_name: booking.guest_name,
          check_in: booking.check_in,
          check_out: booking.check_out,
          number_of_guests: booking.number_of_guests,
          days_until_checkin: daysUntilCheckin,
          urgency: daysUntilCheckin <= 7 ? 'urgent' as const : 'normal' as const,
        };
      });
    },
    enabled: !!houseId,
    refetchInterval: 60000,
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

  // Mutation to create order from generated data
  const createOrderFromDataMutation = useMutation({
    mutationFn: async ({ 
      bookingId, 
      generatedData, 
      userOverrides,
      customCategories 
    }: {
      bookingId: string;
      generatedData: any;
      userOverrides: any;
      customCategories?: Record<string, any>;
    }) => {
      const { data, error } = await supabase
        .from('linen_orders')
        .insert({
          house_id: generatedData.booking.house.id,
          booking_id: bookingId,
          items: generatedData.order_items,
          total_items: generatedData.total_items,
          status: 'pending',
          order_source: 'booking_required',
          suggested_at: new Date().toISOString(),
          order_date: new Date().toISOString().split('T')[0],
          delivery_date: userOverrides.deliveryDate || calculateDeliveryDate(generatedData.booking.check_in),
          delivery_type: userOverrides.deliveryType || 'delivery',
          notes: userOverrides.notes || generatedData.note,
          linen_color: userOverrides.linenColor || null, // Aus Datenbank - kein Fallback
          item_variants: userOverrides.itemColors || buildDefaultItemVariants(generatedData.order_items, customCategories),
        })
        .select('*, bookings!linen_orders_booking_id_fkey(*), houses!linen_orders_house_id_fkey(*)')
        .single();

      if (error) throw error;
      return { data };
    },
    onSuccess: () => {
      toast({
        title: "Bestellung erstellt!",
        description: "Die Wäschebestellung wurde erfolgreich angelegt.",
      });
      queryClient.invalidateQueries({ queryKey: ['booking-linen-orders'] });
      queryClient.invalidateQueries({ queryKey: ['all-missing-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking-orders-status'] });
      refetch();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Fehler beim Erstellen",
        description: error.message || "Die Bestellung konnte nicht erstellt werden.",
      });
    }
  });

  // Create order for booking (legacy)
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
          notes: 'Automatische Bestellung basierend auf prädiktiver Analyse',
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
      queryClient.invalidateQueries({ queryKey: ['all-missing-bookings', houseId] });
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
  const missingOrders = (orderStatus?.bookings?.filter(b => !b.linen_order.exists) || [])
    .sort((a, b) => {
      // Primary: Urgency (smallest days_until_checkin first)
      const urgencyDiff = a.days_until_checkin - b.days_until_checkin;
      if (urgencyDiff !== 0) return urgencyDiff;
      // Secondary: Alphabetically by guest name
      return a.guest_name.localeCompare(b.guest_name);
    });
  const urgentOrders = orderStatus?.bookings?.filter(b => b.urgency === 'urgent' && !b.linen_order.exists) || [];
  const activeOrders = orderStatus?.bookings?.filter(
    b => b.linen_order.exists && 
    (b.linen_order.status === 'pending' || b.linen_order.status === 'in-progress')
  ) || [];

  return {
    config,
    orderStatus,
    missingOrders,
    urgentOrders,
    activeOrders,
    allMissingBookings: allMissingBookings || [],
    isLoading: configLoading || statusLoading,
    isLoadingAllMissing: allMissingLoading,
    createOrder: createOrderMutation.mutate,
    createOrderFromData: createOrderFromDataMutation.mutateAsync,
    isCreatingOrder: createOrderMutation.isPending || createOrderFromDataMutation.isPending,
    saveConfig: saveConfigMutation.mutate,
    isSavingConfig: saveConfigMutation.isPending,
    refetch,
  };
};
