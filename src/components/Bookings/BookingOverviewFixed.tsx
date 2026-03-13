import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
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
import { Plus, Search, Edit, Trash2, Calendar as CalendarIcon, Filter, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parse, parseISO, isAfter, isBefore, isValid, startOfDay, endOfDay, addMonths, startOfYear, endOfYear } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useDeleteBooking } from '@/hooks/useBookings';
import CreateBookingDialog from './CreateBookingDialog';
import EditBookingDialog from './EditBookingDialog';
import { getGuestName } from '@/lib/guestHelpers';

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

// Helper function to get country code (compact display)
const getCountryCode = (code: string | undefined) => {
  if (!code || code === 'none') return '-';
  return code;
};

// Helper function to get full country name for tooltip
const getFullCountryName = (code: string | undefined) => {
  if (!code || code === 'none') return 'Keine Angabe';
  const country = countries.find(c => c.code === code);
  return country ? country.name : code;
};

interface BookingOverviewFixedProps {
  autoOpenBookingId?: string | null;
  onBookingOpened?: () => void;
}

const BookingOverviewFixed = ({ autoOpenBookingId, onBookingOpened }: BookingOverviewFixedProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [houseFilter, setHouseFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
  const [customDateFromText, setCustomDateFromText] = useState("");
  const [customDateToText, setCustomDateToText] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [sortOption, setSortOption] = useState('check_in_asc');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedBookingForEdit, setSelectedBookingForEdit] = useState<any | null>(null);
  const [bookingToDelete, setBookingToDelete] = useState<any | null>(null);
  const [relatedItems, setRelatedItems] = useState<{ cleanings: number; orders: number }>({ cleanings: 0, orders: 0 });
  
  const { toast } = useToast();
  const deleteBookingMutation = useDeleteBooking();

  // Handler für Lösch-Button
  const handleDeleteClick = async (booking: any) => {
    // Zähle verknüpfte Items
    const { data: cleanings } = await supabase
      .from('service_tasks')
      .select('id')
      .eq('booking_id', booking.id);
    
    const { data: orders } = await supabase
      .from('linen_orders')
      .select('id')
      .eq('booking_id', booking.id);
    
    setRelatedItems({
      cleanings: cleanings?.length || 0,
      orders: orders?.length || 0
    });
    setBookingToDelete(booking);
  };

  // Handler für Lösch-Bestätigung
  const handleConfirmDelete = () => {
    if (!bookingToDelete) return;
    
    deleteBookingMutation.mutate(bookingToDelete.id, {
      onSuccess: () => {
        toast({
          title: "Buchung gelöscht",
          description: `Buchung von ${getGuestName(bookingToDelete)} wurde erfolgreich gelöscht.`,
        });
        setBookingToDelete(null);
        window.location.reload();
      },
      onError: (error) => {
        toast({
          title: "Fehler beim Löschen",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  };

  // Fetch bookings with house information
  const { data: bookingsData, isLoading, error } = useQuery({
    queryKey: ['bookings-overview'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          guest_name,
          guest_email,
          guest_phone,
          nationality,
          check_in,
          check_out,
          number_of_guests,
          number_of_adults,
          number_of_children,
          house_id,
          status,
          payment_status,
          booking_amount,
          currency,
          platform,
          external_booking_id,
          external_rating,
          notes,
          created_at,
          updated_at,
          guests (*),
          houses!bookings_house_id_fkey (
            id,
            name
          )
        `)
        .order('check_in', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch houses for filter dropdown (only tourist rentals)
  const { data: houses } = useQuery({
    queryKey: ['houses-list', 'tourist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name')
        .eq('rental_type', 'tourist')
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

  // Auto-Open Booking Dialog wenn via Chat navigiert
  useEffect(() => {
    if (autoOpenBookingId && bookingsData) {
      const booking = bookingsData.find(b => b.id === autoOpenBookingId);
      if (booking) {
        setSelectedBookingForEdit(booking);
        onBookingOpened?.();
      }
    }
  }, [autoOpenBookingId, bookingsData, onBookingOpened]);

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
      const guestMatch = getGuestName(booking).toLowerCase().includes(searchLower);
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

  // Sort bookings based on selected sort option
  const sortedBookings = [...filteredBookings].sort((a, b) => {
    switch (sortOption) {
      case 'check_in_desc':
        return new Date(b.check_in).getTime() - new Date(a.check_in).getTime();
      case 'check_in_asc':
        return new Date(a.check_in).getTime() - new Date(b.check_in).getTime();
      case 'created_at_desc':
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      case 'created_at_asc':
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      case 'guest_name_asc':
        return (a.guest_name || '').localeCompare(b.guest_name || '', 'de');
      case 'guest_name_desc':
        return (b.guest_name || '').localeCompare(a.guest_name || '', 'de');
      case 'amount_desc':
        return (b.booking_amount || 0) - (a.booking_amount || 0);
      case 'amount_asc':
        return (a.booking_amount || 0) - (b.booking_amount || 0);
      default:
        return 0;
    }
  });

  // Verfügbare Jahre aus Buchungsdaten ermitteln
  const availableYears = useMemo(() => {
    if (!bookingsData || bookingsData.length === 0) return [new Date().getFullYear()];
    const years = new Set(bookingsData.map(b => new Date(b.check_in).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [bookingsData]);

  // Buchungen nach Jahr filtern für Statistiken
  const yearFilteredBookings = useMemo(() => {
    return bookingsData?.filter(b => {
      const checkOutDate = new Date(b.check_out);
      return checkOutDate.getFullYear() === selectedYear;
    }) || [];
  }, [bookingsData, selectedYear]);

  // Statistics for selected year - for display in cards
  const yearStats = {
    total: yearFilteredBookings.length,
    confirmed: yearFilteredBookings.filter(b => b.status === 'confirmed').length,
    completed: yearFilteredBookings.filter(b => b.status === 'completed').length,
    totalRevenue: yearFilteredBookings.filter(b => b.status !== 'cancelled').reduce((sum, b) => sum + (b.booking_amount || 0), 0),
    paidRevenue: yearFilteredBookings.filter(b => b.status !== 'cancelled' && b.payment_status === 'paid').reduce((sum, b) => sum + (b.booking_amount || 0), 0)
  };

  // Statistics for filtered results (for reference only)
  const filteredStats = {
    total: filteredBookings.length,
    confirmed: filteredBookings.filter(b => b.status === 'confirmed').length,
    completed: filteredBookings.filter(b => b.status === 'completed').length,
    totalRevenue: filteredBookings.filter(b => b.status !== 'cancelled').reduce((sum, b) => sum + (b.booking_amount || 0), 0)
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

  const getPaymentStatusBadge = (paymentStatus: string | null | undefined) => {
    switch (paymentStatus) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 border-green-300">💰 Bezahlt</Badge>;
      case 'partial':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300">⚠️ Teilweise</Badge>;
      case 'pending':
      default:
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">💤 Ausstehend</Badge>;
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Buchungsübersicht</h1>
          <p className="text-muted-foreground">Alle Buchungen verwalten und bearbeiten</p>
        </div>
        <div className="flex items-center gap-4 sm:ml-auto">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[100px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background">
              {availableYears.map((year) => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CreateBookingDialog onBookingCreated={() => window.location.reload()} />
        </div>
      </div>

      {/* Statistics - Shows selected year bookings */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">📊</span>
            </div>
            <div className="text-2xl font-bold">{yearStats.total}</div>
            <p className="text-xs text-muted-foreground">Buchungen {selectedYear}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">✅</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{yearStats.confirmed}</div>
            <p className="text-xs text-muted-foreground">Bestätigt {selectedYear}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">✔️</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">{yearStats.completed}</div>
            <p className="text-xs text-muted-foreground">Abgeschlossen {selectedYear}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">💰</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {yearStats.totalRevenue.toLocaleString('de-DE')} EUR
            </div>
            <p className="text-xs text-muted-foreground">Gesamtumsatz {selectedYear}</p>
            <div className="mt-2 pt-2 border-t space-y-1 text-xs">
              <p className="text-green-600 flex justify-between">
                <span>✅ Gezahlt:</span>
                <span className="font-medium">{yearStats.paidRevenue.toLocaleString('de-DE')} EUR</span>
              </p>
              <p className="text-orange-600 flex justify-between">
                <span>⚠️ Offen:</span>
                <span className="font-medium">{(yearStats.totalRevenue - yearStats.paidRevenue).toLocaleString('de-DE')} EUR</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          {/* Filter Toggle Button */}
          <div className="mb-4">
            <Button
              variant="outline"
              onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
              className="w-full flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filter & Suche
              </span>
              {isFiltersExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Filter Content - Collapsible */}
          <div className={`${isFiltersExpanded ? 'block' : 'hidden'}`}>
            <div className="space-y-4">
              {/* Main Filter Row */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
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

                {/* Sort Option */}
                <Select value={sortOption} onValueChange={setSortOption}>
                  <SelectTrigger>
                    <ArrowUpDown className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Sortierung" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-md z-50">
                    <SelectItem value="check_in_asc">Check-in (älteste zuerst)</SelectItem>
                    <SelectItem value="check_in_desc">Check-in (neueste zuerst)</SelectItem>
                    <SelectItem value="created_at_desc">Erstellt (neueste zuerst)</SelectItem>
                    <SelectItem value="created_at_asc">Erstellt (älteste zuerst)</SelectItem>
                    <SelectItem value="guest_name_asc">Gastname (A-Z)</SelectItem>
                    <SelectItem value="guest_name_desc">Gastname (Z-A)</SelectItem>
                    <SelectItem value="amount_desc">Betrag (höchste zuerst)</SelectItem>
                    <SelectItem value="amount_asc">Betrag (niedrigste zuerst)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Date Range */}
              {timeFilter === 'custom' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Von Datum</label>
                    <div className="flex gap-1">
                      <Input
                        type="text"
                        placeholder="TT.MM.JJJJ"
                        value={customDateFromText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomDateFromText(val);
                          if (val === "") {
                            setCustomDateFrom(undefined);
                            return;
                          }
                          const parsed = parse(val, 'dd.MM.yyyy', new Date());
                          if (isValid(parsed) && val.length === 10) {
                            setTimeFilter('custom');
                            setCustomDateFrom(parsed);
                          }
                        }}
                        className="flex-1"
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="icon" className="shrink-0">
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-background border shadow-md z-50" align="start">
                          <Calendar
                            mode="single"
                            selected={customDateFrom}
                            onSelect={(date) => {
                              setCustomDateFrom(date);
                              setCustomDateFromText(date ? format(date, "dd.MM.yyyy", { locale: de }) : "");
                            }}
                            locale={de}
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Bis Datum</label>
                    <div className="flex gap-1">
                      <Input
                        type="text"
                        placeholder="TT.MM.JJJJ"
                        value={customDateToText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomDateToText(val);
                          if (val === "") {
                            setCustomDateTo(undefined);
                            return;
                          }
                          const parsed = parse(val, 'dd.MM.yyyy', new Date());
                          if (isValid(parsed) && val.length === 10) {
                            setTimeFilter('custom');
                            setCustomDateTo(parsed);
                          }
                        }}
                        className="flex-1"
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="icon" className="shrink-0">
                            <CalendarIcon className="h-4 w-4" />
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
                </div>
              )}
            </div>
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
                <TableHead>Nat.</TableHead>
                <TableHead>Haus</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Gäste</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zahlung</TableHead>
                <TableHead>Betrag</TableHead>
                <TableHead>Services</TableHead>
                <TableHead>Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell className="font-medium">
                    {booking.guest_name}
                  </TableCell>
                  <TableCell>
                    <span 
                      title={getFullCountryName(booking.nationality)}
                      className="cursor-help"
                    >
                      {getCountryCode(booking.nationality)}
                    </span>
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
                    <span title={
                      (booking.number_of_children !== undefined && booking.number_of_children > 0)
                        ? `${booking.number_of_adults ?? booking.number_of_guests} Erwachsene, ${booking.number_of_children} Kinder`
                        : `${booking.number_of_guests} Gäste`
                    }>
                      {booking.number_of_guests}
                      {(booking.number_of_children !== undefined && booking.number_of_children > 0) && (
                        <span className="text-muted-foreground text-xs ml-1">👶</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(booking.status)}
                  </TableCell>
                  <TableCell>
                    {getPaymentStatusBadge(booking.payment_status)}
                  </TableCell>
                  <TableCell>
                    {booking.booking_amount ? 
                      `${booking.booking_amount.toLocaleString('de-DE')} ${booking.currency || 'EUR'}` : 
                      '-'
                    }
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {getServiceInfo(booking.id)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <EditBookingDialog 
                        booking={booking}
                        onBookingUpdated={() => {
                          console.log('Booking updated, invalidating cache');
                          window.location.reload();
                        }}
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                        }
                      />
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeleteClick(booking)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
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

      {/* Auto-Open Dialog für Chat-Navigation */}
      {selectedBookingForEdit && (
        <div style={{ display: 'none' }}>
          <EditBookingDialog
            booking={selectedBookingForEdit}
            open={true}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedBookingForEdit(null);
              }
            }}
            onBookingUpdated={() => {
              setSelectedBookingForEdit(null);
              window.location.reload();
            }}
          />
        </div>
      )}

      {/* Lösch-Bestätigungsdialog */}
      <AlertDialog open={!!bookingToDelete} onOpenChange={(open) => !open && setBookingToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buchung wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Die Buchung von{' '}
              <strong>{bookingToDelete?.guest_name}</strong> wird unwiderruflich gelöscht.
              
              {(relatedItems.cleanings > 0 || relatedItems.orders > 0) && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="font-medium text-yellow-800">
                    Folgende verknüpfte Einträge werden ebenfalls gelöscht:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-yellow-700">
                    {relatedItems.cleanings > 0 && (
                      <li>• {relatedItems.cleanings} Reinigungsauftrag{relatedItems.cleanings > 1 ? 'äge' : ''}</li>
                    )}
                    {relatedItems.orders > 0 && (
                      <li>• {relatedItems.orders} Wäschebestellung{relatedItems.orders > 1 ? 'en' : ''}</li>
                    )}
                  </ul>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Ja, löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BookingOverviewFixed;