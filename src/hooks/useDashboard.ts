import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardStats } from "@/types";

export const useDashboardData = () => {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      // Fetch all data in parallel
      const [housesResponse, bookingsResponse, tasksResponse] = await Promise.all([
        supabase.from('houses').select('*'),
        supabase.from('bookings').select('*').neq('status', 'cancelled').order('check_in', { ascending: true }),
        supabase.from('service_tasks').select('*')
      ]);

      if (housesResponse.error) throw housesResponse.error;
      if (bookingsResponse.error) throw bookingsResponse.error;
      if (tasksResponse.error) throw tasksResponse.error;

      const allHouses = housesResponse.data || [];
      const bookings = bookingsResponse.data || [];
      const tasks = tasksResponse.data || [];

      // Nur touristische Häuser für Stats zählen
      const houses = allHouses.filter((h: any) => h.rental_type === 'tourist');

      // Calculate stats
      const stats: DashboardStats = {
        totalHouses: houses.length,
        activeBookings: bookings.filter(b => b.status === 'confirmed').length,
        pendingTasks: tasks.filter(t => t.status === 'scheduled').length,
        totalRevenue: bookings.filter(b => b.status !== 'cancelled').reduce((sum, b) => sum + (b.booking_amount || 0), 0)
      };

      return {
        houses,
        bookings,
        tasks,
        stats
      };
    },
  });
};