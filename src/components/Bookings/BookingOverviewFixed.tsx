import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Plus, Search, Edit, Calendar as CalendarIcon, Filter } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isAfter, isBefore, startOfDay, endOfDay, addMonths, startOfYear, endOfYear } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import CreateBookingDialog from './CreateBookingDialog';
import EditBookingDialog from './EditBookingDialog';

// Länderliste für Nationalität (gleiche wie in CreateBookingForm)
const countries = [
  { code: 'DE', name: 'Deutschland' },
  { code: 'AT', name: 'Österreich' },
  { code: 'CH', name: 'Schweiz' },
  { code: 'NL', name: 'Niederlande' },
  { code: 'BE', name: 'Belgien' },
  { code: 'FR', name: 'Frankreich' },
  { code: 'IT', name: 'Italien' },
  { code: 'ES', name: 'Spanien' },
  { code: 'PT', name: 'Portugal' },
  { code: 'UK', name: 'Vereinigtes Königreich' },
  { code: 'IE', name: 'Irland' },
  { code: 'DK', name: 'Dänemark' },
  { code: 'SE', name: 'Schweden' },
  { code: 'NO', name: 'Norwegen' },
  { code: 'FI', name: 'Finnland' },
  { code: 'PL', name: 'Polen' },
  { code: 'CZ', name: 'Tschechien' },
  { code: 'SK', name: 'Slowakei' },
  { code: 'HU', name: 'Ungarn' },
  { code: 'SI', name: 'Slowenien' },
  { code: 'HR', name: 'Kroatien' },
  { code: 'RO', name: 'Rumänien' },
  { code: 'BG', name: 'Bulgarien' },
  { code: 'GR', name: 'Griechenland' },
  { code: 'CY', name: 'Zypern' },
  { code: 'MT', name: 'Malta' },
  { code: 'LU', name: 'Luxemburg' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'MC', name: 'Monaco' },
  { code: 'US', name: 'USA' },
  { code: 'CA', name: 'Kanada' },
  { code: 'AU', name: 'Australien' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'Indien' },
  { code: 'BR', name: 'Brasilien' },
  { code: 'AR', name: 'Argentinien' },
  { code: 'MX', name: 'Mexiko' },
  { code: 'RU', name: 'Russland' },
  { code: 'TR', name: 'Türkei' },
  { code: 'ZA', name: 'Südafrika' },
];

// Helper function to get country name from code
const getCountryName = (code: string | undefined) => {
  if (!code || code === 'none') return '-';
  const country = countries.find(c => c.code === code);
  return country ? `${code} - ${country.name}` : code;
};

const BookingOverviewFixed = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [houseFilter, setHouseFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Fetch bookings with house information
  const { data: bookingsData, isLoading, error } = useQuery({
    queryKey: ['bookings-overview'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          houses:house_id (
            id,
            name
          )
        `)
        .order('check_in', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch houses for filter dropdown
  const { data: houses } = useQuery({
    queryKey: ['houses-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch service tasks for bookings
  const { data: serviceTasks } = useQuery({
    queryKey: ['service-tasks-overview'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_tasks')
        .select('*');
      
      if (error) throw error;
      return data;
    },
  });

  // Enhanced time filtering logic
  const getTimeFilterDates = () => {
    const now = new Date();
    
    switch (timeFilter) {
      case 'next-3-months':
        return {
          start: startOfDay(now),
          end: endOfDay(addMonths(now, 3))
        };
      case 'next-6-months':
        return {
          start: startOfDay(now),
          end: endOfDay(addMonths(now, 6))
        };
      case 'current-year':
        return {
          start: startOfYear(now),
          end: endOfYear(now)
        };
      case 'next-year':
        const nextYear = new Date(now.getFullYear() + 1, 0, 1);
        return {
          start: startOfDay(nextYear),
          end: endOfYear(nextYear)
        };
      case 'last-year':
        const lastYear = new Date(now.getFullYear() - 1, 0, 1);
        return {
          start: startOfYear(lastYear),
          end: endOfYear(lastYear)
        };
      case 'custom':
        return {
          start: customDateFrom ? startOfDay(customDateFrom) : null,
          end: customDateTo ? endOfDay(customDateTo) : null
        };
      case 'all':
      default:
        return { start: null, end: null };
    }
  };

  // Filter bookings based on search and filters
  const filteredBookings = bookingsData?.filter(booking => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const guestMatch = booking.guest_name?.toLowerCase().includes(searchLower);
      const houseMatch = booking.houses?.name?.toLowerCase().includes(searchLower);
      if (!guestMatch && !houseMatch) return false;
    }

    // Status filter
    if (statusFilter !== 'all' && booking.status !== statusFilter) {
      return false;
    }

    // House filter
    if (houseFilter !== 'all' && booking.house_id !== houseFilter) {
      return false;
    }

    // Enhanced time filter
    const { start, end } = getTimeFilterDates();
    if (start || end) {
      const checkIn = parseISO(booking.check_in);
      const checkOut = parseISO(booking.check_out);
      
      // Show booking if it overlaps with the time filter range
      if (start && end) {
        // Booking must end after filter start AND start before filter end
        if (isBefore(checkOut, start) || isAfter(checkIn, end)) {
          return false;
        }
      } else if (start) {
        // Only start date specified - booking must end after start
        if (isBefore(checkOut, start)) {
          return false;
        }
      } else if (end) {
        // Only end date specified - booking must start before end
        if (isAfter(checkIn, end)) {
          return false;
        }
      }
    }

    return true;
  }) || [];

  // Statistics for filtered results
  const filteredStats = {
    total: filteredBookings.length,
    confirmed: filteredBookings.filter(b => b.status === 'confirmed').length,
    completed: filteredBookings.filter(b => b.status === 'completed').length,
    totalRevenue: filteredBookings.reduce((sum, b) => sum + (b.booking_amount || 0), 0)
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Bestätigt</Badge>;
      case 'checked_in':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Eingecheckt</Badge>;
      case 'completed':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300">Abgeschlossen</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 border-red-300">Storniert</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getServiceInfo = (bookingId: string) => {
    if (!serviceTasks) return null;
    
    const bookingTasks = serviceTasks.filter(task => task.booking_id === bookingId);
    if (bookingTasks.length === 0) return null;

    return bookingTasks.map(task => (
      <div key={task.id} className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
        {task.service_type === 'cleaning' ? '🧹' : '👕'} {task.service_type} - 
        {task.status === 'scheduled' ? ' (geplant)' : 
         task.status === 'in_progress' ? ' (läuft)' : 
         task.status === 'completed' ? ' (fertig)' : ` (${task.status})`}
      </div>
    ));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">Buchungen werden geladen...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-red-500">Fehler beim Laden der Buchungen</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Buchungsübersicht</h1>
          <p className="text-muted-foreground">Alle Buchungen verwalten und bearbeiten</p>
        </div>
        <CreateBookingDialog onBookingCreated={() => window.location.reload()} />
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{filteredStats.total}</div>
            <p className="text-xs text-muted-foreground">Buchungen gesamt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{filteredStats.confirmed}</div>
            <p className="text-xs text-muted-foreground">Bestätigt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{filteredStats.completed}</div>
            <p className="text-xs text-muted-foreground">Abgeschlossen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-orange-600">
              {filteredStats.totalRevenue.toLocaleString('de-DE')} EUR
            </div>
            <p className="text-xs text-muted-foreground">Gesamtumsatz</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Main Filter Row */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Nach Gast oder Haus suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="confirmed">Bestätigt</SelectItem>
                  <SelectItem value="checked_in">Eingecheckt</SelectItem>
                  <SelectItem value="completed">Abgeschlossen</SelectItem>
                  <SelectItem value="cancelled">Storniert</SelectItem>
                </SelectContent>
              </Select>

              {/* House Filter */}
              <Select value={houseFilter} onValueChange={setHouseFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Haus" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
                  <SelectItem value="all">Alle Häuser</SelectItem>
                  {houses?.map((house) => (
                    <SelectItem key={house.id} value={house.id}>
                      {house.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Time Filter */}
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Zeitraum" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
                  <SelectItem value="all">Alle Zeiträume</SelectItem>
                  <SelectItem value="next-3-months">Nächsten 3 Monate</SelectItem>
                  <SelectItem value="next-6-months">Nächsten 6 Monate</SelectItem>
                  <SelectItem value="current-year">Aktuelles Jahr</SelectItem>
                  <SelectItem value="next-year">Nächstes Jahr</SelectItem>
                  <SelectItem value="last-year">Letztes Jahr</SelectItem>
                  <SelectItem value="custom">Benutzerdefiniert</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Range */}
            {timeFilter === 'custom' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <label className="text-sm font-medium mb-2 block">Von Datum</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !customDateFrom && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customDateFrom ? format(customDateFrom, "dd.MM.yyyy", { locale: de }) : "Datum wählen"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-background border shadow-md z-50" align="start">
                      <Calendar
                        mode="single"
                        selected={customDateFrom}
                        onSelect={setCustomDateFrom}
                        locale={de}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Bis Datum</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !customDateTo && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {customDateTo ? format(customDateTo, "dd.MM.yyyy", { locale: de }) : "Datum wählen"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-background border shadow-md z-50" align="start">
                      <Calendar
                        mode="single"
                        selected={customDateTo}
                        onSelect={setCustomDateTo}
                        locale={de}
                        className="pointer-events-auto"
                        disabled={(date) => customDateFrom ? date < customDateFrom : false}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bookings Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gast</TableHead>
                <TableHead>Nationalität</TableHead>
                <TableHead>Haus</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Gäste</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Buchungsbetrag</TableHead>
                <TableHead>Services</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell className="font-medium">
                    {booking.guest_name}
                  </TableCell>
                  <TableCell>
                    {getCountryName(booking.nationality)}
                  </TableCell>
                  <TableCell>
                    {booking.houses?.name || 'Unbekannt'}
                  </TableCell>
                  <TableCell>
                    {format(parseISO(booking.check_in), 'dd.MM.yyyy, HH:mm', { locale: de })}
                  </TableCell>
                  <TableCell>
                    {format(parseISO(booking.check_out), 'dd.MM.yyyy, HH:mm', { locale: de })}
                  </TableCell>
                  <TableCell>
                    {booking.number_of_guests}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(booking.status)}
                  </TableCell>
                  <TableCell>
                    {booking.booking_amount ? 
                      `${booking.booking_amount} ${booking.currency || 'EUR'}` : 
                      '-'
                    }
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {getServiceInfo(booking.id)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <EditBookingDialog 
                      booking={booking}
                      onBookingUpdated={() => window.location.reload()}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {filteredBookings.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {searchTerm || statusFilter !== 'all' || houseFilter !== 'all' 
                  ? 'Keine Buchungen gefunden, die den Filterkriterien entsprechen.'
                  : 'Noch keine Buchungen vorhanden.'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BookingOverviewFixed;