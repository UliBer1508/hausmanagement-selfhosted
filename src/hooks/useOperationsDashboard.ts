import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, endOfWeek, addWeeks, startOfMonth, endOfMonth, format } from 'date-fns';

export type TimeRange = 'this_week' | 'next_week' | 'month';

export interface CheckInData {
  id: string;
  guestName: string;
  houseName: string;
  checkIn: Date;
  guestCount: number;
  status: string;
}

export interface CheckOutData {
  id: string;
  guestName: string;
  houseName: string;
  checkOut: Date;
  hasCleaningTask: boolean;
}

export interface CleaningData {
  id: string;
  houseName: string;
  scheduledDate: Date;
  scheduledTime: string | null;
  status: string;
  assignedTo?: string;
}

export interface LinenDeliveryData {
  id: string;
  houseName: string;
  deliveryDate: Date;
  status: string;
  totalItems: number;
}

export interface RevenueData {
  total: number;
  paid: number;
  open: number;
  byHouse: Array<{ houseName: string; amount: number }>;
}

export interface OperationsDashboardData {
  checkIns: CheckInData[];
  checkOuts: CheckOutData[];
  cleanings: CleaningData[];
  linenDeliveries: LinenDeliveryData[];
  revenue: RevenueData;
}

function getDateRange(range: TimeRange): { start: Date; end: Date } {
  const now = new Date();
  switch (range) {
    case 'this_week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case 'next_week':
      const nextWeek = addWeeks(now, 1);
      return {
        start: startOfWeek(nextWeek, { weekStartsOn: 1 }),
        end: endOfWeek(nextWeek, { weekStartsOn: 1 }),
      };
    case 'month':
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      };
  }
}

export function useOperationsDashboard(timeRange: TimeRange) {
  const { start, end } = getDateRange(timeRange);
  const startStr = format(start, 'yyyy-MM-dd');
  const endStr = format(end, 'yyyy-MM-dd');

  // Fetch Check-ins
  const checkInsQuery = useQuery({
    queryKey: ['operations-checkins', startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, guest_name, number_of_guests, check_in, status, house_id, houses(name)')
        .gte('check_in', startStr)
        .lte('check_in', endStr + 'T23:59:59')
        .neq('status', 'cancelled')
        .order('check_in', { ascending: true });

      if (error) throw error;

      return (data || []).map((b: any) => ({
        id: b.id,
        guestName: b.guest_name,
        houseName: b.houses?.name || 'Unbekannt',
        checkIn: new Date(b.check_in),
        guestCount: b.number_of_guests,
        status: b.status || 'confirmed',
      })) as CheckInData[];
    },
  });

  // Fetch Check-outs
  const checkOutsQuery = useQuery({
    queryKey: ['operations-checkouts', startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, guest_name, check_out, house_id, houses(name)')
        .gte('check_out', startStr)
        .lte('check_out', endStr + 'T23:59:59')
        .neq('status', 'cancelled')
        .order('check_out', { ascending: true });

      if (error) throw error;

      // Check for associated cleaning tasks
      const bookingIds = (data || []).map((b: any) => b.id);
      const { data: cleanings } = await supabase
        .from('service_tasks')
        .select('booking_id')
        .in('booking_id', bookingIds)
        .eq('service_type', 'cleaning');

      const bookingsWithCleaning = new Set((cleanings || []).map((c: any) => c.booking_id));

      return (data || []).map((b: any) => ({
        id: b.id,
        guestName: b.guest_name,
        houseName: b.houses?.name || 'Unbekannt',
        checkOut: new Date(b.check_out),
        hasCleaningTask: bookingsWithCleaning.has(b.id),
      })) as CheckOutData[];
    },
  });

  // Fetch Cleanings
  const cleaningsQuery = useQuery({
    queryKey: ['operations-cleanings', startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_tasks')
        .select('id, house_id, scheduled_date, scheduled_time, status, houses(name)')
        .eq('service_type', 'cleaning')
        .gte('scheduled_date', startStr)
        .lte('scheduled_date', endStr)
        .order('scheduled_date', { ascending: true });

      if (error) throw error;

      return (data || []).map((t: any) => ({
        id: t.id,
        houseName: t.houses?.name || 'Unbekannt',
        scheduledDate: new Date(t.scheduled_date),
        scheduledTime: t.scheduled_time,
        status: t.status || 'scheduled',
      })) as CleaningData[];
    },
  });

  // Fetch Linen Deliveries
  const linenQuery = useQuery({
    queryKey: ['operations-linen', startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select('id, house_id, delivery_date, status, items, houses(name)')
        .gte('delivery_date', startStr)
        .lte('delivery_date', endStr)
        .order('delivery_date', { ascending: true });

      if (error) throw error;

      return (data || []).map((o: any) => {
        const items = o.items || {};
        const totalItems = Object.values(items).reduce((sum: number, qty: any) => sum + (Number(qty) || 0), 0);
        return {
          id: o.id,
          houseName: o.houses?.name || 'Unbekannt',
          deliveryDate: new Date(o.delivery_date),
          status: o.status || 'pending',
          totalItems,
        };
      }) as LinenDeliveryData[];
    },
  });

  // Fetch Revenue
  const revenueQuery = useQuery({
    queryKey: ['operations-revenue', startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('booking_amount, payment_status, house_id, houses(name)')
        .gte('check_in', startStr)
        .lte('check_in', endStr + 'T23:59:59')
        .neq('status', 'cancelled');

      if (error) throw error;

      const byHouseMap = new Map<string, { houseName: string; amount: number }>();
      let total = 0;
      let paid = 0;

      (data || []).forEach((b: any) => {
        const amount = Number(b.booking_amount) || 0;
        total += amount;
        if (b.payment_status === 'paid') {
          paid += amount;
        }

        const houseName = b.houses?.name || 'Unbekannt';
        const existing = byHouseMap.get(b.house_id) || { houseName, amount: 0 };
        existing.amount += amount;
        byHouseMap.set(b.house_id, existing);
      });

      return {
        total,
        paid,
        open: total - paid,
        byHouse: Array.from(byHouseMap.values()).sort((a, b) => b.amount - a.amount),
      } as RevenueData;
    },
  });

  const isLoading =
    checkInsQuery.isLoading ||
    checkOutsQuery.isLoading ||
    cleaningsQuery.isLoading ||
    linenQuery.isLoading ||
    revenueQuery.isLoading;

  const isError =
    checkInsQuery.isError ||
    checkOutsQuery.isError ||
    cleaningsQuery.isError ||
    linenQuery.isError ||
    revenueQuery.isError;

  const refetchAll = () => {
    checkInsQuery.refetch();
    checkOutsQuery.refetch();
    cleaningsQuery.refetch();
    linenQuery.refetch();
    revenueQuery.refetch();
  };

  return {
    data: {
      checkIns: checkInsQuery.data || [],
      checkOuts: checkOutsQuery.data || [],
      cleanings: cleaningsQuery.data || [],
      linenDeliveries: linenQuery.data || [],
      revenue: revenueQuery.data || { total: 0, paid: 0, open: 0, byHouse: [] },
    } as OperationsDashboardData,
    isLoading,
    isError,
    refetch: refetchAll,
  };
}
