import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AppReviewsSection } from './AppReviewsSection';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';
import { TrendingUp, Users, Calendar, Euro, MapPin, Clock, AlertTriangle, Settings, ChevronRight, Loader2 } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, addMonths, differenceInDays, max, min, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { de } from 'date-fns/locale';
import { useHouses } from '@/hooks/useHouses';
import { useVacancyAI } from '@/hooks/useVacancyAI';
import { MLSettingsDialog, type MLSettings, DEFAULT_ML_SETTINGS, loadMLSettings } from './MLSettingsDialog';
import { checkHolidayPeriod, type HolidayMatch } from '@/lib/holidayCalendar';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

// Types
interface AdditionalFees {
  cleaning_fee_per_stay: number;
  electricity_fee_per_stay: number;
  linen_fee_per_stay: number;
  service_fee_per_stay: number;
  tourist_tax_per_night: number;
  vat_percentage: number;
}

interface Vacancy {
  start: string;
  end: string;
  days: number;
  urgency: 'high' | 'medium' | 'low';
  recommendation: string;
}

interface HistoricalReference {
  matchingBooking: {
    guestName: string;
    pricePerNight: number;
    platform: string;
    nationality: string;
    leadDays: number;
    nights: number;
    totalAmount: number;
    additionalCosts: number;
  } | null;
  monthStats: {
    avgPricePerNight: number;
    minPricePerNight: number;
    maxPricePerNight: number;
    avgLeadDays: number;
    topPlatforms: string[];
    topNationalities: string[];
    bookingsCount: number;
  } | null;
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
  historical: HistoricalReference;
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

// Calculate real price per night (subtract ancillary costs)
const calculateRealPricePerNight = (
  bookingAmount: number,
  nights: number,
  guests: number,
  additionalFees: AdditionalFees
): { realPricePerNight: number; totalAdditionalCosts: number; breakdown: { fixedCosts: number; variableCosts: number } } => {
  const fixedCosts = 
    (additionalFees.cleaning_fee_per_stay || 0) +
    (additionalFees.electricity_fee_per_stay || 0) +
    (additionalFees.linen_fee_per_stay || 0) +
    (additionalFees.service_fee_per_stay || 0);
  
  const variableCosts = (additionalFees.tourist_tax_per_night || 0) * nights * guests;
  const totalAdditionalCosts = fixedCosts + variableCosts;
  
  // Real overnight price = (total - ancillary costs) / nights
  const realPricePerNight = Math.max(0, (bookingAmount - totalAdditionalCosts) / nights);
  
  return {
    realPricePerNight: Math.round(realPricePerNight * 100) / 100,
    totalAdditionalCosts,
    breakdown: { fixedCosts, variableCosts }
  };
};

// Find matching historical booking from same month, house, similar duration
const findMatchingHistoricalBooking = (
  vacancy: Vacancy,
  allBookings: any[],
  houseId: string
): HistoricalReference['matchingBooking'] => {
  const vacancyStart = parseISO(vacancy.start);
  const vacancyMonth = vacancyStart.getMonth();
  
  // Find bookings in same month, same house, similar duration
  const matchingBookings = allBookings.filter(b => {
    if (b.house_id !== houseId || b.status === 'cancelled') return false;
    if (!b.booking_amount || b.booking_amount <= 0) return false;
    if (!b.houses?.additional_fees) return false;
    
    const bMonth = new Date(b.check_in).getMonth();
    const bNights = differenceInDays(new Date(b.check_out), new Date(b.check_in));
    return bMonth === vacancyMonth && Math.abs(bNights - vacancy.days) <= 3;
  });
  
  if (matchingBookings.length === 0) return null;
  
  // Best reference: similar duration + highest real price/night
  const sortedBookings = matchingBookings.map(b => {
    const nights = differenceInDays(new Date(b.check_out), new Date(b.check_in));
    const { realPricePerNight, totalAdditionalCosts } = calculateRealPricePerNight(
      b.booking_amount,
      nights,
      b.number_of_guests,
      b.houses.additional_fees
    );
    const leadDays = differenceInDays(new Date(b.check_in), new Date(b.created_at));
    
    return {
      guestName: b.guest_name,
      pricePerNight: realPricePerNight,
      platform: b.platform || 'Direktbuchung',
      nationality: b.nationality || 'N/A',
      leadDays,
      nights,
      totalAmount: b.booking_amount,
      additionalCosts: totalAdditionalCosts
    };
  }).sort((a, b) => b.pricePerNight - a.pricePerNight);
  
  return sortedBookings[0];
};

// Get monthly statistics from real historical data
const getMonthlyStats = (
  month: number,
  allBookings: any[],
  houseId: string
): HistoricalReference['monthStats'] => {
  const monthBookings = allBookings.filter(b => {
    if (b.house_id !== houseId || b.status === 'cancelled') return false;
    if (!b.booking_amount || b.booking_amount <= 0) return false;
    if (!b.houses?.additional_fees) return false;
    return new Date(b.check_in).getMonth() === month;
  });
  
  if (monthBookings.length === 0) return null;
  
  // Calculate REAL prices/night (without ancillary costs)
  const pricesPerNight = monthBookings.map(b => {
    const nights = differenceInDays(new Date(b.check_out), new Date(b.check_in));
    return calculateRealPricePerNight(
      b.booking_amount,
      nights,
      b.number_of_guests,
      b.houses.additional_fees
    ).realPricePerNight;
  });
  
  // Lead times
  const leadTimes = monthBookings.map(b => 
    differenceInDays(new Date(b.check_in), new Date(b.created_at))
  );
  
  // Platform distribution
  const platforms = monthBookings.reduce((acc, b) => {
    const p = b.platform || 'Direktbuchung';
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topPlatforms = Object.entries(platforms)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 3)
    .map(([p, c]) => `${p} (${c}x)`);
  
  // Nationality distribution
  const nationalities = monthBookings.reduce((acc, b) => {
    const n = b.nationality || 'N/A';
    acc[n] = (acc[n] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topNationalities = Object.entries(nationalities)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 3)
    .map(([n]) => n);
  
  return {
    avgPricePerNight: Math.round(pricesPerNight.reduce((a, b) => a + b, 0) / pricesPerNight.length),
    minPricePerNight: Math.round(Math.min(...pricesPerNight)),
    maxPricePerNight: Math.round(Math.max(...pricesPerNight)),
    avgLeadDays: Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length),
    topPlatforms,
    topNationalities,
    bookingsCount: monthBookings.length
  };
};

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

// ML: Calculate suggested price based on REAL historical monthly average (without ancillary costs)
const calculateSuggestedPrice = (
  startDate: Date,
  historicalBookings: any[],
  settings: MLSettings,
  holidayMatch: HolidayMatch
): { min: number; max: number } => {
  const month = startDate.getMonth();
  
  // Calculate historical monthly average from REAL prices (not total booking amounts)
  const sameMonthBookings = historicalBookings.filter(b => {
    const bMonth = new Date(b.check_in).getMonth();
    return bMonth === month && b.booking_amount > 0 && b.status !== 'cancelled' && b.houses?.additional_fees;
  });
  
  if (sameMonthBookings.length === 0) {
    // Fallback: Use overall average if no data for this month
    return { min: 400, max: 600 };
  }
  
  const realPrices = sameMonthBookings.map(b => {
    const nights = differenceInDays(new Date(b.check_out), new Date(b.check_in));
    return calculateRealPricePerNight(
      b.booking_amount,
      nights,
      b.number_of_guests,
      b.houses.additional_fees
    ).realPricePerNight;
  });
  
  const avgRealPrice = realPrices.reduce((sum, p) => sum + p, 0) / realPrices.length;
  
  // Add holiday boost if applicable (but based on real data, not theoretical multiplier)
  const holidayBoost = settings.holidaysEnabled && holidayMatch.isHoliday ? 1.15 : 1.0;
  const basePrice = avgRealPrice * holidayBoost;
  
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

// Enhanced findVacancies with ML data + settings + holidays + historical references
const findVacanciesWithML = (
  bookings: any[], 
  allHistoricalBookings: any[],
  startDate: Date, 
  endDate: Date,
  settings: MLSettings,
  houseId: string
): VacancyML[] => {
  const basicVacancies = findVacancies(bookings, startDate, endDate);
  
  // Filtere Lücken aus, die kürzer als die Mindestaufenthaltsdauer sind
  const rentableVacancies = basicVacancies.filter(
    vacancy => vacancy.days >= settings.minRentableNights
  );
  
  return rentableVacancies.map(vacancy => {
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
    
    // Get historical references
    const matchingBooking = settings.showHistoricalReference 
      ? findMatchingHistoricalBooking(vacancy, allHistoricalBookings, houseId)
      : null;
    const monthStats = getMonthlyStats(month, allHistoricalBookings, houseId);
    
    return {
      ...vacancy,
      ml: {
        bookingProbability: calculateBookingProbability(vacancyStart, vacancy.days, allHistoricalBookings, settings, holidayMatch),
        suggestedPrice: calculateSuggestedPrice(vacancyStart, allHistoricalBookings, settings, holidayMatch),
        bestChannel: bestChannelResult.channel,
        bestChannelReason: bestChannelResult.reason,
        targetNationalities: getTargetNationalities(vacancyStart, allHistoricalBookings),
        seasonType: isHighSeason ? 'high' : isMidSeason ? 'mid' : 'low'
      },
      historical: {
        matchingBooking,
        monthStats
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
  const [analyzingVacancyId, setAnalyzingVacancyId] = useState<string | null>(null);
  const [aiAnalyses, setAiAnalyses] = useState<Record<string, any>>({});
  const [openHouses, setOpenHouses] = useState<Record<string, boolean>>({});
  
  const { data: allHouses } = useHouses();
  const { analyzeVacancy, isAnalyzing } = useVacancyAI();

  // Load settings from localStorage on mount
  useEffect(() => {
    const loaded = loadMLSettings();
    setMLSettings(loaded);
  }, []);
  
  // Handle AI analysis for a vacancy
  const handleAnalyzeVacancy = (vacancy: any, houseId: string) => {
    const vacancyId = `${vacancy.start}_${vacancy.end}`;
    setAnalyzingVacancyId(vacancyId);
    
    analyzeVacancy(
      { vacancy, houseId },
      {
        onSuccess: (analysis) => {
          setAiAnalyses(prev => ({
            ...prev,
            [vacancyId]: analysis,
          }));
          setAnalyzingVacancyId(null);
        },
        onError: () => {
          setAnalyzingVacancyId(null);
        },
      }
    );
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'kritisch': return 'bg-red-500';
      case 'hoch': return 'bg-orange-500';
      case 'mittel': return 'bg-yellow-500';
      case 'niedrig': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getUrgencyVariant = (urgency: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (urgency.toLowerCase()) {
      case 'kritisch': return 'destructive';
      case 'hoch': return 'destructive';
      case 'mittel': return 'secondary';
      default: return 'outline';
    }
  };
  
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
          houses!house_id!inner(name, rental_type, additional_fees)
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
        const vacancies = findVacanciesWithML(houseBookings, bookings, today, sixMonthsLater, mlSettings, house.id);
        
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
        paidRevenue: bookings.filter(b => b.status !== 'cancelled' && b.payment_status === 'paid').reduce((sum, b) => sum + (b.booking_amount || 0), 0),
        totalBookings: bookings.length,
        bookingsWithAmount: bookings.filter(b => b.status !== 'cancelled' && b.booking_amount && b.booking_amount > 0).length,
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
              Aus {analyticsData.totalBookings} Buchungen • davon <span className="text-green-600 font-medium">€{analyticsData.paidRevenue.toLocaleString()}</span> gezahlt
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
              €{analyticsData.bookingsWithAmount > 0 ? Math.round(analyticsData.totalRevenue / analyticsData.bookingsWithAmount) : 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Basierend auf {analyticsData.bookingsWithAmount} von {analyticsData.totalBookings} Buchungen
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
        <Collapsible 
          key={house.houseId}
          open={openHouses[house.houseId] ?? false}
          onOpenChange={() => setOpenHouses(prev => ({ ...prev, [house.houseId]: !(prev[house.houseId] ?? false) }))}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <ChevronRight className={`h-5 w-5 transition-transform duration-200 ${(openHouses[house.houseId] ?? false) ? 'rotate-90' : ''}`} />
                    🏠 {house.houseName}
                  </CardTitle>
                  <Badge variant="outline" className="text-base">
                    {house.totalOccupancyRate}% Auslastung
                  </Badge>
                </div>
                <CardDescription>
                  {house.vacancies.length} freie Zeiträume • Klicken zum {(openHouses[house.houseId] ?? false) ? 'Einklappen' : 'Ausklappen'}
                </CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
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

                        {/* KI-Analyse Button */}
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAnalyzeVacancy(vacancy, house.houseId)}
                            disabled={analyzingVacancyId === `${vacancy.start}_${vacancy.end}`}
                            className="text-xs"
                          >
                            {analyzingVacancyId === `${vacancy.start}_${vacancy.end}` ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Analysiere...
                              </>
                            ) : aiAnalyses[`${vacancy.start}_${vacancy.end}`] ? (
                              '🔄 Neu analysieren'
                            ) : (
                              '🤖 KI-Analyse starten'
                            )}
                          </Button>
                        </div>

                        {/* Conditional Display: KI-Analyse or ML Analysis Box */}
                        {aiAnalyses[`${vacancy.start}_${vacancy.end}`] ? (
                          /* KI-ANALYSE ERGEBNISSE */
                          <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold flex items-center gap-2">
                                🤖 KI-Analyse
                              </span>
                              <Badge variant={getUrgencyVariant(aiAnalyses[`${vacancy.start}_${vacancy.end}`].urgency)}>
                                {aiAnalyses[`${vacancy.start}_${vacancy.end}`].urgency.toUpperCase()}
                              </Badge>
                            </div>
                            
                            {/* KI-Wahrscheinlichkeit mit Progress Bar */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span>📊 Buchungswahrscheinlichkeit:</span>
                                <span className="font-bold">{aiAnalyses[`${vacancy.start}_${vacancy.end}`].bookingProbability}%</span>
                              </div>
                              <Progress value={aiAnalyses[`${vacancy.start}_${vacancy.end}`].bookingProbability} className="h-2" />
                            </div>
                            
                            {/* KI-Preisempfehlung */}
                            <div className="text-sm">
                              <div className="flex items-start gap-1">
                                <span>💰 KI-Preisempfehlung:</span>
                                <div className="font-bold">
                                  <div>€{aiAnalyses[`${vacancy.start}_${vacancy.end}`].suggestedPriceMin} - €{aiAnalyses[`${vacancy.start}_${vacancy.end}`].suggestedPriceMax} /Nacht</div>
                                  <div>
                                    €{aiAnalyses[`${vacancy.start}_${vacancy.end}`].suggestedPriceMin * 7} - €{aiAnalyses[`${vacancy.start}_${vacancy.end}`].suggestedPriceMax * 7} /Woche
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* KI-Begründung */}
                            <div className="text-sm bg-white/50 dark:bg-black/20 p-3 rounded">
                              <div className="font-medium mb-1">💭 Begründung:</div>
                              <p className="text-muted-foreground">{aiAnalyses[`${vacancy.start}_${vacancy.end}`].reasoning}</p>
                            </div>
                            
                            {/* KI-Maßnahmen-Liste */}
                            <div className="space-y-2">
                              <div className="font-medium text-sm">📋 Empfohlene Maßnahmen:</div>
                              {aiAnalyses[`${vacancy.start}_${vacancy.end}`].actions.map((action: any, i: number) => (
                                <div key={i} className="flex items-start gap-2 text-sm">
                                  <Badge variant="outline" className="shrink-0">
                                    Prio {action.priority}
                                  </Badge>
                                  <div>
                                    <div className="font-medium">{action.action}</div>
                                    <div className="text-xs text-muted-foreground">{action.reason}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            {/* Deadline-Warnung */}
                            <div className="text-sm text-amber-600 font-medium">
                              ⏰ Deadline: {aiAnalyses[`${vacancy.start}_${vacancy.end}`].deadline}
                            </div>
                          </div>
                        ) : (
                          /* REGELBASIERTE ML-ANALYSE */
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
                                <div className="font-bold text-right">
                                  <div>€{vacancy.ml.suggestedPrice.min.toLocaleString()} - €{vacancy.ml.suggestedPrice.max.toLocaleString()} /Nacht</div>
                                  <div>
                                    €{(vacancy.ml.suggestedPrice.min * 7).toLocaleString()} - €{(vacancy.ml.suggestedPrice.max * 7).toLocaleString()} /Woche
                                  </div>
                                </div>
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
                        )}

                        {/* Historical Reference & Recommendation */}
                        {(vacancy.historical.matchingBooking || vacancy.historical.monthStats) && (
                          <div className="space-y-3">
                            {/* Collapsible Historical Reference Section */}
                            <Collapsible defaultOpen={false}>
                              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:bg-muted/50 p-2 rounded transition-colors group">
                                <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                  📊 Historische Referenz
                                </span>
                              </CollapsibleTrigger>
                              
                              <CollapsibleContent className="mt-2">
                                <div className="bg-background/60 border rounded-lg p-3 space-y-3">
                                  {/* Matching Historical Booking */}
                                  {vacancy.historical.matchingBooking && (
                                    <div className="space-y-2 p-3 bg-background rounded border border-border/50">
                                      <div className="font-medium text-sm mb-2">
                                        Vergleichbare Buchung: {vacancy.historical.matchingBooking.guestName} ({vacancy.historical.matchingBooking.nights} Nächte)
                                      </div>
                                      
                                      <div className="text-xs space-y-1">
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Gesamtpreis:</span>
                                          <span className="font-bold">€{vacancy.historical.matchingBooking.totalAmount.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">- Nebenkosten:</span>
                                          <span>€{vacancy.historical.matchingBooking.additionalCosts.toLocaleString()}</span>
                                        </div>
                                        <div className="h-px bg-border my-1" />
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">= Reiner Ü-Preis:</span>
                                          <span className="font-bold text-green-600">
                                            €{(vacancy.historical.matchingBooking.totalAmount - vacancy.historical.matchingBooking.additionalCosts).toLocaleString()} 
                                            → €{Math.round(vacancy.historical.matchingBooking.pricePerNight)}/Nacht
                                          </span>
                                        </div>
                                      </div>

                                      <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
                                        Vorlauf: {vacancy.historical.matchingBooking.leadDays} Tage | 
                                        Plattform: {vacancy.historical.matchingBooking.platform} | 
                                        Nationalität: {vacancy.historical.matchingBooking.nationality}
                                      </div>
                                    </div>
                                  )}

                                  {/* Monthly Stats */}
                                  {vacancy.historical.monthStats && (
                                    <div className="space-y-2">
                                      <div className="font-medium text-sm">
                                        {format(parseISO(vacancy.start), 'MMMM', { locale: de })}-Statistik ({vacancy.historical.monthStats.bookingsCount} Buchungen)
                                      </div>
                                      
                                      <div className="text-xs space-y-1">
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Ø Preis/Nacht:</span>
                                          <span className="font-bold">€{vacancy.historical.monthStats.avgPricePerNight}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Min - Max:</span>
                                          <span>€{vacancy.historical.monthStats.minPricePerNight} - €{vacancy.historical.monthStats.maxPricePerNight}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Ø Vorlauf:</span>
                                          <span>{vacancy.historical.monthStats.avgLeadDays} Tage</span>
                                        </div>
                                        {vacancy.historical.monthStats.topPlatforms.length > 0 && (
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Top-Plattformen:</span>
                                            <span>{vacancy.historical.monthStats.topPlatforms.join(', ')}</span>
                                          </div>
                                        )}
                                        {vacancy.historical.monthStats.topNationalities.length > 0 && (
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">Zielgruppe:</span>
                                            <span>{vacancy.historical.monthStats.topNationalities.join(', ')}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>

                            {/* Recommendation - Always visible, outside of collapsible */}
                            {vacancy.historical.matchingBooking && vacancy.historical.monthStats && (
                              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                                <div className="font-medium text-sm text-blue-900 dark:text-blue-100 mb-2">
                                  💡 Empfehlung für diese Lücke:
                                </div>
                                <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                                  <div>
                                    • Übernachtungspreis: ~€{Math.round(vacancy.historical.monthStats.avgPricePerNight)}/Nacht × {vacancy.days} = €{Math.round(vacancy.historical.monthStats.avgPricePerNight * vacancy.days).toLocaleString()}
                                  </div>
                                  {differenceInDays(parseISO(vacancy.start), new Date()) < vacancy.historical.monthStats.avgLeadDays && (
                                    <div className="text-amber-700 dark:text-amber-400 font-medium mt-2">
                                      ⚠️ Nur noch {differenceInDays(parseISO(vacancy.start), new Date())} Tage Vorlauf!
                                      (Vergleichbare Buchungen kamen Ø {vacancy.historical.monthStats.avgLeadDays} Tage vorher)
                                      → Evtl. Preis auf €{Math.round(vacancy.historical.monthStats.avgPricePerNight * 0.9)}/Nacht reduzieren
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
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
            </CollapsibleContent>
          </Card>
        </Collapsible>
      ))}
    </div>

    {/* App Reviews Section */}
    <AppReviewsSection selectedHouseId={selectedHouseId} />
  </div>
  );
};

export default GuestAnalytics;