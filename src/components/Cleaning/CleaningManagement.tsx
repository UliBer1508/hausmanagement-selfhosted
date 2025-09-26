import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, MapPin, User, Calendar, Clock, Edit } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import CreateCleaningTaskDialog from './CreateCleaningTaskDialog';
import EditCleaningTaskDialog from './EditCleaningTaskDialog';

const CleaningManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHouse, setSelectedHouse] = useState('all');
  const [timeFilter, setTimeFilter] = useState('24months');
  const [providerFilter, setProviderFilter] = useState('all');
  const [bookingFilter, setBookingFilter] = useState('without_cleaning');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showBookingResults, setShowBookingResults] = useState(false);
  const [taskSearchTerm, setTaskSearchTerm] = useState('');
  const [taskProviderFilter, setTaskProviderFilter] = useState('all');
  const [taskServiceType, setTaskServiceType] = useState('cleaning');
  const [taskHouseFilter, setTaskHouseFilter] = useState('all');
  const [taskTimeFilter, setTaskTimeFilter] = useState('3months');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Fetch bookings without cleaning tasks
  const { data: bookingsWithoutCleaning, isLoading: loadingBookings } = useQuery({
    queryKey: ['bookings-without-cleaning', searchTerm, selectedHouse, timeFilter, providerFilter, bookingFilter],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select(`
          *,
          houses!inner(id, name, address),
          service_tasks(id, service_type)
        `)
        .neq('status', 'completed') // Exclude completed bookings
        .gte('check_out', new Date().toISOString()); // Only future or current bookings

      if (searchTerm) {
        query = query.or(`guest_name.ilike.%${searchTerm}%, houses.name.ilike.%${searchTerm}%`);
      }

      if (selectedHouse !== 'all') {
        query = query.eq('house_id', selectedHouse);
      }

      // Apply time filter
      const now = new Date();
      let endDate = new Date();
      switch (timeFilter) {
        case '1month':
          endDate.setMonth(now.getMonth() + 1);
          break;
        case '3months':
          endDate.setMonth(now.getMonth() + 3);
          break;
        case '6months':
          endDate.setMonth(now.getMonth() + 6);
          break;
        case '12months':
          endDate.setFullYear(now.getFullYear() + 1);
          break;
        case '24months':
          endDate.setFullYear(now.getFullYear() + 2);
          break;
      }
      query = query.lte('check_out', endDate.toISOString());

      const { data } = await query;

      if (bookingFilter === 'without_cleaning') {
        // Filter for bookings without cleaning tasks
        return data?.filter(booking => 
          !booking.service_tasks?.some(task => task.service_type === 'cleaning')
        ) || [];
      } else if (bookingFilter === 'with_cleaning') {
        // Filter for bookings with cleaning tasks
        return data?.filter(booking => 
          booking.service_tasks?.some(task => task.service_type === 'cleaning')
        ) || [];
      }

      return data || [];
    },
    enabled: showBookingResults, // Only run query when button is clicked
  });

  // Fetch all cleaning tasks
  const { data: cleaningTasks, isLoading: loadingTasks } = useQuery({
    queryKey: ['cleaning-tasks', taskSearchTerm, taskProviderFilter, taskHouseFilter, taskTimeFilter, taskStatusFilter],
    queryFn: async () => {
      let query = supabase
        .from('service_tasks')
        .select(`
          *,
          houses!inner(id, name, address),
          bookings(id, guest_name, check_in, check_out, number_of_guests),
          service_providers(id, name, service_type),
          cleaning_assignments(id, cleaning_staff(id, name))
        `)
        .eq('service_type', 'cleaning')
        .order('scheduled_date', { ascending: true }); // Sort by date, nearest first

      if (taskHouseFilter !== 'all') {
        query = query.eq('house_id', taskHouseFilter);
      }

      if (taskProviderFilter !== 'all') {
        query = query.eq('provider_id', taskProviderFilter);
      }

      if (taskStatusFilter !== 'all') {
        query = query.eq('status', taskStatusFilter as any);
      }

      const { data } = await query;
      return data || [];
    },
  });

  // Fetch houses for filters
  const { data: houses } = useQuery({
    queryKey: ['houses'],
    queryFn: async () => {
      const { data } = await supabase.from('houses').select('id, name');
      return data || [];
    },
  });

  // Fetch service providers for filters
  const { data: providers } = useQuery({
    queryKey: ['service-providers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('service_providers')
        .select('id, name')
        .eq('service_type', 'cleaning');
      return data || [];
    },
  });

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'scheduled':
        return <Badge variant="outline">Geplant</Badge>;
      case 'in_progress':
        return <Badge variant="secondary">In Bearbeitung</Badge>;
      case 'completed':
        return <Badge variant="default">Abgeschlossen</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Storniert</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reinigungsservice Verwaltung</h1>
          <p className="text-muted-foreground">Aufträge verwalten</p>
        </div>
      </div>

      {/* Buchungen auf Reinigungsaufträge prüfen */}
      <Card>
        <CardHeader>
          <CardTitle>Buchungen auf Reinigungsaufträge prüfen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Suche</label>
              <Input
                placeholder="Gast, Haus..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Haus</label>
              <Select value={selectedHouse} onValueChange={setSelectedHouse}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Häuser" />
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
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Zeitrahmen</label>
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="24 Monate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1month">1 Monat</SelectItem>
                  <SelectItem value="3months">3 Monate</SelectItem>
                  <SelectItem value="6months">6 Monate</SelectItem>
                  <SelectItem value="12months">12 Monate</SelectItem>
                  <SelectItem value="24months">24 Monate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Provider</label>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Provider</SelectItem>
                  {providers?.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Buchungen</label>
              <Select value={bookingFilter} onValueChange={setBookingFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Ohne Reinigungsauftrag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="without_cleaning">Ohne Reinigungsauftrag</SelectItem>
                  <SelectItem value="with_cleaning">Mit Reinigungsauftrag</SelectItem>
                  <SelectItem value="all">Alle Buchungen</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="confirmed">Bestätigt</SelectItem>
                  <SelectItem value="cancelled">Storniert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            className="w-full bg-black text-white hover:bg-gray-800"
            onClick={() => setShowBookingResults(!showBookingResults)}
          >
            <Search className="w-4 h-4 mr-2" />
            {showBookingResults ? 'Ergebnisse schließen' : 'Buchungen auf Reinigungsaufträge prüfen'}
          </Button>

          {/* Results for bookings without cleaning - only show when button is clicked */}
          {showBookingResults && (
            <>
              {loadingBookings ? (
                <div className="text-center py-8">Lädt...</div>
              ) : (
                <div className="space-y-3">
                  {bookingsWithoutCleaning?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Keine Buchungen ohne Reinigungsaufträge gefunden.
                    </div>
                  ) : (
                    bookingsWithoutCleaning?.map((booking) => (
                      <Card key={booking.id} className="border-l-4 border-l-orange-500">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <h4 className="font-semibold flex items-center gap-2">
                                Reinigung - {booking.houses?.name}
                              </h4>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <MapPin className="w-4 h-4" />
                                {booking.houses?.address}
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <User className="w-4 h-4" />
                                Gast: {booking.guest_name}
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="w-4 h-4" />
                                Buchung: {new Date(booking.check_in).toLocaleDateString('de-DE')} - {new Date(booking.check_out).toLocaleDateString('de-DE')}
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <User className="w-4 h-4" />
                                {booking.number_of_guests} Gäste
                              </div>
                            </div>
                            <Button size="sm" variant="outline">
                              {booking.service_tasks?.some(task => task.service_type === 'cleaning') ? (
                                <>
                                  <Edit className="w-4 h-4 mr-1" />
                                  Bearbeiten
                                </>
                              ) : (
                                <>
                                  <Plus className="w-4 h-4 mr-1" />
                                  Reinigung hinzufügen
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Reinigungsaufträge */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Reinigungsaufträge</CardTitle>
          <CreateCleaningTaskDialog onTaskCreated={() => {
            // Refresh cleaning tasks when new task is created
            window.location.reload();
          }} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Suchen</label>
              <Input
                placeholder="Suche..."
                value={taskSearchTerm}
                onChange={(e) => setTaskSearchTerm(e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Service Provider</label>
              <Select value={taskProviderFilter} onValueChange={setTaskProviderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Provider</SelectItem>
                  {providers?.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Service Typ</label>
              <Select value={taskServiceType} onValueChange={setTaskServiceType}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Typen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cleaning">Reinigung</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Haus</label>
              <Select value={taskHouseFilter} onValueChange={setTaskHouseFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Häuser" />
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
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={taskStatusFilter} onValueChange={setTaskStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="scheduled">Geplant</SelectItem>
                  <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                  <SelectItem value="completed">Abgeschlossen</SelectItem>
                  <SelectItem value="cancelled">Storniert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Results for cleaning tasks */}
          {loadingTasks ? (
            <div className="text-center py-8">Lädt...</div>
          ) : (
            <div className="space-y-3">
              {cleaningTasks?.map((task) => (
                <Card key={task.id} className={`border-l-4 ${
                  task.status === 'completed' ? 'border-l-green-500' : 
                  task.status === 'cancelled' ? 'border-l-red-500' : 
                  'border-l-blue-500'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h4 className="font-semibold">
                            Reinigung - {task.houses?.name}
                          </h4>
                          {getStatusBadge(task.status)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="w-4 h-4" />
                          {task.houses?.address}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4" />
                          Service: {new Date(task.scheduled_date).toLocaleDateString('de-DE')} {task.scheduled_time ? `${task.scheduled_time.slice(0,5)}` : ''} 
                        </div>
                        {task.bookings && (
                          <>
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="w-4 h-4" />
                              Buchung: {new Date(task.bookings.check_in).toLocaleDateString('de-DE')} - {new Date(task.bookings.check_out).toLocaleDateString('de-DE')}
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <User className="w-4 h-4" />
                              Gast: {task.bookings.guest_name}
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <User className="w-4 h-4" />
                              {task.bookings.number_of_guests} Gäste
                            </div>
                          </>
                        )}
                        {task.service_providers && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="w-4 h-4" />
                            Provider: {task.service_providers.name}
                          </div>
                        )}
                        {task.cleaning_assignments && task.cleaning_assignments.length > 0 && task.cleaning_assignments[0].cleaning_staff && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="w-4 h-4" />
                            Personal: {task.cleaning_assignments[0].cleaning_staff.name}
                          </div>
                        )}
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          setEditTaskId(task.id);
                          setShowEditDialog(true);
                        }}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Bearbeiten
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Task Dialog */}
      {editTaskId && (
        <EditCleaningTaskDialog
          taskId={editTaskId}
          open={showEditDialog}
          onOpenChange={(open) => {
            setShowEditDialog(open);
            if (!open) setEditTaskId(null);
          }}
          onTaskUpdated={() => {
            // Refresh cleaning tasks when task is updated or deleted
            window.location.reload();
          }}
        />
      )}
    </div>
  );
};

export default CleaningManagement;