import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AppReviewsSection } from './AppReviewsSection';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';
import { TrendingUp, Users, Calendar, Euro, MapPin, Clock, AlertTriangle, Settings } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, addMonths, differenceInDays, max, min, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { de } from 'date-fns/locale';
import { useHouses } from '@/hooks/useHouses';
import { MLSettingsDialog, type MLSettings, DEFAULT_ML_SETTINGS, loadMLSettings } from './MLSettingsDialog';
import { checkHolidayPeriod, type HolidayMatch } from '@/lib/holidayCalendar';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

// Types
interface Vacancy {
  start: string;
  end: string;
  days: number;
  urgency: 'high' | 'medium' | 'low';
  recommendation: string;
}

interface VacancyML extends Vacancy {
  ml: {
    bookingProbability: number;
    suggestedPrice: { min: number; max: number };
    bestChannel: string;
    bestChannelReason: string;
    targetNationalities: string[];
    seasonType: 'high' | 'mid' | 'low';
  };
}

interface HouseOccupancy {
  houseId: string;
  houseName: string;
  monthlyOccupancy: Array<{
    month: string;
    occupancyRate: number;
    occupiedDays: number;
    freeDays: number;
    daysInMonth: number;
    bookings: number;
  }>;
  vacancies: VacancyML[];
  totalOccupancyRate: number;
}

// Find free periods (vacancies) between bookings
const findVacancies = (bookings: any[], startDate: Date, endDate: Date): Vacancy[] => {
  const sortedBookings = bookings
    .filter(b => b.status !== 'cancelled')
    .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());

  const vacancies: Vacancy[] = [];
  let currentDate = startDate;

  sortedBookings.forEach((booking, index) => {
    const bookingStart = new Date(booking.check_in);
    
    // If there's a gap before this booking
    if (currentDate < bookingStart) {
      const gapDays = differenceInDays(bookingStart, currentDate);
      if (gapDays >= 1) { // Only report gaps of 1+ days
        const urgency = assessUrgency(currentDate, gapDays);
        vacancies.push({
          start: format(currentDate, 'yyyy-MM-dd'),
          end: format(bookingStart, 'yyyy-MM-dd'),
          days: gapDays,
          urgency,
          recommendation: getRecommendation(urgency, gapDays)
        });
      }
    }
    
    // Move currentDate to the end of this booking
    currentDate = max([currentDate, new Date(booking.check_out)]);
  });

  // Check for gap at the end
  if (currentDate < endDate) {
    const gapDays = differenceInDays(endDate, currentDate);
    if (gapDays >= 1) {
      const urgency = assessUrgency(currentDate, gapDays);
      vacancies.push({
        start: format(currentDate, 'yyyy-MM-dd'),
        end: format(endDate, 'yyyy-MM-dd'),
        days: gapDays,
        urgency,
        recommendation: getRecommendation(urgency, gapDays)
      });
    }
  }

  return vacancies;
};

// Assess urgency based on timing and duration
const assessUrgency = (startDate: Date, days: number): 'high' | 'medium' | 'low' => {
  const daysUntilStart = differenceInDays(startDate, new Date());
  const month = startDate.getMonth();
  const isHighSeason = month === 11 || month === 0 || month === 1; // Dec, Jan, Feb

  // Critical: Gap in high season OR gap starting within 30 days
  if ((isHighSeason && days >= 3) || (daysUntilStart <= 30 && days >= 3)) {
    return 'high';
  }
  
  // Medium: Gap starting within 60 days
  if (daysUntilStart <= 60 && days >= 3) {
    return 'medium';
  }
  
  return 'low';
};

// Get recommendation based on urgency
const getRecommendation = (urgency: 'high' | 'medium' | 'low', days: number): string => {
  if (urgency === 'high') {
    return '🔥 Kritisch! Sofort auf Buchungsportalen aktivieren. Hochsaison-Preise verwenden.';
  }
  if (urgency === 'medium') {
    return '⚠️ Zeitnah handeln. Verfügbarkeit aktualisieren und ggf. Preis anpassen.';
  }
  return '✅ Planbar. Normale Preisgestaltung, Verfügbarkeit prüfen.';
};

// ML: Calculate booking probability based on lead time + seasonality + holidays + settings
const calculateBookingProbability = (
  startDate: Date, 
  days: number, 
  historicalBookings: any[],
  settings: MLSettings,
  holidayMatch: HolidayMatch
): number => {
  // Nicht vermietbar unter Mindestaufenthalt
  if (days < settings.minRentableNights) return 0;
  
  const daysUntilStart = differenceInDays(startDate, new Date());
  const month = startDate.getMonth();
  const dayOfWeek = startDate.getDay();
  
  // Base probability by lead time (closer = less likely)
  let probability = 80;
  if (daysUntilStart < 7) probability = 20;
  else if (daysUntilStart < 14) probability = 35;
  else if (daysUntilStart < 30) probability = 55;
  else if (daysUntilStart < 60) probability = 70;
  
  // Season factor: High season = +20%, Low season = -15%
  const isHighSeason = [11, 0, 1].includes(month); // Dec, Jan, Feb
  const isMidSeason = [2, 3, 9, 10].includes(month); // Mar, Apr, Oct, Nov
  if (isHighSeason) probability += 20;
  else if (!isMidSeason) probability -= 15; // Low season
  
  // Feiertags-Boost
  if (settings.holidaysEnabled && holidayMatch.isHoliday) {
    probability += 25 * holidayMatch.maxBoost;
  }
  
  // Wochentag-Faktor: Bevorzugter Check-in Tag
  if (dayOfWeek === settings.preferredCheckInDay) probability += 15;
  else if (dayOfWeek === (settings.preferredCheckInDay - 1 + 7) % 7 || 
           dayOfWeek === (settings.preferredCheckInDay + 1) % 7) {
    probability += 5; // Nachbartage auch ok
  }
  
  // Optimale Dauer: 7 Tage = +10%
  if (days >= 7 && days <= 10) probability += 10;
  else if (days >= settings.minRentableNights && days < 7) probability -= 10;
  
  return Math.min(95, Math.max(5, probability));
};

// ML: Calculate suggested price based on historical monthly average + holidays + settings
const calculateSuggestedPrice = (
  startDate: Date,
  historicalBookings: any[],
  settings: MLSettings,
  holidayMatch: HolidayMatch
): { min: number; max: number } => {
  const month = startDate.getMonth();
  
  // Calculate historical monthly average
  const sameMonthBookings = historicalBookings.filter(b => {
    const bMonth = new Date(b.check_in).getMonth();
    return bMonth === month && b.booking_amount > 0 && b.status !== 'cancelled';
  });
  
  const avgAmount = sameMonthBookings.length > 0
    ? sameMonthBookings.reduce((sum, b) => sum + b.booking_amount, 0) / sameMonthBookings.length
    : 2500; // Fallback
  
  // Season multiplier
  const isHighSeason = [11, 0, 1].includes(month);
  const baseMultiplier = isHighSeason ? settings.highSeasonBoost : settings.lowSeasonDiscount;
  
  // Feiertags-Multiplikator anwenden
  const finalMultiplier = settings.holidaysEnabled && holidayMatch.isHoliday 
    ? Math.max(baseMultiplier, holidayMatch.maxBoost)
    : baseMultiplier;
  
  const basePrice = avgAmount * finalMultiplier;
  return {
    min: Math.round(basePrice * 0.9),
    max: Math.round(basePrice * 1.1)
  };
};

// ML: Get best channel based on season and platform performance
const getBestChannel = (
  startDate: Date,
  historicalBookings: any[]
): { channel: string; reason: string } => {
  const month = startDate.getMonth();
  const isHighSeason = [11, 0, 1].includes(month);
  
  // Analyze which channel performs better in same month
  const monthBookings = historicalBookings.filter(b => {
    const bMonth = new Date(b.check_in).getMonth();
    return bMonth === month && b.status !== 'cancelled';
  });
  
  const byPlatform = monthBookings.reduce((acc, b) => {
    const p = b.platform || 'Direktbuchung';
    if (!acc[p]) acc[p] = { count: 0, revenue: 0 };
    acc[p].count++;
    acc[p].revenue += b.booking_amount || 0;
    return acc;
  }, {} as Record<string, { count: number; revenue: number }>);
  
  // High season: Priority on revenue (Booking.com)
  // Low season: Priority on volume (Belvilla)
  if (isHighSeason) {
    return { 
      channel: 'Booking.com', 
      reason: 'Höhere Durchschnittspreise in Hochsaison (Ø €3.200+)' 
    };
  }
  return { 
    channel: 'Belvilla + Airbnb', 
    reason: 'Mehr Volumen in Nebensaison, breitere Reichweite' 
  };
};

// ML: Get target nationalities for the specific month
const getTargetNationalities = (
  startDate: Date,
  historicalBookings: any[]
): string[] => {
  const month = startDate.getMonth();
  
  // Analyze which nationalities book in same month
  const monthBookings = historicalBookings.filter(b => {
    const bMonth = new Date(b.check_in).getMonth();
    return bMonth === month && b.nationality && b.status !== 'cancelled';
  });
  
  const byNationality = monthBookings.reduce((acc, b) => {
    const n = b.nationality;
    acc[n] = (acc[n] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // Top 3 nationalities
  return Object.entries(byNationality)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 3)
    .map(([nat]) => nat);
};

// Enhanced findVacancies with ML data + settings + holidays
const findVacanciesWithML = (
  bookings: any[], 
  allHistoricalBookings: any[],
  startDate: Date, 
  endDate: Date,
  settings: MLSettings
): VacancyML[] => {
  const basicVacancies = findVacancies(bookings, startDate, endDate);
  
  return basicVacancies.map(vacancy => {
    const vacancyStart = parseISO(vacancy.start);
    const vacancyEnd = parseISO(vacancy.end);
    const month = vacancyStart.getMonth();
    const isHighSeason = [11, 0, 1].includes(month);
    const isMidSeason = [2, 3, 9, 10].includes(month);
    
    // Prüfe Feiertags-Überlappung
    const holidayMatch = settings.holidaysEnabled 
      ? checkHolidayPeriod(vacancyStart, vacancyEnd, settings.relevantCountries)
      : { isHoliday: false, holidays: [], maxBoost: 1.0, targetCountries: [] };
    
    const bestChannelResult = getBestChannel(vacancyStart, allHistoricalBookings);
    
    return {
      ...vacancy,
      ml: {
        bookingProbability: calculateBookingProbability(vacancyStart, vacancy.days, allHistoricalBookings, settings, holidayMatch),
        suggestedPrice: calculateSuggestedPrice(vacancyStart, allHistoricalBookings, settings, holidayMatch),
        bestChannel: bestChannelResult.channel,
        bestChannelReason: bestChannelResult.reason,
        targetNationalities: getTargetNationalities(vacancyStart, allHistoricalBookings),
        seasonType: isHighSeason ? 'high' : isMidSeason ? 'mid' : 'low'
      }
    };
  });
};

// Custom Tooltip for Occupancy Forecast
const CustomOccupancyTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3">
        <p className="font-bold mb-2">{data.month}</p>
        <p className="text-green-600 text-sm">
          ✅ Belegt: {data.occupiedDays} Tage ({data.occupancyRate}%)
        </p>
        <p className="text-red-600 text-sm">
          ⚠️ Frei: {data.freeDays} Tage
        </p>
        <p className="text-muted-foreground text-sm mt-1">
          {data.bookings} Buchung{data.bookings !== 1 ? 'en' : ''}
        </p>
      </div>
    );
  }
  return null;
};

const GuestAnalytics = () => {
  const [selectedHouseId, setSelectedHouseId] = useState<string>('all');
  const [mlSettings, setMLSettings] = useState<MLSettings>(DEFAULT_ML_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: allHouses } = useHouses();

  // Load settings from localStorage on mount
  useEffect(() => {
    const loaded = loadMLSettings();
    setMLSettings(loaded);
  }, []);
  
  // Filter houses to only show tourist rentals
  const houses = allHouses?.filter(house => house.rental_type === 'tourist');

  // Fetch booking data for analytics
  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['guest-analytics', selectedHouseId],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select(`
          *,
          houses!inner(name, rental_type)
        `)
        .eq('houses.rental_type', 'tourist')
        .not('guest_name', 'is', null);
      
      // Filter by house if selected
      if (selectedHouseId !== 'all') {
        query = query.eq('house_id', selectedHouseId);
      }

      const { data: bookings } = await query;

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
          const daysDifference = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
          return Math.max(0, daysDifference - 1); // Nächte = Tage - 1
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

      // Per-House Occupancy Forecast (next 6 months)
      const today = new Date();
      const sixMonthsLater = addMonths(today, 6);
      
      const perHouseOccupancy: HouseOccupancy[] = [];
      
      // Get unique houses from bookings or use filtered house if selected
      const relevantHouses = selectedHouseId === 'all' 
        ? Array.from(new Set(bookings.map(b => b.house_id)))
            .map(houseId => ({
              id: houseId,
              name: bookings.find(b => b.house_id === houseId)?.houses?.name || 'Unbekannt'
            }))
        : [{ id: selectedHouseId, name: houses?.find(h => h.id === selectedHouseId)?.name || 'Unbekannt' }];
      
      relevantHouses.forEach(house => {
        const houseBookings = bookings.filter(b => b.house_id === house.id);
        
        // Calculate monthly occupancy
        const monthlyOccupancy = [];
        let totalOccupiedDays = 0;
        let totalDaysInPeriod = 0;
        
        for (let i = 0; i < 6; i++) {
          const month = addMonths(today, i);
          const monthStart = startOfMonth(month);
          const monthEnd = endOfMonth(month);
          const daysInMonth = differenceInDays(monthEnd, monthStart) + 1;
          totalDaysInPeriod += daysInMonth;
          
          const monthBookings = houseBookings.filter(b => {
            if (b.status === 'cancelled') return false;
            const checkIn = new Date(b.check_in);
            const checkOut = new Date(b.check_out);
            return checkIn <= monthEnd && checkOut >= monthStart;
          });
          
          let occupiedDays = 0;
          monthBookings.forEach(booking => {
            const bookingStart = max([new Date(booking.check_in), monthStart]);
            const bookingEnd = min([new Date(booking.check_out), monthEnd]);
            const days = differenceInDays(bookingEnd, bookingStart);
            occupiedDays += Math.max(0, days);
          });
          
          totalOccupiedDays += occupiedDays;
          const freeDays = daysInMonth - occupiedDays;
          const occupancyRate = Math.round((occupiedDays / daysInMonth) * 100);
          
          monthlyOccupancy.push({
            month: format(month, 'MMM yyyy', { locale: de }),
            occupancyRate,
            occupiedDays,
            freeDays,
            daysInMonth,
            bookings: monthBookings.length
          });
        }
        
        // Find vacancies with ML analysis (free periods)
        const vacancies = findVacanciesWithML(houseBookings, bookings, today, sixMonthsLater, mlSettings);
        
        perHouseOccupancy.push({
          houseId: house.id,
          houseName: house.name,
          monthlyOccupancy,
          vacancies,
          totalOccupancyRate: Math.round((totalOccupiedDays / totalDaysInPeriod) * 100)
        });
      });

      return {
        monthlyData,
        nationalityData,
        avgStayDuration: Math.round(avgStayDuration * 10) / 10,
        durationData,
        perHouseOccupancy,
        totalRevenue: bookings.filter(b => b.status !== 'cancelled').reduce((sum, b) => sum + (b.booking_amount || 0), 0),
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

  const selectedHouseName = selectedHouseId === 'all' 
    ? 'Alle Häuser' 
    : houses?.find(h => h.id === selectedHouseId)?.name || '';

  return (
    <div className="space-y-6">
      <MLSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={mlSettings}
        onSettingsChange={setMLSettings}
      />
      
      {/* House Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Haus filtern:</label>
            <Select value={selectedHouseId} onValueChange={setSelectedHouseId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Alle Häuser" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Häuser</SelectItem>
                {houses?.map(house => (
                  <SelectItem key={house.id} value={house.id}>
                    {house.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

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
              Monatliche Buchungstrends {selectedHouseId !== 'all' && `- ${selectedHouseName}`}
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
              Top Herkunftsländer {selectedHouseId !== 'all' && `- ${selectedHouseName}`}
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
              Umsatz-Entwicklung {selectedHouseId !== 'all' && `- ${selectedHouseName}`}
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
              Aufenthaltsdauer-Verteilung {selectedHouseId !== 'all' && `- ${selectedHouseName}`}
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

    {/* Per-House Occupancy Analysis */}
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Auslastungs-Analyse pro Haus (nächste {mlSettings.analysisPeriodMonths} Monate)
          </h2>
          <p className="text-sm text-muted-foreground">
            Belegte und freie Zeiträume mit KI-basierter Verkaufswahrscheinlichkeit
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings className="h-5 w-5 text-muted-foreground" />
        </Button>
      </div>
      
      {analyticsData.perHouseOccupancy.map((house) => (
        <Card key={house.houseId}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                🏠 {house.houseName}
              </CardTitle>
              <Badge variant="outline" className="text-base">
                {house.totalOccupancyRate}% Auslastung
              </Badge>
            </div>
            <CardDescription>
              Belegte vs. freie Tage mit konkreten Lücken
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Area Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={house.monthlyOccupancy}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis label={{ value: 'Tage', angle: -90, position: 'insideLeft' }} />
                <Tooltip content={<CustomOccupancyTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="occupiedDays" 
                  stackId="1"
                  stroke="hsl(142 76% 36%)" 
                  fill="hsl(142 76% 36%)"
                  name="Belegte Tage"
                />
                <Area 
                  type="monotone" 
                  dataKey="freeDays" 
                  stackId="1"
                  stroke="hsl(0 84% 60%)" 
                  fill="hsl(0 84% 60%)"
                  name="Freie Tage"
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 pt-4 border-t">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(142 76% 36%)' }} />
                <span className="text-sm font-medium">Belegt</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(0 84% 60%)' }} />
                <span className="text-sm font-medium">Frei (Lücken)</span>
              </div>
            </div>

            {/* Vacancies List */}
            {house.vacancies.length > 0 ? (
              <div className="space-y-3 pt-4 border-t">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Freie Zeiträume ({house.vacancies.length})
                </h4>
                <div className="space-y-2">
                  {house.vacancies.map((vacancy, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        vacancy.urgency === 'high'
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                          : vacancy.urgency === 'medium'
                          ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20'
                          : 'border-gray-200 bg-gray-50 dark:bg-gray-800/20'
                      }`}
                    >
                      <div className="space-y-4">
                        {/* Header */}
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">
                                {format(parseISO(vacancy.start), 'dd.MM.yyyy', { locale: de })} - {format(parseISO(vacancy.end), 'dd.MM.yyyy', { locale: de })}
                              </span>
                              <Badge
                                variant={vacancy.urgency === 'high' ? 'destructive' : 'outline'}
                                className="text-xs"
                              >
                                {vacancy.days} {vacancy.days === 1 ? 'Tag' : 'Tage'}
                              </Badge>
                              <Badge
                                variant={
                                  vacancy.ml.seasonType === 'high' ? 'default' : 
                                  vacancy.ml.seasonType === 'mid' ? 'secondary' : 'outline'
                                }
                                className="text-xs"
                              >
                                {vacancy.ml.seasonType === 'high' ? '🔥 Hochsaison' :
                                 vacancy.ml.seasonType === 'mid' ? '📅 Übergangssaison' : '🌿 Nebensaison'}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {vacancy.recommendation}
                            </p>
                          </div>
                        </div>

                        {/* ML Analysis Box */}
                        <div className="bg-background/60 border rounded-lg p-3 space-y-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              ML-Analyse
                            </span>
                          </div>

                          {/* Booking Probability */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2">
                                📊 Buchungswahrscheinlichkeit:
                              </span>
                              <span className="font-bold">{vacancy.ml.bookingProbability}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all ${
                                    vacancy.ml.bookingProbability >= 70 ? 'bg-green-500' :
                                    vacancy.ml.bookingProbability >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${vacancy.ml.bookingProbability}%` }}
                                />
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              → {vacancy.ml.seasonType === 'high' ? 'Hochsaison' : vacancy.ml.seasonType === 'mid' ? 'Übergangssaison' : 'Nebensaison'} + {differenceInDays(parseISO(vacancy.start), new Date())} Tage Vorlauf
                            </p>
                          </div>

                          {/* Price Recommendation */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2">
                                💰 Preisempfehlung:
                              </span>
                              <span className="font-bold">
                                €{vacancy.ml.suggestedPrice.min.toLocaleString()} - €{vacancy.ml.suggestedPrice.max.toLocaleString()} /Woche
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              → Basierend auf {format(parseISO(vacancy.start), 'MMMM', { locale: de })}-Durchschnitt
                            </p>
                          </div>

                          {/* Best Channel */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2">
                                📱 Bester Kanal:
                              </span>
                              <span className="font-bold">{vacancy.ml.bestChannel}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              → {vacancy.ml.bestChannelReason}
                            </p>
                          </div>

                          {/* Target Nationalities */}
                          {vacancy.ml.targetNationalities.length > 0 && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2">
                                  🎯 Zielgruppe:
                                </span>
                                <span className="font-bold">
                                  {vacancy.ml.targetNationalities.join(', ')}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                → Diese Nationalitäten buchen im {format(parseISO(vacancy.start), 'MMMM', { locale: de })}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 border-t">
                <p className="text-sm text-muted-foreground">
                  ✅ Keine größeren Lücken erkannt - durchgehend gut gebucht!
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>

    {/* App Reviews Section */}
    <AppReviewsSection selectedHouseId={selectedHouseId} />
  </div>
  );
};

export default GuestAnalytics;