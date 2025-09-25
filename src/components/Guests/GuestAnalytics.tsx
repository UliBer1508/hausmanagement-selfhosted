import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, Users, Calendar, Euro, MapPin, Clock } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { de } from 'date-fns/locale';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

const GuestAnalytics = () => {
  // Fetch booking data for analytics
  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['guest-analytics'],
    queryFn: async () => {
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          *,
          houses!inner(name)
        `)
        .not('guest_name', 'is', null);

      if (!bookings) return null;

      // Monthly booking trends (last 12 months)
      const monthlyData = [];
      for (let i = 11; i >= 0; i--) {
        const month = subMonths(new Date(), i);
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        
        const monthBookings = bookings.filter(b => {
          const checkIn = new Date(b.check_in);
          return checkIn >= monthStart && checkIn <= monthEnd;
        });

        monthlyData.push({
          month: format(month, 'MMM yyyy', { locale: de }),
          bookings: monthBookings.length,
          revenue: monthBookings.reduce((sum, b) => sum + (b.booking_amount || 0), 0),
          guests: monthBookings.reduce((sum, b) => sum + (b.number_of_guests || 0), 0)
        });
      }

      // Nationality distribution
      const nationalityCount = bookings.reduce((acc, booking) => {
        const nationality = booking.nationality || 'Unbekannt';
        acc[nationality] = (acc[nationality] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const nationalityData = Object.entries(nationalityCount)
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      // Average stay duration
      const stayDurations = bookings
        .filter(b => b.check_in && b.check_out)
        .map(b => {
          const checkIn = new Date(b.check_in);
          const checkOut = new Date(b.check_out);
          return Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        });

      const avgStayDuration = stayDurations.length > 0 
        ? stayDurations.reduce((sum, days) => sum + days, 0) / stayDurations.length
        : 0;

      // Duration distribution
      const durationGroups = {
        '1-2 Nächte': stayDurations.filter(d => d >= 1 && d <= 2).length,
        '3-5 Nächte': stayDurations.filter(d => d >= 3 && d <= 5).length,
        '6-7 Nächte': stayDurations.filter(d => d >= 6 && d <= 7).length,
        '8+ Nächte': stayDurations.filter(d => d >= 8).length,
      };

      const durationData = Object.entries(durationGroups)
        .map(([range, count]) => ({ range, count }));

      return {
        monthlyData,
        nationalityData,
        avgStayDuration: Math.round(avgStayDuration * 10) / 10,
        durationData,
        totalRevenue: bookings.reduce((sum, b) => sum + (b.booking_amount || 0), 0),
        totalBookings: bookings.length,
        totalGuests: bookings.reduce((sum, b) => sum + (b.number_of_guests || 0), 0)
      };
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-between mb-4 animate-pulse" />
          <div className="h-6 bg-muted rounded w-48 mx-auto mb-2 animate-pulse" />
          <div className="h-4 bg-muted rounded w-64 mx-auto animate-pulse" />
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="text-center py-12">
        <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Keine Daten verfügbar</h3>
        <p className="text-muted-foreground">Keine Buchungsdaten für Analysen gefunden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamtumsatz</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{analyticsData.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Aus {analyticsData.totalBookings} Buchungen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Durchschnittliche Aufenthaltsdauer</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.avgStayDuration} Nächte</div>
            <p className="text-xs text-muted-foreground">
              Pro Buchung
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamtgäste</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.totalGuests}</div>
            <p className="text-xs text-muted-foreground">
              Personen empfangen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. pro Buchung</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              €{Math.round(analyticsData.totalRevenue / analyticsData.totalBookings)}
            </div>
            <p className="text-xs text-muted-foreground">
              Durchschnittlicher Umsatz
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Monatliche Buchungstrends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analyticsData.monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="bookings" 
                  stroke="#8884d8" 
                  name="Buchungen"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Nationality Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Top Herkunftsländer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analyticsData.nationalityData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                  label={({ country, count }) => `${country}: ${count}`}
                >
                  {analyticsData.nationalityData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Euro className="h-5 w-5" />
              Umsatz-Entwicklung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData.monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [`€${value}`, 'Umsatz']} />
                <Bar dataKey="revenue" fill="#00C49F" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Stay Duration Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Aufenthaltsdauer-Verteilung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData.durationData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#FFBB28" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GuestAnalytics;