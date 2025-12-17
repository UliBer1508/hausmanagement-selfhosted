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

// Helper hook to get guest statistics
export const useGuestStats = () => {
  const { data: guests, isLoading } = useGuests();

  const stats = (() => {
    if (!guests || guests.length === 0) {
      return {
        totalGuests: 0,
        newGuests: 0,
        returningGuests: 0,
        guestsWithoutBookings: 0,
        totalRevenue: 0,
        returningRate: 0,
        avgStayDuration: 0,
        avgRevenuePerBooking: 0,
        growthRate: 0,
      };
    }

    const totalGuests = guests.length;
    const returningGuests = guests.filter(g => g.category === 'returning').length;
    const returningRate = totalGuests > 0 ? (returningGuests / totalGuests) * 100 : 0;

    // Calculate total bookings, revenue, and stay duration
    let totalBookings = 0;
    let bookingsWithAmount = 0;
    let totalRevenue = 0;
    let totalStayNights = 0;

    guests.forEach(guest => {
      guest.bookings
        .filter(b => b.status !== 'cancelled')
        .forEach(booking => {
          totalBookings++;
          if (booking.booking_amount && booking.booking_amount > 0) {
            totalRevenue += booking.booking_amount;
            bookingsWithAmount++;
          }
          const checkIn = new Date(booking.check_in);
          const checkOut = new Date(booking.check_out);
          const nights = Math.max(0, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
          totalStayNights += nights;
        });
    });

    const avgStayDuration = totalBookings > 0 ? Math.round(totalStayNights / totalBookings) : 0;
    const avgRevenuePerBooking = bookingsWithAmount > 0 ? Math.round(totalRevenue / bookingsWithAmount) : 0;

    // Calculate 6-month growth (guests created in last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentGuests = guests.filter(g => 
      g.created_at && new Date(g.created_at) >= sixMonthsAgo
    ).length;
    const growthRate = totalGuests > 0 ? Math.round((recentGuests / totalGuests) * 100) : 0;

    return {
      totalGuests,
      newGuests: guests.filter(g => g.category === 'new').length,
      returningGuests,
      guestsWithoutBookings: guests.filter(g => g.stay_count === 0).length,
      totalRevenue,
      returningRate: Math.round(returningRate),
      avgStayDuration,
      avgRevenuePerBooking,
      growthRate,
    };
  })();

  return { stats, isLoading };
};
