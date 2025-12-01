import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AppReviewsSection } from './AppReviewsSection';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';
import { TrendingUp, Users, Calendar, Euro, MapPin, Clock, AlertTriangle, Settings } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, addMonths, differenceInDays, max, min, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { de } from 'date-fns/locale';
import { useHouses } from '@/hooks/useHouses';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

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
    isBookable: boolean;
    reasons: string[];
    notBookableReason?: string;
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

const GuestAnalytics = () => {
  const [selectedHouseId, setSelectedHouseId] = useState<string>("");
  const [showMlSettings, setShowMlSettings] = useState(false);
  const [mlConfig, setMlConfig] = useState({
    minRentalDays: 4,
    idealRentalDays: 7,
    lastMinuteDays: 7,
    shortGapPenalty: 25,
    longGapBonus: 10,
    highSeasonMonths: [11, 0, 1],
    midSeasonMonths: [2, 3, 9, 10],
    highSeasonBonus: 20,
    lowSeasonPenalty: 15,
  });

  const { data: houses } = useHouses();

  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('check_in', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Guests data is derived from bookings table (nationality field)
  const guestsLoading = false;

  const calculateBookingProbability = (
    daysUntilStart: number,
    gapDays: number,
    month: number,
    config: typeof mlConfig
  ): { probability: number; isBookable: boolean; reasons: string[] } => {
    const reasons: string[] = [];
    let isBookable = true;
    
    // Check if gap is bookable
    if (gapDays < config.minRentalDays) {
      isBookable = false;
      reasons.push(`Lücke zu kurz (${gapDays} Tage, min. ${config.minRentalDays})`);
      return { probability: 0, isBookable, reasons };
    }

    let probability = 50;

    // Season adjustment
    if (config.highSeasonMonths.includes(month)) {
      probability += config.highSeasonBonus;
      reasons.push(`Hochsaison (+${config.highSeasonBonus}%)`);
    } else if (config.midSeasonMonths.includes(month)) {
      reasons.push('Mittelsaison (neutral)');
    } else {
      probability -= config.lowSeasonPenalty;
      reasons.push(`Nebensaison (-${config.lowSeasonPenalty}%)`);
    }

    // Gap length adjustment
    if (gapDays < config.idealRentalDays) {
      probability -= config.shortGapPenalty;
      reasons.push(`Kurze Lücke (-${config.shortGapPenalty}%)`);
    } else if (gapDays >= config.idealRentalDays * 2) {
      probability += config.longGapBonus;
      reasons.push(`Lange Lücke (+${config.longGapBonus}%)`);
    }

    // Time until start adjustment
    if (daysUntilStart <= config.lastMinuteDays) {
      probability -= 20;
      reasons.push('Last-Minute (-20%)');
    } else if (daysUntilStart > 90) {
      probability += 15;
      reasons.push('Frühbucher (+15%)');
    }

    return { 
      probability: Math.max(0, Math.min(100, probability)),
      isBookable,
      reasons
    };
  };

  const findVacanciesWithML = (houseBookings: any[]): VacancyML[] => {
    if (!houseBookings || houseBookings.length === 0) return [];

    const sortedBookings = [...houseBookings].sort((a, b) => 
      new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
    );

    const vacancies: VacancyML[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < sortedBookings.length - 1; i++) {
      const currentCheckOut = new Date(sortedBookings[i].check_out);
      const nextCheckIn = new Date(sortedBookings[i + 1].check_in);
      
      const gapDays = differenceInDays(nextCheckIn, currentCheckOut);
      
      if (gapDays > 0 && currentCheckOut >= today) {
        const daysUntilStart = differenceInDays(currentCheckOut, today);
        const month = currentCheckOut.getMonth();
        
        const mlResult = calculateBookingProbability(daysUntilStart, gapDays, month, mlConfig);
        
        let urgency: 'high' | 'medium' | 'low' = 'low';
        if (daysUntilStart <= 7) urgency = 'high';
        else if (daysUntilStart <= 30) urgency = 'medium';

        let seasonType: 'high' | 'mid' | 'low' = 'low';
        if (mlConfig.highSeasonMonths.includes(month)) seasonType = 'high';
        else if (mlConfig.midSeasonMonths.includes(month)) seasonType = 'mid';

        vacancies.push({
          start: format(currentCheckOut, 'yyyy-MM-dd'),
          end: format(nextCheckIn, 'yyyy-MM-dd'),
          days: gapDays,
          urgency,
          recommendation: mlResult.isBookable 
            ? `${Math.round(mlResult.probability)}% Buchungswahrscheinlichkeit`
            : mlResult.reasons[0] || 'Nicht buchbar',
          ml: {
            bookingProbability: mlResult.probability,
            isBookable: mlResult.isBookable,
            reasons: mlResult.reasons,
            notBookableReason: !mlResult.isBookable ? mlResult.reasons[0] : undefined,
            suggestedPrice: {
              min: seasonType === 'high' ? 150 : seasonType === 'mid' ? 120 : 100,
              max: seasonType === 'high' ? 250 : seasonType === 'mid' ? 180 : 140,
            },
            bestChannel: mlResult.probability > 70 ? 'Booking.com' : 'Airbnb',
            bestChannelReason: mlResult.probability > 70 
              ? 'Hohe Nachfrage, Booking.com bevorzugt'
              : 'Flexible Buchungen über Airbnb empfohlen',
            targetNationalities: seasonType === 'high' 
              ? ['Deutschland', 'Niederlande', 'Belgien']
              : ['Deutschland', 'Polen', 'Tschechien'],
            seasonType,
          },
        });
      }
    }

    return vacancies;
  };

  const calculateHouseOccupancy = (): HouseOccupancy[] => {
    if (!bookings || !houses) return [];

    const last12Months = Array.from({ length: 12 }, (_, i) => {
      const date = subMonths(new Date(), i);
      return {
        start: startOfMonth(date),
        end: endOfMonth(date),
        label: format(date, 'MMM yyyy', { locale: de }),
      };
    }).reverse();

    return houses.map(house => {
      const houseBookings = bookings.filter(b => b.house_id === house.id);
      
      const monthlyOccupancy = last12Months.map(month => {
        const monthBookings = houseBookings.filter(booking => {
          const checkIn = new Date(booking.check_in);
          const checkOut = new Date(booking.check_out);
          return (checkIn <= month.end && checkOut >= month.start);
        });

        const daysInMonth = differenceInDays(month.end, month.start) + 1;
        let occupiedDays = 0;

        monthBookings.forEach(booking => {
          const checkIn = max([new Date(booking.check_in), month.start]);
          const checkOut = min([new Date(booking.check_out), month.end]);
          occupiedDays += differenceInDays(checkOut, checkIn) + 1;
        });

        return {
          month: month.label,
          occupancyRate: Math.round((occupiedDays / daysInMonth) * 100),
          occupiedDays,
          freeDays: daysInMonth - occupiedDays,
          daysInMonth,
          bookings: monthBookings.length,
        };
      });

      const totalDays = monthlyOccupancy.reduce((sum, m) => sum + m.daysInMonth, 0);
      const totalOccupied = monthlyOccupancy.reduce((sum, m) => sum + m.occupiedDays, 0);
      const totalOccupancyRate = Math.round((totalOccupied / totalDays) * 100);

      const vacancies = findVacanciesWithML(houseBookings);

      return {
        houseId: house.id,
        houseName: house.name,
        monthlyOccupancy,
        vacancies,
        totalOccupancyRate,
      };
    });
  };

  const houseOccupancyData = calculateHouseOccupancy();
  const selectedHouseData = selectedHouseId 
    ? houseOccupancyData.find(h => h.houseId === selectedHouseId)
    : houseOccupancyData[0];

  const getMonthlyStats = () => {
    if (!bookings) return [];

    const last6Months = Array.from({ length: 6 }, (_, i) => {
      const date = subMonths(new Date(), i);
      return {
        start: startOfMonth(date),
        end: endOfMonth(date),
        label: format(date, 'MMM yyyy', { locale: de }),
      };
    }).reverse();

    return last6Months.map(month => {
      const monthBookings = bookings.filter(booking => {
        const checkIn = new Date(booking.check_in);
        return checkIn >= month.start && checkIn <= month.end;
      });

      const revenue = monthBookings.reduce((sum, b) => sum + (b.booking_amount || 0), 0);
      const avgStay = monthBookings.length > 0
        ? monthBookings.reduce((sum, b) => {
            const checkIn = new Date(b.check_in);
            const checkOut = new Date(b.check_out);
            return sum + differenceInDays(checkOut, checkIn);
          }, 0) / monthBookings.length
        : 0;

      return {
        month: month.label,
        bookings: monthBookings.length,
        revenue: Math.round(revenue),
        avgStay: Math.round(avgStay * 10) / 10,
      };
    });
  };

  const getNationalityStats = () => {
    if (!bookings) return [];

    const nationalityCounts = bookings.reduce((acc, booking) => {
      if (booking.nationality) {
        acc[booking.nationality] = (acc[booking.nationality] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(nationalityCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  };

  const getBookingSourceStats = () => {
    if (!bookings) return [];

    const sourceCounts = bookings.reduce((acc, booking) => {
      const source = booking.platform || 'Unbekannt';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(sourceCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  };

  const monthlyStats = getMonthlyStats();
  const nationalityStats = getNationalityStats();
  const bookingSourceStats = getBookingSourceStats();

  const totalBookings = bookings?.length || 0;
  const totalGuests = new Set(bookings?.map(b => b.guest_email).filter(Boolean)).size || 0;
  const totalRevenue = bookings?.reduce((sum, b) => sum + (b.booking_amount || 0), 0) || 0;
  const avgBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

  if (bookingsLoading || guestsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt Buchungen</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBookings}</div>
            <p className="text-xs text-muted-foreground">
              Letzte 12 Monate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt Gäste</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalGuests}</div>
            <p className="text-xs text-muted-foreground">
              Registrierte Gäste
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt Umsatz</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Letzte 12 Monate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ø Buchungswert</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{Math.round(avgBookingValue)}</div>
            <p className="text-xs text-muted-foreground">
              Pro Buchung
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Buchungen & Umsatz</CardTitle>
            <CardDescription>Letzte 6 Monate</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="bookings"
                  stroke="#8884d8"
                  fill="#8884d8"
                  fillOpacity={0.6}
                  name="Buchungen"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="revenue"
                  stroke="#82ca9d"
                  fill="#82ca9d"
                  fillOpacity={0.6}
                  name="Umsatz (€)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Buchungsquellen</CardTitle>
            <CardDescription>Verteilung nach Plattform</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={bookingSourceStats}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {bookingSourceStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gäste nach Nationalität</CardTitle>
            <CardDescription>Top 6 Herkunftsländer</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={nationalityStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8884d8" name="Buchungen" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Durchschnittliche Aufenthaltsdauer</CardTitle>
            <CardDescription>Letzte 6 Monate</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="avgStay"
                  stroke="#8884d8"
                  strokeWidth={2}
                  name="Ø Tage"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Auslastungs-Analyse pro Haus
              <Popover open={showMlSettings} onOpenChange={setShowMlSettings}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Settings className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-4">
                    <h4 className="font-medium">ML-Einstellungen</h4>
                    <div className="space-y-2">
                      <Label htmlFor="minRentalDays">Min. Mietdauer (Tage)</Label>
                      <Input
                        id="minRentalDays"
                        type="number"
                        value={mlConfig.minRentalDays}
                        onChange={(e) => setMlConfig({ ...mlConfig, minRentalDays: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="idealRentalDays">Ideale Mietdauer (Tage)</Label>
                      <Input
                        id="idealRentalDays"
                        type="number"
                        value={mlConfig.idealRentalDays}
                        onChange={(e) => setMlConfig({ ...mlConfig, idealRentalDays: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shortGapPenalty">Kurze Lücke Malus (%)</Label>
                      <Input
                        id="shortGapPenalty"
                        type="number"
                        value={mlConfig.shortGapPenalty}
                        onChange={(e) => setMlConfig({ ...mlConfig, shortGapPenalty: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="longGapBonus">Lange Lücke Bonus (%)</Label>
                      <Input
                        id="longGapBonus"
                        type="number"
                        value={mlConfig.longGapBonus}
                        onChange={(e) => setMlConfig({ ...mlConfig, longGapBonus: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="highSeasonBonus">Hochsaison Bonus (%)</Label>
                      <Input
                        id="highSeasonBonus"
                        type="number"
                        value={mlConfig.highSeasonBonus}
                        onChange={(e) => setMlConfig({ ...mlConfig, highSeasonBonus: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lowSeasonPenalty">Nebensaison Malus (%)</Label>
                      <Input
                        id="lowSeasonPenalty"
                        type="number"
                        value={mlConfig.lowSeasonPenalty}
                        onChange={(e) => setMlConfig({ ...mlConfig, lowSeasonPenalty: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </CardTitle>
            <CardDescription>Letzte 12 Monate mit ML-Prognosen</CardDescription>
          </div>
          {houses && houses.length > 1 && (
            <Select value={selectedHouseId} onValueChange={setSelectedHouseId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Haus auswählen" />
              </SelectTrigger>
              <SelectContent>
                {houses.map(house => (
                  <SelectItem key={house.id} value={house.id}>
                    {house.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          {selectedHouseData && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{selectedHouseData.houseName}</h3>
                  <p className="text-sm text-muted-foreground">
                    Durchschnittliche Auslastung: {selectedHouseData.totalOccupancyRate}%
                  </p>
                </div>
                <Badge variant={selectedHouseData.totalOccupancyRate >= 70 ? "default" : "secondary"}>
                  {selectedHouseData.totalOccupancyRate >= 70 ? "Gut ausgelastet" : "Verbesserungspotenzial"}
                </Badge>
              </div>

              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={selectedHouseData.monthlyOccupancy}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="occupancyRate" fill="#8884d8" name="Auslastung (%)" />
                </BarChart>
              </ResponsiveContainer>

              {selectedHouseData.vacancies.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Freie Zeiträume mit ML-Analyse
                  </h4>
                  <div className="space-y-2">
                    {selectedHouseData.vacancies.map((vacancy, index) => (
                      <div
                        key={index}
                        className={`p-4 border rounded-lg ${
                          !vacancy.ml.isBookable ? 'bg-gray-100 opacity-60' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={!vacancy.ml.isBookable ? 'line-through text-gray-500' : 'font-medium'}>
                                {format(parseISO(vacancy.start), 'dd.MM.yyyy', { locale: de })} - {format(parseISO(vacancy.end), 'dd.MM.yyyy', { locale: de })}
                              </span>
                              <Badge variant={
                                !vacancy.ml.isBookable ? "secondary" :
                                vacancy.urgency === 'high' ? "destructive" : 
                                vacancy.urgency === 'medium' ? "default" : 
                                "secondary"
                              }>
                                {!vacancy.ml.isBookable ? 'Nicht buchbar' : `${vacancy.days} Tage`}
                              </Badge>
                              {vacancy.ml.isBookable && (
                                <Badge variant="outline">
                                  {Math.round(vacancy.ml.bookingProbability)}% Wahrscheinlichkeit
                                </Badge>
                              )}
                            </div>
                            {!vacancy.ml.isBookable ? (
                              <p className="text-sm text-gray-500">{vacancy.ml.notBookableReason}</p>
                            ) : (
                              <>
                                <p className="text-sm text-muted-foreground">{vacancy.recommendation}</p>
                                <div className="text-xs space-y-1 mt-2">
                                  <p><strong>Gründe:</strong> {vacancy.ml.reasons.join(', ')}</p>
                                  <p><strong>Empfohlener Preis:</strong> €{vacancy.ml.suggestedPrice.min} - €{vacancy.ml.suggestedPrice.max}</p>
                                  <p><strong>Bester Kanal:</strong> {vacancy.ml.bestChannel} ({vacancy.ml.bestChannelReason})</p>
                                  <p><strong>Zielgruppe:</strong> {vacancy.ml.targetNationalities.join(', ')}</p>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AppReviewsSection selectedHouseId={selectedHouseId} />
    </div>
  );
};

export default GuestAnalytics;
