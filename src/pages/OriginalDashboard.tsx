import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { useQuery } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { 
  Home, 
  Calendar as CalendarIcon, 
  Users, 
  Building, 
  Sparkles, 
  Shirt, 
  Search,
  RefreshCw,
  Clock,
  X,
  Edit,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Bell,
  User,
  Trash2,
  Shield,
  Palette,
  Database,
  Save,
  Filter,
  ChevronDown,
  ChevronUp,
  Building2
} from 'lucide-react';
import { format, isSameDay, parseISO, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import steinbockLogo from '@/assets/steinbock-logo.png';
import CreateBookingDialog from '@/components/Bookings/CreateBookingDialog';
import BookingOverviewFixed from '@/components/Bookings/BookingOverviewFixed';
import BookingCard from '@/components/Bookings/BookingCard';
import ServiceTaskCard from '@/components/Bookings/ServiceTaskCard';
import LaundryOrderCard from '@/components/Bookings/LaundryOrderCard';
import Houses from '@/pages/Houses';
import CleaningManagement from '@/components/Cleaning/CleaningManagement';
import GuestManagement from '@/components/Guests/GuestManagement';
import LinenDashboard from '@/components/Houses/LinenDashboard';
import { ProviderManagementDialog } from '@/components/ServicePortal/ProviderManagementDialog';
import { supabase } from '@/integrations/supabase/client';

const OriginalDashboard = () => {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('Übersicht');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  
  // Filter states for overview
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  
  // Settings state
  const [profileSettings, setProfileSettings] = useState({
    displayName: 'Uli Berresheim',
    email: 'uli.berresheim@hotmail.de',
    phone: '+49 171 3020406'
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: false,
    browserNotifications: true,
    bookingNotifications: true,
    serviceUpdates: true
  });

  const [systemSettings, setSystemSettings] = useState({
    language: 'de',
    timezone: 'europe-vienna',
    dateFormat: 'dd-mm-yyyy',
    darkMode: false,
    compactView: false
  });
  const [houseFilter, setHouseFilter] = useState('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);

  // Settings save functions
  const saveProfileSettings = async () => {
    try {
      // First check if a record exists, then update or insert
      const { data: existingRecord } = await supabase
        .from('notification_preferences')
        .select('id')
        .limit(1)
        .single();

      let error;
      if (existingRecord) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('notification_preferences')
          .update({
            user_name: profileSettings.displayName,
            email_address: profileSettings.email,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRecord.id);
        error = updateError;
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('notification_preferences')
          .insert({
            user_name: profileSettings.displayName,
            email_address: profileSettings.email,
            updated_at: new Date().toISOString()
          });
        error = insertError;
      }

      if (error) throw error;

      toast({
        title: "Profil gespeichert",
        description: "Ihre Profileinstellungen wurden erfolgreich aktualisiert.",
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: "Fehler",
        description: "Profileinstellungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  };

  const saveNotificationSettings = async () => {
    try {
      // First check if a record exists, then update or insert
      const { data: existingRecord } = await supabase
        .from('notification_preferences')
        .select('id')
        .limit(1)
        .single();

      let error;
      if (existingRecord) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('notification_preferences')
          .update({
            email_notifications: notificationSettings.emailNotifications,
            push_notifications: notificationSettings.browserNotifications,
            notify_new_tasks: notificationSettings.bookingNotifications,
            notify_task_changes: notificationSettings.serviceUpdates,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRecord.id);
        error = updateError;
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('notification_preferences')
          .insert({
            email_notifications: notificationSettings.emailNotifications,
            push_notifications: notificationSettings.browserNotifications,
            notify_new_tasks: notificationSettings.bookingNotifications,
            notify_task_changes: notificationSettings.serviceUpdates,
            updated_at: new Date().toISOString()
          });
        error = insertError;
      }

      if (error) throw error;

      toast({
        title: "Benachrichtigungen gespeichert",
        description: "Ihre Benachrichtigungseinstellungen wurden aktualisiert.",
      });
    } catch (error) {
      console.error('Error saving notifications:', error);
      toast({
        title: "Fehler",
        description: "Benachrichtigungseinstellungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  };

  const sendTestNotification = () => {
    toast({
      title: "Testbenachrichtigung",
      description: "Dies ist eine Testbenachrichtigung. Ihre Einstellungen funktionieren!",
    });
  };

  const saveAllSettings = async () => {
    await Promise.all([
      saveProfileSettings(),
      saveNotificationSettings()
    ]);
    
    toast({
      title: "Alle Einstellungen gespeichert",
      description: "Alle Ihre Einstellungen wurden erfolgreich aktualisiert.",
    });
  };
  const [timePeriodFilter, setTimePeriodFilter] = useState('all');

  // Fetch real bookings data with optimized caching
  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ['dashboard-bookings-v2'],
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
          booking_amount,
          currency,
          notes,
          status,
          houses:house_id (
            id,
            name,
            address
          )
        `)
        .order('check_in', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch service tasks with provider information - optimized
  const { data: serviceTasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['dashboard-service-tasks', activeTab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_tasks')
        .select(`
          id,
          status,
          scheduled_date,
          service_type,
          booking_id,
          house_id,
          provider_id,
          service_providers:provider_id (
            id,
            name,
            service_type,
            contact_email,
            contact_phone
          )
        `)
        .order('scheduled_date', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    staleTime: 3 * 60 * 1000, // 3 minutes
    enabled: activeTab === 'Übersicht' || activeTab === 'Reinigung',
  });

  // Fetch houses data for filters
  const { data: housesData } = useQuery({
    queryKey: ['dashboard-houses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Filter bookings based on current filters
  const filteredBookings = useMemo(() => {
    if (!bookingsData) return [];
    
    return bookingsData.filter(booking => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesGuest = booking.guest_name?.toLowerCase().includes(searchLower);
        const matchesHouse = booking.houses?.name?.toLowerCase().includes(searchLower);
        if (!matchesGuest && !matchesHouse) return false;
      }
      
      // Status filter
      if (statusFilter !== 'all' && booking.status !== statusFilter) {
        return false;
      }
      
      // House filter
      if (houseFilter !== 'all' && booking.houses?.id !== houseFilter) {
        return false;
      }
      
      // Time period filter
      if (timePeriodFilter !== 'all') {
        const checkInDate = new Date(booking.check_in);
        const now = new Date();
        const threeMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
        const sixMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
        const yearEnd = new Date(now.getFullYear(), 11, 31);
        
        switch (timePeriodFilter) {
          case 'next3months':
            if (checkInDate > threeMonthsFromNow) return false;
            break;
          case 'next6months':
            if (checkInDate > sixMonthsFromNow) return false;
            break;
          case 'thisyear':
            if (checkInDate > yearEnd) return false;
            break;
        }
      }
      
      return true;
    });
  }, [bookingsData, searchTerm, statusFilter, houseFilter, timePeriodFilter]);

  // Service type filter - applied to tasks
  const getFilteredTasksByService = useCallback((tasks: any[]) => {
    if (serviceTypeFilter === 'all') return tasks;
    return tasks.filter(task => task.service_type === serviceTypeFilter);
  }, [serviceTypeFilter]);
  const { data: cleaningAssignments } = useQuery({
    queryKey: ['cleaning-assignments-minimal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleaning_assignments')
        .select(`
          id,
          service_task_id,
          cleaning_staff (
            id,
            name,
            email,
            phone,
            hourly_rate
          )
        `)
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === 'Übersicht' || activeTab === 'Reinigung',
  });

  // Optimized cleaning staff query  
  const { data: cleaningStaff } = useQuery({
    queryKey: ['cleaning-staff-minimal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleaning_staff')
        .select('id, name, email, phone, hourly_rate')
        .limit(20);
      
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - staff changes less frequently
    enabled: activeTab === 'Übersicht' || activeTab === 'Reinigung',
  });

  // Fetch linen orders (corrected from laundry_orders)
  const { data: linenOrders } = useQuery({
    queryKey: ['dashboard-linen-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          *,
          service_providers:provider_id (
            id,
            name,
            service_type
          ),
          bookings:booking_id (
            id,
            guest_name
          )
        `);
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === 'Übersicht' || activeTab === 'Wäsche',
  });

  // Optimized data processing with useMemo
  const processedBookingData = useMemo(() => {
    if (!bookingsData || !serviceTasks) return [];
    
    return bookingsData.map(booking => {
      const bookingTasks = serviceTasks.filter(task => task.booking_id === booking.id) || [];
      
      // Add cleaning assignments and staff data to tasks
      const tasksWithAssignments = bookingTasks.map(task => {
        const assignments = cleaningAssignments?.filter(assignment => assignment.service_task_id === task.id) || [];
        
        return {
          ...task,
          cleaning_assignments: assignments,
          direct_assigned_staff: null // Simplified for now
        };
      });
      
      // Get linen orders by booking_id (corrected matching logic)
      const bookingLaundry = linenOrders?.filter(order => order.booking_id === booking.id) || [];
      
      return {
        ...booking,
        tasks: tasksWithAssignments,
        laundry: bookingLaundry
      };
    });
  }, [bookingsData, serviceTasks, cleaningAssignments, cleaningStaff, linenOrders]);

  // Memoized loading state
  const isLoading = bookingsLoading || tasksLoading;

  // Get related data for each booking (memoized for performance)
  const getBookingRelatedData = useMemo(() => 
    (bookingId: string) => {
      const bookingData = processedBookingData.find(b => b.id === bookingId);
      return bookingData ? { tasks: bookingData.tasks, laundry: bookingData.laundry } : { tasks: [], laundry: [] };
    }, 
    [processedBookingData]
  );

  const tabs = [
    { name: 'Übersicht', emoji: '📊' },
    { name: 'Kalender', emoji: '📅' },
    { name: 'Buchungen', emoji: '📅' },
    { name: 'Gäste', emoji: '👥' },
    { name: 'Häuser', emoji: '🏠' },
    { name: 'Reinigung', emoji: '✨' },
    { name: 'Provider', emoji: '🏢' },
    { name: 'Wäsche', emoji: '💧' },
    { name: 'Einstellungen', emoji: '⚙️' }
  ];

  const houses = [
    { name: 'Venedig', status: 'Frei', icon: '🏘️' },
    { name: 'Wald', status: 'Frei', icon: '🏔️' }
  ];

  const activeBookings = [
    { house: 'Wald', guest: 'Dr', date: '12.10.', icon: '🏔️' },
    { house: 'Wald', guest: 'Anke', date: '20.12.', icon: '🏔️' }
  ];

  const cleaningTasks = [
    { house: 'Wald', guest: 'Dr', date: '10.10.', count: 1, icon: '🏔️' },
    { house: 'Wald', guest: 'Anke', date: '19.12.', count: 1, icon: '🏔️' }
  ];

  const laundryNeeds = [
    { name: 'Wald Chalet', status: 'Kritisch' },
    { name: 'Venedigersiedlung', status: 'Kritisch' }
  ];

  const getEventsForDate = (date: Date) => {
    const events = [];
    
    // Use real bookings data instead of mock data
    const realBookings = bookingsData || [];
    
    realBookings.forEach(booking => {
      const checkIn = parseISO(booking.check_in);
      const checkOut = parseISO(booking.check_out);
      const guestDisplayName = booking.guest_name.split(' ')[0];
      const houseDisplayName = booking.houses?.name || 'Unbekanntes Haus';
      
      if (isSameDay(date, checkIn)) {
        events.push({
          type: 'checkin',
          title: `Check-in: ${guestDisplayName}`,
          booking: {
            ...booking,
            guest: booking.guest_name,
            house: houseDisplayName,
            checkIn: booking.check_in,
            checkOut: booking.check_out
          },
          color: 'bg-green-100 text-green-800'
        });
      }
      
      if (isSameDay(date, checkOut)) {
        events.push({
          type: 'checkout',
          title: `Check-out: ${guestDisplayName}`,
          booking: {
            ...booking,
            guest: booking.guest_name,
            house: houseDisplayName,
            checkIn: booking.check_in,
            checkOut: booking.check_out
          },
          color: 'bg-red-100 text-red-800'
        });
      }
      
      // Belegt-Zeitraum (zwischen Check-in und Check-out)
      const currentDate = new Date(date);
      if (currentDate > checkIn && currentDate < checkOut) {
        events.push({
          type: 'occupied',
          title: `Belegt: ${guestDisplayName}`,
          booking: {
            ...booking,
            guest: booking.guest_name,
            house: houseDisplayName,
            checkIn: booking.check_in,
            checkOut: booking.check_out
          },
          color: 'bg-orange-100 text-orange-800'
        });
      }
    });
    
    return events;
  };

  const renderCalendarView = () => {
    // Helper function to get the start of the week (Monday)
    const getWeekStart = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
      return new Date(d.setDate(diff));
    };

    // Helper function to get all dates in a week
    const getWeekDates = (weekStart: Date) => {
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        dates.push(date);
      }
      return dates;
    };

    const renderWeekView = () => {
      const weekStart = getWeekStart(selectedDate);
      const weekDates = getWeekDates(weekStart);
      
      return (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="p-3 sm:p-6">
            {/* Week Header */}
            <div className="hidden sm:grid grid-cols-7 gap-2 mb-4">
              {['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'].map((day, index) => (
                <div key={day} className="text-center font-medium text-sm text-muted-foreground p-2">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Mobile: Short day names */}
            <div className="grid grid-cols-7 gap-1 sm:hidden mb-4">
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
                <div key={day} className="text-center font-medium text-xs text-muted-foreground p-1">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Week Days */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {weekDates.map((date) => {
                const events = getEventsForDate(date);
                const isToday = isSameDay(date, new Date());
                const isSelected = isSameDay(date, selectedDate);
                
                return (
                  <div 
                    key={date.toISOString()}
                    className={`
                      relative p-1 sm:p-3 border border-border min-h-[80px] sm:min-h-[120px] cursor-pointer transition-colors
                      hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground
                      ${isSelected ? 'bg-primary text-primary-foreground' : ''}
                      ${isToday ? 'bg-accent text-accent-foreground font-semibold border-2 border-primary' : ''}
                    `}
                    onClick={() => setSelectedDate(date)}
                  >
                    <div className="font-medium text-xs sm:text-sm mb-1 sm:mb-2">
                      {format(date, 'd')}
                    </div>
                    <div className="space-y-0.5 sm:space-y-1">
                      {events.slice(0, 3).map((event, index) => (
                        <div
                          key={index}
                          className={`text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded-md ${event.color} truncate font-medium cursor-pointer hover:opacity-80`}
                          title={`${event.title} - ${event.booking.house}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                          }}
                        >
                          {event.title}
                        </div>
                      ))}
                      {events.length > 3 && (
                        <div className="text-[10px] sm:text-xs text-muted-foreground font-medium">
                          +{events.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    };

    const renderMonthView = () => {
      return (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="p-3 sm:p-6">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              month={selectedDate}
              onMonthChange={setSelectedDate}
              locale={de}
              className="pointer-events-auto w-full bg-white"
              classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 w-full",
                month: "space-y-4 w-full",
                caption: "hidden",
                caption_label: "hidden",
                nav: "hidden",
                nav_button: "hidden",
                nav_button_previous: "hidden",
                nav_button_next: "hidden",
                table: "w-full border-collapse",
                head_row: "flex w-full mb-1 sm:mb-2",
                head_cell: "text-muted-foreground rounded-md w-full font-medium text-[9px] sm:text-sm p-0.5 sm:p-2 text-center",
                row: "flex w-full",
                cell: "relative p-0 text-center text-sm w-full border border-border min-h-[70px] sm:min-h-[90px]",
                day: "h-full w-full p-1 sm:p-2 font-normal aria-selected:opacity-100 hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground flex flex-col items-start justify-start cursor-pointer transition-colors",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground font-semibold border-2 border-primary",
                day_outside: "text-muted-foreground opacity-50",
                day_disabled: "text-muted-foreground opacity-30 cursor-not-allowed",
              }}
              components={{
                DayContent: ({ date }) => {
                  const events = getEventsForDate(date);
                  return (
                    <div className="w-full h-full flex flex-col gap-0.5 sm:gap-1">
                      <div className="font-medium text-[9px] sm:text-sm text-foreground shrink-0">
                        {format(date, 'd')}
                      </div>
                      <div className="flex-1 space-y-0.5 w-full overflow-hidden">
                        {events.slice(0, 2).map((event, index) => (
                          <div
                            key={index}
                            className={`text-[7px] sm:text-xs px-0.5 sm:px-2 py-0.5 rounded-sm sm:rounded-md ${event.color} w-full font-medium cursor-pointer hover:opacity-80 leading-tight overflow-hidden`}
                            style={{ wordBreak: 'break-word' }}
                            title={`${event.title} - ${event.booking.house}`}
                            onClick={() => setSelectedEvent(event)}
                          >
                            {event.title}
                          </div>
                        ))}
                        {events.length > 2 && (
                          <div className="text-[7px] sm:text-xs text-muted-foreground font-medium">
                            +{events.length - 2}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
              }}
            />
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        {/* Calendar Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card p-4 rounded-lg border">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              {calendarView === 'week' 
                ? `${format(getWeekStart(selectedDate), 'dd. MMM', { locale: de })} - ${format(addDays(getWeekStart(selectedDate), 6), 'dd. MMM yyyy', { locale: de })}`
                : format(selectedDate, 'MMMM yyyy', { locale: de })
              }
            </h2>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, calendarView === 'week' ? -7 : -30))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(new Date())}
              >
                Heute
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, calendarView === 'week' ? 7 : 30))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex space-x-2">
            <Button
              variant={calendarView === 'month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCalendarView('month')}
            >
              Monat
            </Button>
            <Button
              variant={calendarView === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCalendarView('week')}
            >
              Woche
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Calendar */}
          <div className="xl:col-span-3 overflow-x-auto">
            {calendarView === 'week' ? renderWeekView() : renderMonthView()}
          </div>

          {/* Events Sidebar */}
          <div className="space-y-4">
            <Card className="bg-card border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-foreground">
                  Termine für {format(selectedDate, 'dd. MMMM', { locale: de })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedEvent ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${selectedEvent.color}`}>
                        {selectedEvent.title}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEvent(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    {selectedEvent.type === 'checkin' || selectedEvent.type === 'checkout' || selectedEvent.type === 'occupied' ? (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-foreground">Buchungsdetails</h4>
                        <div className="space-y-2 text-sm">
                          <div><span className="font-medium">Gast:</span> {selectedEvent.booking.guest}</div>
                          <div><span className="font-medium">Haus:</span> {selectedEvent.booking.house}</div>
                          <div><span className="font-medium">Zeitraum:</span> {selectedEvent.booking.dates}</div>
                          <div><span className="font-medium">Gäste:</span> {selectedEvent.booking.guests}</div>
                          <div><span className="font-medium">Status:</span> {selectedEvent.booking.status}</div>
                          <div><span className="font-medium">Check-in:</span> {format(parseISO(selectedEvent.booking.checkIn), 'dd.MM.yyyy HH:mm', { locale: de })}</div>
                          <div><span className="font-medium">Check-out:</span> {format(parseISO(selectedEvent.booking.checkOut), 'dd.MM.yyyy HH:mm', { locale: de })}</div>
                        </div>
                      </div>
                    ) : selectedEvent.type === 'cleaning' ? (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-foreground">Reinigungsdetails</h4>
                        <div className="space-y-2 text-sm">
                          <div><span className="font-medium">Haus:</span> {selectedEvent.booking.house}</div>
                          <div><span className="font-medium">Datum:</span> {format(parseISO(selectedEvent.cleaning.date), 'dd.MM.yyyy', { locale: de })}</div>
                          <div><span className="font-medium">Anbieter:</span> {selectedEvent.cleaning.provider}</div>
                          <div><span className="font-medium">Status:</span> {selectedEvent.cleaning.status}</div>
                          <div><span className="font-medium">Buchung:</span> {selectedEvent.booking.guest}</div>
                        </div>
                      </div>
                    ) : selectedEvent.type === 'laundry' ? (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-foreground">Wäschedetails</h4>
                        <div className="space-y-2 text-sm">
                          <div><span className="font-medium">Haus:</span> {selectedEvent.booking.house}</div>
                          <div><span className="font-medium">Status:</span> {selectedEvent.laundry.status}</div>
                          <div><span className="font-medium">Anbieter:</span> {selectedEvent.laundry.provider}</div>
                          <div><span className="font-medium">Artikel:</span> {selectedEvent.laundry.items.join(', ')}</div>
                          <div><span className="font-medium">Buchung:</span> {selectedEvent.booking.guest}</div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : getEventsForDate(selectedDate).length > 0 ? (
                  <div className="space-y-3">
                    {getEventsForDate(selectedDate).map((event, index) => (
                      <div 
                        key={index} 
                        className="p-3 rounded-lg bg-muted/50 border cursor-pointer hover:bg-muted/70 transition-colors"
                        onClick={() => setSelectedEvent(event)}
                      >
                        <div className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${event.color} mb-2`}>
                          {event.title}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {event.booking.house}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.booking.guest}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Keine Termine für diesen Tag</p>
                )}
              </CardContent>
            </Card>

            {/* Legend */}
            <Card className="bg-card border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-foreground">Legende</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 bg-green-500 rounded-md"></div>
                  <span className="text-sm text-foreground">Check-in</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 bg-red-500 rounded-md"></div>
                  <span className="text-sm text-foreground">Check-out</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 bg-orange-500 rounded-md"></div>
                  <span className="text-sm text-foreground">Belegt</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 bg-blue-500 rounded-md"></div>
                  <span className="text-sm text-foreground">Reinigung</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 bg-purple-500 rounded-md"></div>
                  <span className="text-sm text-foreground">Wäsche</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Übersicht':
        return renderOverviewContent();
      case 'Kalender':
        return renderCalendarView();
      case 'Buchungen':
        return <BookingOverviewFixed />;
      case 'Gäste':
        return <GuestManagement />;
      case 'Häuser':
        return <Houses />;
      case 'Reinigung':
        return <CleaningManagement />;
      case 'Provider':
        return (
          <div className="space-y-6">
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Service Provider Portale</h3>
              <p className="text-gray-600 mb-6">Zugang zu den externen Provider-Webapps</p>
              
              <div className="flex justify-center">
                <Button 
                  onClick={() => setIsProviderDialogOpen(true)}
                  variant="outline"
                  className="gap-2"
                >
                  <Building2 className="w-4 h-4" />
                  Provider Verwalten
                </Button>
              </div>
            </div>
            
            {/* Provider Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Amela Webapp */}
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="text-center">
                  <CardTitle className="flex items-center justify-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-500" />
                    Amela Cleaning Portal
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                  <p className="text-sm text-gray-600">
                    Reinigungsaufträge verwalten und bearbeiten
                  </p>
                  <Button 
                    className="w-full" 
                    onClick={() => window.open('https://amela-clean-hub.lovable.app/', '_blank')}
                  >
                    Portal öffnen
                  </Button>
                </CardContent>
              </Card>
              
              {/* Teuni Webapp */}
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="text-center">
                  <CardTitle className="flex items-center justify-center gap-2">
                    <Shirt className="w-5 h-5 text-purple-500" />
                    Teuni Laundry Portal
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                  <p className="text-sm text-gray-600">
                    Wäscheaufträge verwalten und bearbeiten
                  </p>
                  <Button 
                    className="w-full" 
                    onClick={() => window.open('https://fresh-spin-portal.lovable.app/', '_blank')}
                  >
                    Portal öffnen
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        );
      case 'Wäsche':
        return <LinenDashboard />;
      case 'Einstellungen':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold gradient-text">Einstellungen</h1>
              <p className="text-muted-foreground mt-2">
                Verwalten Sie Ihre Kontoeinstellungen und Systemkonfiguration
              </p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Profil Einstellungen */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    Profil
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-16 h-16">
                      <AvatarImage src="/placeholder-avatar.jpg" />
                      <AvatarFallback className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-xl font-semibold">
                        {profileSettings.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-medium">{profileSettings.displayName}</h3>
                      <p className="text-sm text-muted-foreground">{profileSettings.email}</p>
                    </div>
                  </div>
                  
                   <div className="space-y-3">
                     <div>
                       <Label htmlFor="displayName">Anzeigename</Label>
                       <Input 
                         id="displayName" 
                         value={profileSettings.displayName}
                         onChange={(e) => setProfileSettings(prev => ({
                           ...prev,
                           displayName: e.target.value
                         }))}
                       />
                     </div>
                     <div>
                       <Label htmlFor="email">E-Mail</Label>
                       <Input 
                         id="email" 
                         type="email" 
                         value={profileSettings.email}
                         onChange={(e) => setProfileSettings(prev => ({
                           ...prev,
                           email: e.target.value
                         }))}
                       />
                     </div>
                     <div>
                       <Label htmlFor="phone">Telefon</Label>
                       <Input 
                         id="phone" 
                         type="tel" 
                         value={profileSettings.phone}
                         onChange={(e) => setProfileSettings(prev => ({
                           ...prev,
                           phone: e.target.value
                         }))}
                         placeholder="+43 660 8005926"
                       />
                     </div>
                   </div>

                   <Button className="w-full" onClick={saveProfileSettings}>
                     <Save className="w-4 h-4 mr-2" />
                     Profil speichern
                   </Button>
                </CardContent>
              </Card>

              {/* Benachrichtigungen */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-primary" />
                    Benachrichtigungen
                  </CardTitle>
                </CardHeader>
                 <CardContent className="space-y-4">
                   <div className="space-y-4">
                     <div className="flex items-center justify-between">
                       <div>
                         <Label>E-Mail Benachrichtigungen</Label>
                         <p className="text-sm text-muted-foreground">
                           Erhalten Sie Updates per E-Mail
                         </p>
                       </div>
                       <Switch 
                         checked={notificationSettings.emailNotifications}
                         onCheckedChange={(checked) => setNotificationSettings(prev => ({
                           ...prev,
                           emailNotifications: checked
                         }))}
                       />
                     </div>

                     <div className="flex items-center justify-between">
                       <div>
                         <Label>Browser Benachrichtigungen</Label>
                         <p className="text-sm text-muted-foreground">
                           Push-Nachrichten im Browser
                         </p>
                       </div>
                       <Switch 
                         checked={notificationSettings.browserNotifications}
                         onCheckedChange={(checked) => setNotificationSettings(prev => ({
                           ...prev,
                           browserNotifications: checked
                         }))}
                       />
                     </div>

                     <div className="flex items-center justify-between">
                       <div>
                         <Label>Buchungsbenachrichtigungen</Label>
                         <p className="text-sm text-muted-foreground">
                           Bei neuen Buchungen informieren
                         </p>
                       </div>
                       <Switch 
                         checked={notificationSettings.bookingNotifications}
                         onCheckedChange={(checked) => setNotificationSettings(prev => ({
                           ...prev,
                           bookingNotifications: checked
                         }))}
                       />
                     </div>

                     <div className="flex items-center justify-between">
                       <div>
                         <Label>Service-Updates</Label>
                         <p className="text-sm text-muted-foreground">
                           Updates zu Reinigung & Wäsche
                         </p>
                       </div>
                       <Switch 
                         checked={notificationSettings.serviceUpdates}
                         onCheckedChange={(checked) => setNotificationSettings(prev => ({
                           ...prev,
                           serviceUpdates: checked
                         }))}
                       />
                     </div>
                   </div>

                   <div className="space-y-2">
                     <Button variant="outline" className="w-full" onClick={sendTestNotification}>
                       <Bell className="w-4 h-4 mr-2" />
                       Testbenachrichtigung senden
                     </Button>
                     <Button className="w-full" onClick={saveNotificationSettings}>
                       <Save className="w-4 h-4 mr-2" />
                       Benachrichtigungen speichern
                     </Button>
                   </div>
                </CardContent>
              </Card>

              {/* Sicherheit */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    Sicherheit
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
                      <Input id="currentPassword" type="password" />
                    </div>
                    <div>
                      <Label htmlFor="newPassword">Neues Passwort</Label>
                      <Input id="newPassword" type="password" />
                    </div>
                    <div>
                      <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                      <Input id="confirmPassword" type="password" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Zwei-Faktor-Authentifizierung</Label>
                        <p className="text-sm text-muted-foreground">
                          Zusätzliche Sicherheit für Ihr Konto
                        </p>
                      </div>
                      <Badge variant="outline">Deaktiviert</Badge>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full">
                    <Shield className="w-4 h-4 mr-2" />
                    Passwort ändern
                  </Button>
                </CardContent>
              </Card>

              {/* Erscheinungsbild */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="w-5 h-5 text-primary" />
                    Erscheinungsbild
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <Label>Design-Modus</Label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Button variant="outline" size="sm">Hell</Button>
                        <Button variant="outline" size="sm">Dunkel</Button>
                      </div>
                    </div>

                    <div>
                      <Label>Sprache</Label>
                      <Select defaultValue="de">
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Sprache auswählen" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="de">🇩🇪 Deutsch</SelectItem>
                          <SelectItem value="en">🇬🇧 English</SelectItem>
                          <SelectItem value="fr">🇫🇷 Français</SelectItem>
                          <SelectItem value="it">🇮🇹 Italiano</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Kompakte Ansicht</Label>
                        <p className="text-sm text-muted-foreground">
                          Mehr Inhalte auf weniger Platz
                        </p>
                      </div>
                      <Switch />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* System */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-primary" />
                    System
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm">Version</span>
                      <Badge variant="secondary">v2.1.0</Badge>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm">Datenbank</span>
                      <Badge variant="outline" className="text-green-600">Verbunden</Badge>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm">Letzte Synchronisation</span>
                      <span className="text-sm text-muted-foreground">Vor 2 Min.</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full">
                      Cache leeren
                    </Button>
                    <Button variant="outline" size="sm" className="w-full">
                      Daten exportieren
                    </Button>
                    <Button variant="outline" size="sm" className="w-full text-red-600 hover:text-red-700">
                      Daten zurücksetzen
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Aktionen */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" />
                    Aktionen
                  </CardTitle>
                </CardHeader>
                 <CardContent className="space-y-4">
                   <Button className="w-full" size="lg" onClick={saveAllSettings}>
                     <Save className="w-4 h-4 mr-2" />
                     Alle Einstellungen speichern
                   </Button>
                   
                   <div className="text-center pt-4">
                     <p className="text-sm text-muted-foreground">
                       Letzte Änderung: {new Date().toLocaleString('de-DE', {
                         day: '2-digit',
                         month: '2-digit',
                         year: 'numeric',
                         hour: '2-digit',
                         minute: '2-digit'
                       })}
                     </p>
                   </div>

                  <Button variant="outline" className="w-full">
                    <Database className="w-4 h-4 mr-2" />
                    Konfiguration speichern
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        );
      default:
        return renderOverviewContent();
    }
  };

  const renderOverviewContent = () => {
    // Get unique houses from fetched data for filter
    const availableHouses = [
      { id: 'all', name: 'Alle Häuser' },
      ...(housesData?.map(house => ({ id: house.id, name: house.name })) || [])
    ];

    // Get unique status values for filter
    const availableStatuses = [
      { value: 'all', label: 'Alle Status' },
      { value: 'confirmed', label: 'Bestätigt' },
      { value: 'pending', label: 'Ausstehend' },
      { value: 'cancelled', label: 'Storniert' },
      { value: 'completed', label: 'Abgeschlossen' }
    ];

    // Get available time periods
    const timePeriods = [
      { value: 'next3months', label: 'Nächste 3 Monate' },
      { value: 'next6months', label: 'Nächste 6 Monate' },
      { value: 'thisyear', label: 'Dieses Jahr' },
      { value: 'all', label: 'Alle Zeiträume' }
    ];

    return (
      <div>
        {/* Search and Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          {/* Filter Toggle Button - All devices */}
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

          {/* Filter Content - Collapsible on all devices */}
          <div className={`${isFiltersExpanded ? 'block' : 'hidden'}`}>
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Nach Gast oder Haus suchen..."
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Service Type Filter */}
                <select 
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  value={serviceTypeFilter}
                  onChange={(e) => setServiceTypeFilter(e.target.value)}
                >
                  <option value="all">Alle Services</option>
                  <option value="cleaning">Reinigung</option>
                  <option value="laundry">Wäsche</option>
                  <option value="maintenance">Wartung</option>
                </select>
                
                {/* Status Filter */}
                <select 
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {availableStatuses.map(status => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
                
                {/* Houses Filter */}
                <select 
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  value={houseFilter}
                  onChange={(e) => setHouseFilter(e.target.value)}
                >
                  {availableHouses.map(house => (
                    <option key={house.id} value={house.id}>
                      {house.name}
                    </option>
                  ))}
                </select>
                
                {/* Time Period Filter */}
                <select 
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  value={timePeriodFilter}
                  onChange={(e) => setTimePeriodFilter(e.target.value)}
                >
                  {timePeriods.map(period => (
                    <option key={period.value} value={period.value}>
                      {period.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Bookings Section - Real Data from Database */}
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Buchungen mit verknüpften Aufträgen
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Übersicht über Buchungen und ihre zugehörigen Service-Aufträge und Wäschebestellungen (inkl. abgeschlossene)
            </p>
            
            <div className="space-y-6">
              {filteredBookings?.map((booking, index) => {
                const { tasks, laundry } = getBookingRelatedData(booking.id);
                const filteredTasks = getFilteredTasksByService(tasks);
                const colorVariant = index === 0 ? 'green' : index === 1 ? 'blue' : 'purple';
                
                return (
                  <div key={booking.id} className="relative bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="p-6">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Booking Card */}
                        <BookingCard 
                          booking={booking} 
                          colorVariant={colorVariant} 
                          onBookingUpdated={() => window.location.reload()}
                        />
                        
                        {/* Service Tasks */}
                        <div className="space-y-3">
                          {filteredTasks.length > 0 ? (
                            filteredTasks.map((task) => (
                              <ServiceTaskCard key={task.id} task={task} colorVariant={colorVariant} onTaskUpdated={() => window.location.reload()} />
                            ))
                          ) : (
                            <div className="text-center text-muted-foreground py-8 border-2 border-dashed border-muted rounded-lg bg-blue-50">
                              <div className="flex flex-col items-center space-y-2">
                                <span className="text-lg">🧹</span>
                                <p className="font-medium">Keine Service-Aufträge</p>
                                <p className="text-xs">Noch keine Reinigung geplant</p>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Laundry Orders */}
                        <div className="space-y-3">
                          {laundry.length > 0 ? (
                            laundry.map((order) => (
                              <LaundryOrderCard key={order.id} order={order} colorVariant={colorVariant} />
                            ))
                          ) : (
                            <div className="text-center text-muted-foreground py-8 border-2 border-dashed border-muted rounded-lg bg-gray-50">
                              <div className="flex flex-col items-center space-y-2">
                                <span className="text-lg">👕</span>
                                <p className="font-medium">Keine Wäschebestellungen</p>
                                <p className="text-xs">Wäscheservice aktuell nicht verfügbar</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }) ?? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Keine bestätigten Buchungen gefunden</p>
                </div>
              )}
            </div>
          </div>

          {/* Empty States */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Service-Aufträge ohne Buchung</CardTitle>
                <p className="text-sm text-gray-600">
                  Aufträge die keiner Buchung zugeordnet sind (inkl. abgeschlossene)
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-center text-gray-500 py-8">Keine unverbundenen Aufträge</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Wäschebestellungen ohne Buchung</CardTitle>
                <p className="text-sm text-gray-600">
                  Bestellungen die keiner Buchung zugeordnet sind (inkl. abgeschlossene)
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-center text-gray-500 py-8">Keine unverbundenen Bestellungen</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Mobile-First Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <img src={steinbockLogo} alt="Steinbock Logo" className="w-6 h-6 sm:w-8 sm:h-8" />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                Ferienhaus Management
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                Übersicht über Buchungen, Services und Wäschelogistik
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => setIsProviderDialogOpen(true)}
              className="gap-2"
              variant="default"
            >
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Provider Verwalten</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Dashboard Cards - Mobile Responsive */}
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {/* Ferienhäuser */}
          <Card className="dashboard-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <span className="text-lg flex-shrink-0 mr-2">🏠</span>
                <span className="truncate">Ferienhäuser (2)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {houses.map((house, index) => (
                <div key={index} className="flex items-center justify-between min-w-0">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <span className="text-sm flex-shrink-0">{house.icon}</span>
                    <span className="text-sm font-medium truncate">{house.name}</span>
                  </div>
                  <span className="status-free text-xs whitespace-nowrap">🟢{house.status}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Aktive Buchungen */}
          <Card className="dashboard-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <span className="text-lg flex-shrink-0 mr-2">📅</span>
                <span className="truncate">Aktive Buchungen</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeBookings.map((booking, index) => (
                <div key={index} className="flex items-center justify-between min-w-0">
                  <span className="text-sm truncate flex-1">
                    {booking.icon}{booking.house} • {booking.guest} • {booking.date}
                  </span>
                  <span className="status-pending text-xs whitespace-nowrap ml-2">📅Anstehend</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Reinigungsaufträge */}
          <Card className="dashboard-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <span className="flex-shrink-0">📋</span>
                <span className="truncate ml-2">Reinigungsaufträge</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cleaningTasks.map((task, index) => (
                <div key={index} className="flex items-center justify-between min-w-0">
                  <span className="text-sm truncate flex-1">
                    {task.icon}{task.house} • {task.guest} • {task.date} • {task.count}🧹
                  </span>
                  <span className="text-lg flex-shrink-0">⏰</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Wäschebedarf */}
          <Card className="dashboard-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <span className="flex-shrink-0">🧺</span>
                <span className="truncate ml-2">Wäschebedarf</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {laundryNeeds.map((item, index) => (
                <div key={index} className="flex items-center justify-between min-w-0">
                  <span className="text-sm truncate flex-1">{item.name}</span>
                  <div className="flex items-center text-red-600 flex-shrink-0">
                    <span className="text-base mr-1">❌</span>
                    <span className="text-sm font-medium">{item.status}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Navigation Tabs - Mobile Wrapping */}
        <div className="border-b border-gray-200 mb-4 sm:mb-6">
          <nav className="flex flex-wrap gap-2 sm:gap-4 pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.name}
                onClick={() => setActiveTab(tab.name)}
                className={`${tab.name === activeTab ? 'nav-tab-active' : 'nav-tab'} flex items-center gap-2`}
              >
                <span className="text-lg">{tab.emoji}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content - Optimized Rendering */}
        <div className="animate-fade-in">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-4">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            renderTabContent()
          )}
        </div>
      </div>

      <ProviderManagementDialog 
        open={isProviderDialogOpen}
        onOpenChange={setIsProviderDialogOpen}
      />
    </div>
  );
};

export default OriginalDashboard;