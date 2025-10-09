import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, TrendingUp, RotateCcw, Calendar } from 'lucide-react';

const GuestStats = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['guest-stats'],
    queryFn: async () => {
      // Get overall statistics (exclude cancelled bookings)
      const { data: overallStats } = await supabase
        .from('bookings')
        .select('guest_name, booking_amount, check_in, check_out, status')
        .not('guest_name', 'is', null)
        .not('booking_amount', 'is', null)
        .neq('status', 'cancelled');

      if (!overallStats) return null;

      // Calculate unique guests and returning guests
      const guestMap = new Map();
      let totalRevenue = 0;
      let totalBookings = 0;
      let totalStayDays = 0;

      overallStats.forEach(booking => {
        const guestKey = booking.guest_name;
        
        if (!guestMap.has(guestKey)) {
          guestMap.set(guestKey, { bookings: 0, revenue: 0 });
        }
        
        const guest = guestMap.get(guestKey);
        guest.bookings += 1;
        guest.revenue += booking.booking_amount;
        
        totalRevenue += booking.booking_amount;
        totalBookings += 1;
        
        // Calculate stay duration
        const checkIn = new Date(booking.check_in);
        const checkOut = new Date(booking.check_out);
        const stayDays = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        totalStayDays += stayDays;
      });

      const totalGuests = guestMap.size;
      const returningGuests = Array.from(guestMap.values()).filter(guest => guest.bookings > 1).length;
      const returningRate = totalGuests > 0 ? (returningGuests / totalGuests) * 100 : 0;
      const avgStayDuration = totalBookings > 0 ? totalStayDays / totalBookings : 0;
      const avgRevenuePerBooking = totalBookings > 0 ? totalRevenue / totalBookings : 0;

      // Calculate 6-month growth (simplified)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      const { data: recentBookings } = await supabase
        .from('bookings')
        .select('guest_name')
        .not('guest_name', 'is', null)
        .neq('status', 'cancelled')
        .gte('created_at', sixMonthsAgo.toISOString());

      const recentGuestsCount = new Set(recentBookings?.map(b => b.guest_name) || []).size;
      const growthRate = recentGuestsCount > 0 ? ((recentGuestsCount / totalGuests) * 100) : 0;

      return {
        totalGuests,
        totalRevenue,
        returningRate,
        avgStayDuration: Math.round(avgStayDuration),
        avgRevenuePerBooking,
        growthRate: Math.round(growthRate),
        returningGuests,
      };
    },
  });

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Lädt...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gesamt Gäste</CardTitle>
          <span className="text-2xl">👥</span>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalGuests}</div>
          <p className="text-xs text-muted-foreground">
            +{stats.growthRate}% in 6 Monaten
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gesamtumsatz</CardTitle>
          <span className="text-2xl">📈</span>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">€{stats.totalRevenue.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
          <p className="text-xs text-muted-foreground">
            €{Math.round(stats.avgRevenuePerBooking)} pro Buchung
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Wiederkehr-Rate</CardTitle>
          <span className="text-2xl">🔄</span>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{Math.round(stats.returningRate)}%</div>
          <p className="text-xs text-muted-foreground">
            {stats.returningGuests} Stammgäste
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ø Aufenthaltsdauer</CardTitle>
          <span className="text-2xl">📅</span>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.avgStayDuration} Tage</div>
          <p className="text-xs text-muted-foreground">
            Durchschnittlich
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default GuestStats;