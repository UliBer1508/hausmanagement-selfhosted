import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GuestFilters, GuestWithBookings, BookingInfo } from '@/types/guest';

export const useGuests = (filters: GuestFilters = {}) => {
  const { searchTerm, statusFilter, houseFilter, categoryFilter, sortBy = 'booking' } = filters;

  return useQuery({
    queryKey: ['guests-with-bookings', searchTerm, statusFilter, houseFilter, categoryFilter, sortBy],
    queryFn: async (): Promise<GuestWithBookings[]> => {
      // Step 1: Load all guests
      const { data: guests, error: guestsError } = await supabase
        .from('guests')
        .select('*')
        .order('name');

      if (guestsError) throw guestsError;
      if (!guests) return [];

      // Step 2: Load all tourist bookings with guest_id
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id, guest_id, guest_name, check_in, check_out, 
          status, booking_amount, nationality, house_id,
          houses!bookings_house_id_fkey!inner(id, name, rental_type)
        `)
        .eq('houses.rental_type', 'tourist')
        .not('guest_id', 'is', null);

      if (bookingsError) throw bookingsError;

      const today = new Date().toISOString().split('T')[0];

      // Step 3: Merge guests with their bookings
      let guestsWithBookings: GuestWithBookings[] = guests.map(guest => {
        const guestBookings = (bookings || [])
          .filter(b => b.guest_id === guest.id)
          .map(b => ({
            id: b.id,
            check_in: b.check_in,
            check_out: b.check_out,
            status: b.status || 'confirmed',
            booking_amount: b.booking_amount,
            house_id: b.house_id,
            house_name: (b.houses as any)?.name || 'Unbekannt'
          }))
          .sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime());

        const completedBookings = guestBookings.filter(b => 
          b.status !== 'cancelled' && b.check_out < today
        );
        
        const upcomingBookings = guestBookings.filter(b => 
          b.status !== 'cancelled' && b.check_in >= today
        );

        const totalRevenue = guestBookings
          .filter(b => b.status !== 'cancelled')
          .reduce((sum, b) => sum + (b.booking_amount || 0), 0);

        const stayCount = guestBookings.filter(b => b.status !== 'cancelled').length;

        return {
          // Guest data
          id: guest.id,
          name: guest.name,
          email: guest.email,
          phone: guest.phone,
          nationality: guest.nationality,
          notes: guest.notes,
          street: guest.street,
          city: guest.city,
          postal_code: guest.postal_code,
          birth_date: guest.birth_date,
          travel_document: guest.travel_document,
          created_at: guest.created_at,
          updated_at: guest.updated_at,
          
          // Aggregated data
          bookings: guestBookings,
          total_revenue: totalRevenue,
          last_booking: completedBookings[0] || null,
          next_booking: upcomingBookings.length > 0 
            ? upcomingBookings[upcomingBookings.length - 1] 
            : null,
          stay_count: stayCount,
          category: stayCount > 1 ? 'returning' : 'new',
          
          // Legacy compatibility
          guest_name: guest.name,
          guest_email: guest.email,
          guest_phone: guest.phone,
          guest_notes: guest.notes,
        };
      });

      // Step 4: Apply filters
      
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        guestsWithBookings = guestsWithBookings.filter(g => 
          g.name.toLowerCase().includes(search) ||
          (g.email && g.email.toLowerCase().includes(search)) ||
          (g.phone && g.phone.includes(search))
        );
      }

      // Status filter (only guests with matching booking status)
      if (statusFilter && statusFilter !== 'all') {
        guestsWithBookings = guestsWithBookings.filter(g =>
          g.bookings.some(b => b.status === statusFilter)
        );
      }

      // House filter (only guests with bookings in this house)
      if (houseFilter && houseFilter !== 'all') {
        guestsWithBookings = guestsWithBookings.filter(g =>
          g.bookings.some(b => b.house_id === houseFilter)
        );
      }

      // Category filter
      if (categoryFilter && categoryFilter !== 'all') {
        guestsWithBookings = guestsWithBookings.filter(g =>
          g.category === categoryFilter
        );
      }

      // Step 5: Sort
      if (sortBy === 'name') {
        guestsWithBookings.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        // Sort by most recent booking (guests with bookings first)
        guestsWithBookings.sort((a, b) => {
          const aDate = a.bookings[0]?.check_in || '0000-00-00';
          const bDate = b.bookings[0]?.check_in || '0000-00-00';
          return bDate.localeCompare(aDate);
        });
      }

      return guestsWithBookings;
    },
  });
};

// Helper hook to get guest statistics with year filter
export const useGuestStatsWithYear = (selectedYear?: number) => {
  return useQuery({
    queryKey: ['guest-stats-by-year', selectedYear],
    queryFn: async () => {
      // Load ALL bookings to determine available years and TOTAL bookings per guest (for returning rate)
      const { data: allBookings, error: allBookingsError } = await supabase
        .from('bookings')
        .select('id, guest_id, check_in, houses!bookings_house_id_fkey!inner(rental_type)')
        .eq('houses.rental_type', 'tourist')
        .neq('status', 'cancelled')
        .not('guest_id', 'is', null);

      if (allBookingsError) throw allBookingsError;

      // Extract available years
      const availableYears = [...new Set(
        allBookings?.map(b => new Date(b.check_in).getFullYear()) || []
      )].sort((a, b) => b - a);

      // Count TOTAL bookings per guest across ALL years (for returning rate calculation)
      const totalBookingsPerGuest = new Map<string, number>();
      allBookings?.forEach(b => {
        if (b.guest_id) {
          totalBookingsPerGuest.set(b.guest_id, (totalBookingsPerGuest.get(b.guest_id) || 0) + 1);
        }
      });

      // Build query for bookings with optional year filter (for year-specific stats)
      let query = supabase
        .from('bookings')
        .select(`
          id, guest_id, guest_name, check_in, check_out, 
          booking_amount, status,
          houses!bookings_house_id_fkey!inner(rental_type)
        `)
        .eq('houses.rental_type', 'tourist')
        .neq('status', 'cancelled');

      if (selectedYear) {
        query = query
          .gte('check_in', `${selectedYear}-01-01`)
          .lte('check_in', `${selectedYear}-12-31`);
      }

      const { data: bookings, error: bookingsError } = await query;
      if (bookingsError) throw bookingsError;

      // Get unique guests in the selected year
      const guestIdsInYear = new Set(bookings?.map(b => b.guest_id).filter(Boolean));
      const totalGuests = guestIdsInYear.size;

      // Returning guests: From guests in selected year, how many have 2+ bookings TOTAL (across all years)?
      const returningGuests = [...guestIdsInYear].filter(
        guestId => (totalBookingsPerGuest.get(guestId as string) || 0) >= 2
      ).length;

      // Revenue and stay duration for selected year
      let totalRevenue = 0;
      let totalNights = 0;
      bookings?.forEach(b => {
        totalRevenue += b.booking_amount || 0;
        const checkIn = new Date(b.check_in);
        const checkOut = new Date(b.check_out);
        totalNights += Math.max(0, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
      });

      const totalBookings = bookings?.length || 0;
      const avgStayDuration = totalBookings > 0 ? Math.round(totalNights / totalBookings) : 0;
      const avgRevenuePerBooking = totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0;
      const returningRate = totalGuests > 0 ? Math.round((returningGuests / totalGuests) * 100) : 0;

      return {
        stats: {
          totalGuests,
          totalRevenue,
          returningGuests,
          returningRate,
          avgStayDuration,
          avgRevenuePerBooking,
          totalBookings,
        },
        availableYears
      };
    }
  });
};

// Legacy hook for backwards compatibility
export const useGuestStats = () => {
  const { data, isLoading } = useGuestStatsWithYear();
  
  return {
    stats: data?.stats || {
      totalGuests: 0,
      totalRevenue: 0,
      returningGuests: 0,
      returningRate: 0,
      avgStayDuration: 0,
      avgRevenuePerBooking: 0,
      totalBookings: 0,
      newGuests: 0,
      guestsWithoutBookings: 0,
      growthRate: 0,
    },
    isLoading
  };
};

// Types for guest segments
export interface GuestSegmentData {
  id?: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  nationality: string | null;
  total_revenue: number;
  stay_count: number;
  first_booking: string | null;
  last_booking: string | null;
  average_stay_duration: number;
  preferred_seasons: string[];
  loyalty_level: 'new' | 'returning' | 'gold' | 'platinum';
}

export interface GuestSegments {
  totalGuests: number;
  totalRevenue: number;
  vipGuests: { 
    count: number; 
    revenue: number; 
    percentage: number; 
    avgRevenue: number; 
    guests: GuestSegmentData[] 
  };
  returningGuests: { 
    count: number; 
    revenue: number; 
    percentage: number; 
    avgRevenue: number; 
    guests: GuestSegmentData[] 
  };
  newGuests: { 
    count: number; 
    revenue: number; 
    percentage: number; 
    guests: GuestSegmentData[] 
  };
  recentActivity: { 
    count: number; 
    percentage: number 
  };
  allGuests: GuestSegmentData[];
}

// Hook for guest segments with VIP, returning, new categorization
export const useGuestSegments = () => {
  return useQuery({
    queryKey: ['guest-segments', 'tourist'],
    queryFn: async (): Promise<GuestSegments | null> => {
      // Load all guests from guests table
      const { data: guests, error: guestsError } = await supabase
        .from('guests')
        .select('*')
        .order('name');

      if (guestsError) throw guestsError;

      // Load bookings with tourist filter
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id, guest_id, guest_name, guest_email, guest_phone, 
          check_in, check_out, booking_amount, nationality, status,
          houses!bookings_house_id_fkey!inner(rental_type)
        `)
        .eq('houses.rental_type', 'tourist')
        .neq('status', 'cancelled');

      if (bookingsError) throw bookingsError;
      if (!bookings || bookings.length === 0) return null;

      // Map to track guests with their metrics
      const guestMap = new Map<string, GuestSegmentData>();

      // First, add all guests from guests table
      guests?.forEach(guest => {
        guestMap.set(guest.id, {
          id: guest.id,
          guest_name: guest.name,
          guest_email: guest.email,
          guest_phone: guest.phone,
          nationality: guest.nationality,
          total_revenue: 0,
          stay_count: 0,
          first_booking: null,
          last_booking: null,
          average_stay_duration: 0,
          preferred_seasons: [],
          loyalty_level: 'new',
        });
      });

      // Process bookings and calculate metrics
      const bookingsByGuest = new Map<string, typeof bookings>();
      
      bookings.forEach(booking => {
        // Determine guest key - prefer guest_id, fallback to name+email
        let guestKey: string;
        
        if (booking.guest_id && guestMap.has(booking.guest_id)) {
          guestKey = booking.guest_id;
        } else {
          // Legacy: create key from name+email for bookings without guest_id
          guestKey = `legacy_${booking.guest_name}_${booking.guest_email || ''}`;
          
          if (!guestMap.has(guestKey)) {
            guestMap.set(guestKey, {
              guest_name: booking.guest_name,
              guest_email: booking.guest_email,
              guest_phone: booking.guest_phone,
              nationality: booking.nationality,
              total_revenue: 0,
              stay_count: 0,
              first_booking: null,
              last_booking: null,
              average_stay_duration: 0,
              preferred_seasons: [],
              loyalty_level: 'new',
            });
          }
        }

        // Collect bookings by guest
        if (!bookingsByGuest.has(guestKey)) {
          bookingsByGuest.set(guestKey, []);
        }
        bookingsByGuest.get(guestKey)!.push(booking);
      });

      // Calculate metrics for each guest
      bookingsByGuest.forEach((guestBookings, guestKey) => {
        const guest = guestMap.get(guestKey);
        if (!guest) return;

        const seasonsSet = new Set<string>();
        let totalNights = 0;

        guestBookings.forEach(booking => {
          guest.total_revenue += booking.booking_amount || 0;
          guest.stay_count += 1;

          const checkIn = new Date(booking.check_in);
          const checkOut = new Date(booking.check_out);
          const nights = Math.max(0, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
          totalNights += nights;

          // Track first and last booking
          if (!guest.first_booking || checkIn < new Date(guest.first_booking)) {
            guest.first_booking = booking.check_in;
          }
          if (!guest.last_booking || checkIn > new Date(guest.last_booking)) {
            guest.last_booking = booking.check_in;
          }

          // Determine season
          const month = checkIn.getMonth();
          if (month >= 11 || month <= 2) seasonsSet.add('winter');
          else if (month >= 3 && month <= 5) seasonsSet.add('spring');
          else if (month >= 6 && month <= 8) seasonsSet.add('summer');
          else seasonsSet.add('autumn');
        });

        guest.average_stay_duration = guest.stay_count > 0 ? Math.round(totalNights / guest.stay_count) : 0;
        guest.preferred_seasons = Array.from(seasonsSet);

        // Determine loyalty level
        if (guest.total_revenue >= 3000) guest.loyalty_level = 'platinum';
        else if (guest.total_revenue >= 1500) guest.loyalty_level = 'gold';
        else if (guest.stay_count >= 2) guest.loyalty_level = 'returning';
        else guest.loyalty_level = 'new';
      });

      // Filter to only guests with bookings (remove guests with 0 stay_count)
      const allGuests = Array.from(guestMap.values()).filter(g => g.stay_count > 0);

      // Segment criteria
      const vipThreshold = 2000;
      const returningThreshold = 2;

      // VIP: Gäste mit hohem Umsatz (Untermenge der Stammgäste)
      const vipGuests = allGuests.filter(g => 
        g.stay_count >= returningThreshold && g.total_revenue >= vipThreshold
      );
      
      // Stammgäste: ALLE Gäste mit 2+ Buchungen (unabhängig vom Umsatz)
      const returningGuests = allGuests.filter(g => g.stay_count >= returningThreshold);
      
      // Neue Gäste: Gäste mit nur 1 Buchung
      const newGuests = allGuests.filter(g => g.stay_count < returningThreshold);

      // Recent guests (last 3 months)
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const recentGuests = allGuests.filter(g => 
        g.last_booking && new Date(g.last_booking) >= threeMonthsAgo
      );

      // Calculate totals
      const totalRevenue = allGuests.reduce((sum, g) => sum + g.total_revenue, 0);
      const vipRevenue = vipGuests.reduce((sum, g) => sum + g.total_revenue, 0);
      const returningRevenue = returningGuests.reduce((sum, g) => sum + g.total_revenue, 0);
      const newGuestsRevenue = newGuests.reduce((sum, g) => sum + g.total_revenue, 0);

      return {
        totalGuests: allGuests.length,
        totalRevenue,
        vipGuests: {
          count: vipGuests.length,
          revenue: vipRevenue,
          percentage: totalRevenue > 0 ? Math.round((vipRevenue / totalRevenue) * 100) : 0,
          avgRevenue: vipGuests.length > 0 ? Math.round(vipRevenue / vipGuests.length) : 0,
          guests: vipGuests.sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 5)
        },
        returningGuests: {
          count: returningGuests.length,
          revenue: returningRevenue,
          percentage: totalRevenue > 0 ? Math.round((returningRevenue / totalRevenue) * 100) : 0,
          avgRevenue: returningGuests.length > 0 ? Math.round(returningRevenue / returningGuests.length) : 0,
          guests: returningGuests.sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 5)
        },
        newGuests: {
          count: newGuests.length,
          revenue: newGuestsRevenue,
          percentage: totalRevenue > 0 ? Math.round((newGuestsRevenue / totalRevenue) * 100) : 0,
          guests: newGuests.sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 5)
        },
        recentActivity: {
          count: recentGuests.length,
          percentage: allGuests.length > 0 ? Math.round((recentGuests.length / allGuests.length) * 100) : 0
        },
        allGuests
      };
    },
  });
};
