import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClickableCard } from '@/components/ui/clickable-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info as InfoIcon, StickyNote, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useIsMobile } from '@/hooks/use-mobile';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import CreateCleaningTaskDialog from './CreateCleaningTaskDialog';
import EditCleaningTaskDialog from './EditCleaningTaskDialog';
import AutoCleaningSettingsCard from './AutoCleaningSettingsCard';
import { getGuestName } from '@/lib/guestHelpers';
import NotesQuickDialog from '@/components/shared/NotesQuickDialog';
import { useToast } from '@/hooks/use-toast';

const CleaningManagement = () => {
  const location = useLocation();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [openCheck, setOpenCheck] = useState(true);
  const [openTasks, setOpenTasks] = useState(true);
  useEffect(() => {
    setOpenCheck(!isMobile);
    setOpenTasks(!isMobile);
  }, [isMobile]);
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
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBookingForCreation, setSelectedBookingForCreation] = useState<any>(null);
  const [notesTask, setNotesTask] = useState<{ id: string; notes: string | null } | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const { toast } = useToast();

  const saveTaskNotes = async (taskId: string, newNotes: string) => {
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('service_tasks')
        .update({ notes: newNotes || null })
        .eq('id', taskId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['cleaning-tasks'] });
      toast({ title: 'Notiz gespeichert' });
    } catch (err: any) {
      toast({ title: 'Fehler beim Speichern', description: err.message, variant: 'destructive' });
    } finally {
      setSavingNotes(false);
    }
  };

  // Auto-open task dialog when navigating from chat
  useEffect(() => {
    const state = location.state as { openTaskId?: string } | null;
    if (state?.openTaskId) {
      setEditTaskId(state.openTaskId);
      setShowEditDialog(true);
      
      // Clear state to prevent reopening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Realtime updates for cleaning tasks
  useEffect(() => {
    const channel = supabase
      .channel('cleaning-tasks-realtime')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'service_tasks',
          filter: 'service_type=eq.cleaning'
        },
        (payload) => {
          console.log('Realtime update für cleaning tasks:', payload);
          queryClient.invalidateQueries({ queryKey: ['cleaning-tasks'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Fetch bookings without cleaning tasks
  const { data: bookingsWithoutCleaning, isLoading: loadingBookings } = useQuery({
    queryKey: ['bookings-without-cleaning', searchTerm, selectedHouse, timeFilter, providerFilter, bookingFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select(`
          *,
          guests (*),
          houses!bookings_house_id_fkey!inner(id, name, address, rental_type),
          service_tasks!service_tasks_booking_id_fkey(id, service_type, status)
        `)
        .eq('houses.rental_type', 'tourist')
        .neq('status', 'completed') // Exclude completed bookings
        .gte('check_out', new Date().toISOString()); // Only future or current bookings

      // Search filtering is done client-side after fetch (supports house name search)

      if (selectedHouse !== 'all') {
        query = query.eq('house_id', selectedHouse);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
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

      // Client-side house name filter (PostgREST doesn't support joined table filters in .or())
      let filtered = data || [];
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(booking => 
          booking.guest_name?.toLowerCase().includes(term) ||
          (booking.houses as any)?.name?.toLowerCase().includes(term)
        );
      }

      if (bookingFilter === 'without_cleaning') {
        return filtered.filter(booking => {
          const cleaningTasks = booking.service_tasks?.filter(
            task => task.service_type === 'cleaning'
          ) || [];
          return cleaningTasks.length === 0;
        });
      } else if (bookingFilter === 'with_cleaning') {
        return filtered.filter(booking => {
          const cleaningTasks = booking.service_tasks?.filter(
            task => task.service_type === 'cleaning'
          ) || [];
          return cleaningTasks.length > 0;
        });
      }

      return filtered;
    },
    enabled: showBookingResults,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Function to handle creating cleaning task for specific booking
  const handleCreateCleaningTask = (booking: any) => {
    setSelectedBookingForCreation(booking);
    setShowCreateDialog(true);
  };

  // Fetch all cleaning tasks
  const { data: cleaningTasks, isLoading: loadingTasks } = useQuery({
    queryKey: ['cleaning-tasks', taskSearchTerm, taskProviderFilter, taskHouseFilter, taskStatusFilter],
    queryFn: async () => {
      let query = supabase
        .from('service_tasks')
        .select(`
          *,
          houses!service_tasks_house_id_fkey!inner(id, name, address, rental_type),
          bookings!service_tasks_booking_id_fkey(id, guest_name, check_in, check_out, number_of_guests, guests!bookings_guest_id_fkey(*)),
          service_providers!service_tasks_provider_id_fkey(id, name, service_type),
          cleaning_assignments!cleaning_assignments_service_task_id_fkey(id, cleaning_staff!cleaning_assignments_cleaning_staff_id_fkey(id, name))
        `)
        .eq('service_type', 'cleaning')
        .eq('houses.rental_type', 'tourist')
        .order('scheduled_date', { ascending: false }); // Sort by date, newest first

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

      // Apply search filter on client side
      let filteredData = data || [];

      if (taskSearchTerm && taskSearchTerm.trim() !== '') {
        const searchLower = taskSearchTerm.trim().toLowerCase();
        filteredData = filteredData.filter(task => {
          const guestName = task.bookings ? getGuestName(task.bookings).toLowerCase() : '';
          const houseName = task.houses?.name?.toLowerCase() || '';
          
          return guestName.includes(searchLower) || houseName.includes(searchLower);
        });
      }

      // Sort based on status: upcoming tasks ascending, completed/cancelled descending
      filteredData.sort((a, b) => {
        const dateA = new Date(a.scheduled_date).getTime();
        const dateB = new Date(b.scheduled_date).getTime();
        
        // For scheduled/in_progress: show nearest first (ascending)
        if (taskStatusFilter === 'scheduled' || taskStatusFilter === 'in_progress') {
          return dateA - dateB;
        }
        // For completed/cancelled: show newest first (descending)
        else if (taskStatusFilter === 'completed' || taskStatusFilter === 'cancelled') {
          return dateB - dateA;
        }
        // For "all": show scheduled ascending, completed/cancelled descending
        else {
          if ((a.status === 'scheduled' || a.status === 'in_progress') && 
              (b.status === 'scheduled' || b.status === 'in_progress')) {
            return dateA - dateB;
          } else if ((a.status === 'completed' || a.status === 'cancelled') && 
                     (b.status === 'completed' || b.status === 'cancelled')) {
            return dateB - dateA;
          } else if (a.status === 'scheduled' || a.status === 'in_progress') {
            return -1; // Scheduled tasks first
          } else {
            return 1;
          }
        }
      });

      return filteredData;
    },
    refetchOnMount: 'always',
    staleTime: 0,
  });

  // Fetch houses for filters
  const { data: houses } = useQuery({
    queryKey: ['houses-cleaning-filter', 'tourist'],
    queryFn: async () => {
      const { data } = await supabase
        .from('houses')
        .select('id, name')
        .eq('rental_type', 'tourist')
        .order('name');
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

  const getStatusText = (status: string) => {
    switch(status) {
      case 'draft': return 'Entwurf';
      case 'scheduled': return 'Geplant';
      case 'in_progress': return 'In Bearbeitung';
      case 'completed': return 'Abgeschlossen';
      case 'cancelled': return 'Storniert';
      default: return status;
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'draft':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400">📝 Entwurf</Badge>;
      case 'scheduled':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400">Geplant</Badge>;
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

  const getPaymentStatusBadge = (paymentStatus: string) => {
    switch(paymentStatus) {
      case 'paid':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400">✅ Bezahlt</Badge>;
      case 'unpaid':
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-400">💳 Offen</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400">⏳ Ausstehend</Badge>;
      default:
        return <Badge variant="outline">{paymentStatus}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
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
              <label className="text-sm font-medium mb-2 block">🔍 Suche</label>
              <Input
                placeholder="Gast, Haus..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">🏠 Haus</label>
              <Select value={selectedHouse} onValueChange={setSelectedHouse}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Häuser" />
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
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">📅 Zeitrahmen</label>
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="24 Monate" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
                  <SelectItem value="1month">1 Monat</SelectItem>
                  <SelectItem value="3months">3 Monate</SelectItem>
                  <SelectItem value="6months">6 Monate</SelectItem>
                  <SelectItem value="12months">12 Monate</SelectItem>
                  <SelectItem value="24months">24 Monate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">🏢 Provider</label>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Provider" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
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
              <label className="text-sm font-medium mb-2 block">📋 Buchungen</label>
              <Select value={bookingFilter} onValueChange={setBookingFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Ohne Reinigungsauftrag" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
                  <SelectItem value="without_cleaning">Ohne Reinigungsauftrag</SelectItem>
                  <SelectItem value="with_cleaning">Mit Reinigungsauftrag</SelectItem>
                  <SelectItem value="all">Alle Buchungen</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">📊 Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Status" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="confirmed">Bestätigt</SelectItem>
                  <SelectItem value="cancelled">Storniert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            className="w-full bg-black text-white hover:bg-gray-800"
            onClick={() => {
              console.log('Button clicked, showBookingResults:', showBookingResults);
              setShowBookingResults(!showBookingResults);
            }}
          >
            <span className="mr-2">🔍</span>
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
                    <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
                      <InfoIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <AlertTitle className="text-blue-900 dark:text-blue-100">Alle Buchungen haben Reinigungsaufträge</AlertTitle>
                      <AlertDescription className="text-blue-700 dark:text-blue-300">
                        Keine Buchungen ohne Reinigungsaufträge gefunden.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    bookingsWithoutCleaning?.map((booking) => (
                      <ClickableCard
                        key={booking.id}
                        onActivate={() => handleCreateCleaningTask(booking)}
                        showChevron={booking.service_tasks?.some(task => task.service_type === 'cleaning')}
                        className="border-l-4 border-l-orange-500 hover:border-l-orange-600 hover:bg-orange-50/40"
                      >
                         <CardContent className="p-4">
                           <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <h4 className="font-semibold flex items-center gap-2">
                                Reinigung - {booking.houses?.name}
                              </h4>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>📍</span>
                                {booking.houses?.address}
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <span>👤</span>
                                Gast: {getGuestName(booking)}
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <span>📅</span>
                                Buchung: {new Date(booking.check_in).toLocaleDateString('de-DE')} - {new Date(booking.check_out).toLocaleDateString('de-DE')}
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <span>👤</span>
                                {booking.number_of_guests} Gäste
                              </div>
                            </div>
                            {booking.service_tasks?.some(task => task.service_type === 'cleaning') ? null : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCreateCleaningTask(booking);
                                }}
                              >
                                <span className="mr-1">➕</span>
                                Reinigung hinzufügen
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </ClickableCard>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Automatisierung */}
      <AutoCleaningSettingsCard />

      {/* Reinigungsaufträge */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle>Reinigungsaufträge</CardTitle>
          <div className="w-full sm:w-auto">
            <CreateCleaningTaskDialog />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">🔍 Suchen</label>
              <Input
                placeholder="Suche..."
                value={taskSearchTerm}
                onChange={(e) => setTaskSearchTerm(e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">🏢 Service Provider</label>
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
              <label className="text-sm font-medium mb-2 block">🧹 Service Typ</label>
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
              <label className="text-sm font-medium mb-2 block">🏠 Haus</label>
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
              <label className="text-sm font-medium mb-2 block">📊 Status</label>
              <Select value={taskStatusFilter} onValueChange={setTaskStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="draft">Entwurf</SelectItem>
                  <SelectItem value="scheduled">Geplant</SelectItem>
                  <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                  <SelectItem value="completed">Abgeschlossen</SelectItem>
                  <SelectItem value="cancelled">Storniert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results for cleaning tasks (außerhalb der Karte für volle Breite) */}
      {loadingTasks ? (
        <div className="text-center py-8">Lädt...</div>
      ) : (
        <div className="space-y-3">
              {cleaningTasks?.map((task) => (
                <ClickableCard
                  key={task.id}
                  onActivate={() => {
                    setEditTaskId(task.id);
                    setShowEditDialog(true);
                  }}
                  className="border-l-4 border-l-blue-600 bg-blue-50 overflow-hidden hover:border-l-blue-700 hover:bg-blue-100/60"
                >
                  {/* Kopfbalken */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 text-white"
                    style={{ background: 'linear-gradient(100deg,#2563eb,#3b82f6)' }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg grid place-items-center text-[15px] shrink-0"
                      style={{ background: 'rgba(255,255,255,.22)' }}
                    >
                      🧹
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-wider opacity-90">
                        Reinigung · {task.houses?.name || 'Unbekannt'}
                      </div>
                      <div className="text-[14px] font-extrabold leading-tight truncate">
                        Reinigung
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Notiz anzeigen/bearbeiten"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotesTask({ id: task.id, notes: task.notes ?? null });
                      }}
                      className="relative grid place-items-center w-7 h-7 rounded-md bg-white/15 hover:bg-white/25 transition-colors shrink-0"
                    >
                      <StickyNote className="w-4 h-4" />
                      {task.notes && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-300 border border-white" />
                      )}
                    </button>
                    <span
                      className="text-[10px] font-extrabold px-2 py-1 rounded-full bg-white/95 shrink-0"
                      style={{ color: '#2563eb' }}
                    >
                      {getStatusText(task.status)}
                    </span>
                  </div>

                  <CardContent className="p-3">
                    <div className="space-y-2">
                      {/* Address */}
                      {task.houses?.address && (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="shrink-0">📍</span>
                          <span className="break-words">{task.houses.address}</span>
                        </div>
                      )}

                      {/* Compact fields grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Service</div>
                          <div className="text-sm">
                            {new Date(task.scheduled_date).toLocaleDateString('de-DE')}
                            {task.scheduled_time ? ` ${task.scheduled_time.slice(0,5)}` : ''}
                          </div>
                        </div>

                        {task.bookings && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Buchung</div>
                            <div className="text-sm truncate">
                              {new Date(task.bookings.check_in).toLocaleDateString('de-DE')} – {new Date(task.bookings.check_out).toLocaleDateString('de-DE')}
                            </div>
                          </div>
                        )}

                        {task.bookings && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gast</div>
                            <div className="text-sm truncate">
                              {getGuestName(task.bookings)}
                              <span className="text-muted-foreground"> ({task.bookings.number_of_guests})</span>
                            </div>
                          </div>
                        )}

                        {task.service_providers && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Provider</div>
                            <div className="text-sm truncate">{task.service_providers.name}</div>
                          </div>
                        )}

                        {task.cleaning_cost && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Kosten</div>
                            <div className="text-sm font-semibold text-green-700">{task.cleaning_cost.toFixed(2)} EUR</div>
                          </div>
                        )}

                        {task.payment_status && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Bezahlung</div>
                            <div className="text-sm">{getPaymentStatusBadge(task.payment_status)}</div>
                          </div>
                        )}

                        {task.cleaning_assignments && task.cleaning_assignments.length > 0 && task.cleaning_assignments[0].cleaning_staff && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Personal</div>
                            <div className="text-sm truncate">{task.cleaning_assignments[0].cleaning_staff.name}</div>
                          </div>
                        )}
                      </div>

                      {/* Status change footer */}
                      {task.status_changed_by && (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap pt-1 border-t border-muted/40">
                          <span>Status geändert von</span>
                          <span className="font-medium">{task.status_changed_by}</span>
                          {task.status_changed_at && (
                            <span>· {new Date(task.status_changed_at).toLocaleDateString('de-DE')} {new Date(task.status_changed_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </ClickableCard>
              ))}
        </div>
      )}

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
            // Data is automatically refreshed via query invalidation in the dialog
          }}
        />
      )}
      
      {/* Create Cleaning Task Dialog for Bookings */}
      {showCreateDialog && selectedBookingForCreation && (
        <CreateCleaningTaskDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          preselectedBooking={selectedBookingForCreation}
          onTaskCreated={() => {
            setShowCreateDialog(false);
            setSelectedBookingForCreation(null);
            // Data is automatically refreshed via query invalidation in the dialog
          }}
        />
      )}

      <NotesQuickDialog
        open={!!notesTask}
        onOpenChange={(open) => !open && setNotesTask(null)}
        title="Notiz zur Reinigung"
        value={notesTask?.notes ?? ''}
        saving={savingNotes}
        onSave={async (val) => {
          if (notesTask) await saveTaskNotes(notesTask.id, val);
        }}
      />
    </div>
  );
};

export default CleaningManagement;