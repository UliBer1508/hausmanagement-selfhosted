import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { format, addDays } from 'date-fns';
import { useMemo } from 'react';

export interface LinenDemandAnalysis {
  itemType: string;
  label: string;
  category: 'bedroom' | 'bathroom' | 'kitchen';
  currentStock: number;
  totalDemand: number;
  deficit: number;
  status: 'sufficient' | 'low' | 'critical' | 'overstock';
  trend: 'increasing' | 'decreasing' | 'stable';
  bookingDetails: Array<{
    guestName: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    demand: number;
    daysUntilCheckIn: number;
  }>;
  prediction: {
    nextWeekDemand: number;
    nextMonthDemand: number;
    reorderPoint: number;
  };
}

export interface HouseLinenOverview {
  house: any;
  totalItems: number;
  criticalCount: number;
  lowCount: number;
  upcomingBookings: number;
  nextBookingDate?: string;
  nextBookingDaysAway?: number;
  status: 'good' | 'warning' | 'critical';
  categories: {
    bedroom: LinenDemandAnalysis[];
    bathroom: LinenDemandAnalysis[];
    kitchen: LinenDemandAnalysis[];
  };
}

// Predictive Analytics Module
const calculatePredictiveAnalytics = (
  bookings: any[],
  historicalData: any,
  itemType: string,
  currentStock: number,
  linenDef: any
) => {
  // Calculate next week and month demand based on bookings
  const now = new Date();
  const nextWeek = addDays(now, 7);
  const nextMonth = addDays(now, 30);

  const nextWeekBookings = bookings.filter(b => 
    new Date(b.check_in) <= nextWeek
  );
  
  const nextMonthBookings = bookings.filter(b => 
    new Date(b.check_in) <= nextMonth
  );

  let nextWeekDemand = 0;
  let nextMonthDemand = 0;

  const perGuestKey = `${itemType}_per_guest`;
  const perBookingKey = `${itemType}_per_booking`;

  nextWeekBookings.forEach(booking => {
    if (linenDef[perGuestKey]) {
      nextWeekDemand += booking.number_of_guests * linenDef[perGuestKey];
    } else if (linenDef[perBookingKey]) {
      nextWeekDemand += linenDef[perBookingKey];
    }
  });

  nextMonthBookings.forEach(booking => {
    if (linenDef[perGuestKey]) {
      nextMonthDemand += booking.number_of_guests * linenDef[perGuestKey];
    } else if (linenDef[perBookingKey]) {
      nextMonthDemand += linenDef[perBookingKey];
    }
  });

  // Calculate reorder point using formula: (average daily usage × lead time) + safety stock
  const averageDailyUsage = nextMonthDemand / 30;
  const leadTimeDays = 3; // Assuming 3 day delivery
  const safetyStock = Math.ceil(averageDailyUsage * 2); // 2 days safety stock
  const reorderPoint = Math.ceil((averageDailyUsage * leadTimeDays) + safetyStock);

  return {
    nextWeekDemand,
    nextMonthDemand,
    reorderPoint
  };
};

export const useOptimizedLinenManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Optimized query with batch fetching and memoization
  const { data: housesWithLinenData, isLoading } = useQuery({
    queryKey: ['houses-linen-optimized'],
    queryFn: async () => {
      // Single query to fetch all necessary data
      const { data: houses, error: housesError } = await supabase
        .from('houses')
        .select(`
          *,
          linen_set_definitions (*),
          bookings!inner (
            id,
            guest_name,
            check_in,
            check_out,
            number_of_guests,
            status
          )
        `)
        .order('name');
      
      if (housesError) throw housesError;

      // Filter bookings to upcoming only
      const housesWithFilteredBookings = houses?.map(house => ({
        ...house,
        bookings: house.bookings?.filter((booking: any) => 
          new Date(booking.check_in) >= new Date() && booking.status === 'confirmed'
        ).sort((a: any, b: any) => 
          new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
        ) || []
      })) || [];

      return housesWithFilteredBookings;
    },
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
    gcTime: 5 * 60 * 1000, // Garbage collect after 5 minutes
  });

  // Memoized calculation of linen analysis with predictive features
  const linenAnalysis = useMemo((): HouseLinenOverview[] => {
    if (!housesWithLinenData) return [];

    return housesWithLinenData.map(house => {
      const linenStock = house.linen_stock || {};
      const orderedLinen = house.ordered_linen || {};
      const linenDef = house.linen_set_definitions?.[0] || {};
      const upcomingBookings = house.bookings || [];

      const linenTypes = [
        // Bedroom category
        { key: 'bedding', label: 'Bettwäsche', category: 'bedroom' as const, perGuestKey: 'bedding_per_guest', perBookingKey: null },
        { key: 'blankets', label: 'Decken', category: 'bedroom' as const, perGuestKey: 'blankets_per_guest', perBookingKey: null },
        { key: 'pillow_cases', label: 'Kissenbezüge', category: 'bedroom' as const, perGuestKey: 'pillow_cases_per_guest', perBookingKey: null },
        
        // Bathroom category
        { key: 'large_towels', label: 'Handtücher groß', category: 'bathroom' as const, perGuestKey: 'large_towels_per_guest', perBookingKey: null },
        { key: 'small_towels', label: 'Handtücher klein', category: 'bathroom' as const, perGuestKey: 'small_towels_per_guest', perBookingKey: null },
        { key: 'sauna_towels', label: 'Saunatücher', category: 'bathroom' as const, perGuestKey: 'sauna_towels_per_guest', perBookingKey: null },
        { key: 'bath_mats', label: 'Badematten', category: 'bathroom' as const, perGuestKey: null, perBookingKey: 'bath_mats_per_booking' },
        { key: 'sink_towels', label: 'Waschbecken-Tücher', category: 'bathroom' as const, perGuestKey: null, perBookingKey: 'sink_towels_per_booking' },
        
        // Kitchen category
        { key: 'kitchen_towels', label: 'Küchentücher', category: 'kitchen' as const, perGuestKey: null, perBookingKey: 'kitchen_towels_per_booking' },
      ];

      const analysisResults: LinenDemandAnalysis[] = [];
      let criticalCount = 0;
      let lowCount = 0;
      let totalItems = 0;

      linenTypes.forEach(type => {
        const currentStock = linenStock[type.key] || 0;
        const ordered = orderedLinen[type.key] || 0;
        const availableStock = currentStock + ordered;
        totalItems += availableStock;

        let totalDemand = 0;
        const bookingDetails: LinenDemandAnalysis['bookingDetails'] = [];

        upcomingBookings.slice(0, 10).forEach((booking: any) => {
          let bookingDemand = 0;
          const daysUntilCheckIn = Math.ceil(
            (new Date(booking.check_in).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          );

          if (type.perGuestKey && linenDef[type.perGuestKey]) {
            bookingDemand = booking.number_of_guests * linenDef[type.perGuestKey];
          } else if (type.perBookingKey && linenDef[type.perBookingKey]) {
            bookingDemand = linenDef[type.perBookingKey];
          }

          if (bookingDemand > 0) {
            bookingDetails.push({
              guestName: booking.guest_name,
              checkIn: booking.check_in,
              checkOut: booking.check_out,
              guests: booking.number_of_guests,
              demand: bookingDemand,
              daysUntilCheckIn
            });
          }

          totalDemand += bookingDemand;
        });

        const deficit = Math.max(0, totalDemand - availableStock);
        
        // Enhanced status calculation
        let status: LinenDemandAnalysis['status'] = 'sufficient';
        if (deficit > 0) {
          status = 'critical';
          criticalCount++;
        } else if (totalDemand > availableStock * 0.8) {
          status = 'low';
          lowCount++;
        } else if (availableStock > totalDemand * 1.5) {
          status = 'overstock';
        }

        // Calculate trend (simplified - could be enhanced with historical data)
        const recentBookings = upcomingBookings.slice(0, 3);
        const laterBookings = upcomingBookings.slice(3, 6);
        const recentDemand = recentBookings.reduce((sum: number, b: any) => {
          if (type.perGuestKey && linenDef[type.perGuestKey]) {
            return sum + (b.number_of_guests * linenDef[type.perGuestKey]);
          } else if (type.perBookingKey && linenDef[type.perBookingKey]) {
            return sum + linenDef[type.perBookingKey];
          }
          return sum;
        }, 0);

        const laterDemand = laterBookings.reduce((sum: number, b: any) => {
          if (type.perGuestKey && linenDef[type.perGuestKey]) {
            return sum + (b.number_of_guests * linenDef[type.perGuestKey]);
          } else if (type.perBookingKey && linenDef[type.perBookingKey]) {
            return sum + linenDef[type.perBookingKey];
          }
          return sum;
        }, 0);

        let trend: LinenDemandAnalysis['trend'] = 'stable';
        if (laterDemand > recentDemand * 1.2) trend = 'increasing';
        else if (laterDemand < recentDemand * 0.8) trend = 'decreasing';

        // Predictive analytics
        const prediction = calculatePredictiveAnalytics(
          upcomingBookings,
          null, // Could be enhanced with historical data
          type.key,
          availableStock,
          linenDef
        );

        if (totalDemand > 0) {
          analysisResults.push({
            itemType: type.key,
            label: type.label,
            category: type.category,
            currentStock: availableStock,
            totalDemand,
            deficit,
            status,
            trend,
            bookingDetails: bookingDetails.sort((a, b) => a.daysUntilCheckIn - b.daysUntilCheckIn),
            prediction
          });
        }
      });

      // Group by categories
      const categories = {
        bedroom: analysisResults.filter(r => r.category === 'bedroom'),
        bathroom: analysisResults.filter(r => r.category === 'bathroom'),
        kitchen: analysisResults.filter(r => r.category === 'kitchen'),
      };

      let houseStatus: HouseLinenOverview['status'] = 'good';
      if (criticalCount > 0) houseStatus = 'critical';
      else if (lowCount > 2) houseStatus = 'warning';

      const nextBooking = upcomingBookings[0];
      const nextBookingDaysAway = nextBooking ? 
        Math.ceil((new Date(nextBooking.check_in).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 
        undefined;

      return {
        house,
        totalItems,
        criticalCount,
        lowCount,
        upcomingBookings: upcomingBookings.length,
        nextBookingDate: nextBooking?.check_in,
        nextBookingDaysAway,
        status: houseStatus,
        categories
      };
    });
  }, [housesWithLinenData]);

  // Optimized order creation with batch processing
  const createOptimizedOrderMutation = useMutation({
    mutationFn: async (orderData: {
      houseId: string;
      orderItems: Record<string, number>;
      notes?: string;
      deliveryDate?: string;
      priority?: 'normal' | 'urgent';
    }) => {
      console.log('🔍 Bestelldaten validieren:', {
        houseId: orderData.houseId,
        orderItems: orderData.orderItems,
        itemCount: Object.keys(orderData.orderItems).length,
        deliveryDate: orderData.deliveryDate,
        priority: orderData.priority
      });

      // Validierung der Bestelldaten
      if (!orderData.houseId) {
        throw new Error('Haus ID fehlt');
      }
      
      if (!orderData.orderItems || Object.keys(orderData.orderItems).length === 0) {
        throw new Error('Keine Bestellartikel angegeben');
      }

      const totalItems = Object.values(orderData.orderItems).reduce((sum, count) => sum + count, 0);
      
      if (totalItems === 0) {
        throw new Error('Gesamtanzahl der Artikel ist 0');
      }

      console.log('📤 Bestellung an Supabase senden...');
      
      const insertData = {
        house_id: orderData.houseId,
        provider_id: 'd8110105-8ac9-45e3-ad32-aaf42393744c',
        items: orderData.orderItems,
        total_items: totalItems,
        status: orderData.priority === 'urgent' ? 'urgent' : 'pending',
        order_date: format(new Date(), 'yyyy-MM-dd'),
        delivery_date: orderData.deliveryDate || format(addDays(new Date(), orderData.priority === 'urgent' ? 1 : 2), 'yyyy-MM-dd'),
        notes: orderData.notes || 'Automatische Bestellung basierend auf prädiktiver Analyse'
      };

      console.log('💾 INSERT Daten:', insertData);

      const { data, error } = await supabase
        .from('linen_orders')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('❌ Supabase Fehler:', error);
        throw error;
      }
      
      console.log('✅ Bestellung erfolgreich in DB erstellt:', data);
      return data;
    },
    onSuccess: (data, variables) => {
      // Optimistic updates
      queryClient.setQueryData(['houses-linen-optimized'], (old: any) => {
        if (!old) return old;
        return old.map((house: any) => {
          if (house.id === variables.houseId) {
            const updatedOrderedLinen = { ...(house.ordered_linen || {}) };
            Object.entries(variables.orderItems).forEach(([key, value]) => {
              updatedOrderedLinen[key] = (updatedOrderedLinen[key] || 0) + value;
            });
            return { ...house, ordered_linen: updatedOrderedLinen };
          }
          return house;
        });
      });

      queryClient.invalidateQueries({ queryKey: ['linen-orders'] });
      console.log('✅ Bestellung erfolgreich erstellt:', {
        orderId: data.id,
        houseId: variables.houseId,
        items: variables.orderItems,
        totalItems: Object.values(variables.orderItems).reduce((sum, count) => sum + count, 0)
      });
      toast({
        title: "Intelligente Bestellung erstellt",
        description: `${Object.values(variables.orderItems).reduce((sum, count) => sum + count, 0)} Artikel bestellt basierend auf prädiktiver Analyse.`,
      });
    },
    onError: (error) => {
      console.error('❌ Bestellfehler detailliert:', {
        error: error.message,
        details: error,
        timestamp: new Date().toISOString()
      });
      toast({
        title: "Bestellfehler",
        description: "Die optimierte Bestellung konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  return {
    housesWithLinenData: linenAnalysis,
    isLoading,
    createOptimizedOrderMutation,
    queryClient,
  };
};