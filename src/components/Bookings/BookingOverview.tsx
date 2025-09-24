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
import { Plus, Search, Edit } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

const BookingOverview = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [houseFilter, setHouseFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('next-3-months');

  // Fetch bookings with house information
  const { data: bookingsData, isLoading } = useQuery({
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

    // Time filter (next 3 months)
    if (timeFilter === 'next-3-months') {
      const now = new Date();
      const threeMonthsLater = new Date();
      threeMonthsLater.setMonth(now.getMonth() + 3);
      const checkIn = parseISO(booking.check_in);
      
      if (checkIn < now || checkIn > threeMonthsLater) {
        return false;
      }
    }

    return true;
  }) || [];

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Buchungsübersicht</h1>
          <p className="text-muted-foreground">Alle Buchungen verwalten und bearbeiten</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Buchung erstellen
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
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
              <SelectContent>
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
              <SelectContent>
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
              <SelectContent>
                <SelectItem value="next-3-months">Nächsten 3 Monate</SelectItem>
                <SelectItem value="all">Alle Zeiträume</SelectItem>
                <SelectItem value="current-year">Aktuelles Jahr</SelectItem>
                <SelectItem value="next-year">Nächstes Jahr</SelectItem>
              </SelectContent>
            </Select>
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
                    <Button variant="ghost" size="sm">
                      <Edit className="w-4 h-4" />
                    </Button>
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

export default BookingOverview;