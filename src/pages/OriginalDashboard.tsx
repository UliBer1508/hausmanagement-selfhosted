import { useState, useMemo, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  Building2,
  FileBarChart,
  Mail,
  Send,
  CheckCircle
} from 'lucide-react';
import { format, isSameDay, parseISO, addDays, addMonths, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import steinbockLogo from '@/assets/steinbock-logo.png';
import CreateBookingDialog from '@/components/Bookings/CreateBookingDialog';
import BookingOverviewFixed from '@/components/Bookings/BookingOverviewFixed';
import BookingCard from '@/components/Bookings/BookingCard';
import ServiceTaskCard from '@/components/Bookings/ServiceTaskCard';
import LaundryOrderCard from '@/components/Bookings/LaundryOrderCard';
import HouseManagement from '@/components/Houses/HouseManagement';
import CleaningManagement from '@/components/Cleaning/CleaningManagement';
import GuestManagement from '@/components/Guests/GuestManagement';
import TenantManagement from '@/components/Tenants/TenantManagement';
import LinenDashboard from '@/components/Houses/LinenDashboard';
import { ProviderManagementDialog } from '@/components/ServicePortal/ProviderManagementDialog';
import LinenOrderDialog from '@/components/Houses/LinenOrderDialog';
import { UsageReportDialog } from '@/components/Dashboard/UsageReportDialog';
import GuestContactAlertBanner from '@/components/Dashboard/GuestContactAlertBanner';
import RatingReminderBanner from '@/components/Dashboard/RatingReminderBanner';
import GuestImportCard from '@/components/Settings/GuestImportCard';
import { supabase } from '@/integrations/supabase/client';
import { useOptimizedLinenManagement } from '@/hooks/useOptimizedLinenManagement';
import { getLinenStatusEmoji, getHouseIcon } from '@/lib/utils';
import BookingTimeline from '@/components/Calendar/BookingTimeline';
import { useExternalSync } from '@/hooks/useExternalSync';
import { useEmailSettings, useProfileSettings, useAppearanceSettings } from '@/hooks/useSystemSettings';

const OriginalDashboard = () => {
  const location = useLocation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('Übersicht');
  
  // Tab-Aktivierung über Navigation State
  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
      // State zurücksetzen nach Navigation
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'timeline'>('month');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [openPopoverDate, setOpenPopoverDate] = useState<string | null>(null);
  
  // Filter states for overview
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  
  // Settings from database
  const { data: emailSettingsData, saveSettings: saveEmailSettings, isSaving: isSavingEmail } = useEmailSettings();
  const { data: profileSettingsData, saveSettings: saveProfileSettingsDb, isSaving: isSavingProfile } = useProfileSettings();
  const { data: appearanceSettingsData, saveSettings: saveAppearanceSettings, isSaving: isSavingAppearance } = useAppearanceSettings();

  // Local state for form editing
  const [localEmailSettings, setLocalEmailSettings] = useState({
    email: 'steinbockchalets@gmail.com',
    display_name: 'Steinbock Chalets'
  });
  const [localProfileSettings, setLocalProfileSettings] = useState({
    user_name: 'Uli Berresheim',
    company_name: 'Steinbock Chalets'
  });
  const [localAppearanceSettings, setLocalAppearanceSettings] = useState({
    theme: 'light' as 'light' | 'dark',
    language: 'de',
    compact_view: false
  });

  // Sync local state with database data
  useEffect(() => {
    if (emailSettingsData) {
      setLocalEmailSettings(emailSettingsData);
    }
  }, [emailSettingsData]);

  useEffect(() => {
    if (profileSettingsData) {
      setLocalProfileSettings(profileSettingsData);
    }
  }, [profileSettingsData]);

  useEffect(() => {
    if (appearanceSettingsData) {
      setLocalAppearanceSettings(appearanceSettingsData);
    }
  }, [appearanceSettingsData]);

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: false,
    browserNotifications: true,
    bookingNotifications: true,
    serviceUpdates: true
  });

  // systemSettings state removed - now using useAppearanceSettings hook
  const [houseFilter, setHouseFilter] = useState('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [isProviderDialogOpen, setIsProviderDialogOpen] = useState(false);

  // Wäsche-Daten mit useOptimizedLinenManagement Hook abrufen
  const { housesWithLinenData: linenData, isLoading: linenLoading } = useOptimizedLinenManagement();

  // External Sync Hook
  const { syncOrder, resetSync, isSyncing, isEnabled: externalSyncEnabled } = useExternalSync();
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);

  // Linen Order Dialog States
  const [showLinenOrderDialog, setShowLinenOrderDialog] = useState(false);
  const [selectedBookingForOrder, setSelectedBookingForOrder] = useState<any>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [showUsageDialog, setShowUsageDialog] = useState(false);
  const [usageData, setUsageData] = useState<any>(null);
  const [editingOrderData, setEditingOrderData] = useState<any>(null);

  // Settings save functions
  const saveProfileSettings = async () => {
    try {
      await saveProfileSettingsDb(localProfileSettings);
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

  const handleSaveEmailSettings = async () => {
    try {
      await saveEmailSettings(localEmailSettings);
      toast({
        title: "E-Mail-Einstellungen gespeichert",
        description: "Ihre E-Mail-Einstellungen wurden erfolgreich aktualisiert.",
      });
    } catch (error) {
      console.error('Error saving email settings:', error);
      toast({
        title: "Fehler",
        description: "E-Mail-Einstellungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  };

  const handleSaveAppearanceSettings = async (settings: typeof localAppearanceSettings) => {
    try {
      await saveAppearanceSettings(settings);
      setLocalAppearanceSettings(settings);
      toast({
        title: "Erscheinungsbild gespeichert",
        description: "Ihre Anzeigeeinstellungen wurden aktualisiert.",
      });
    } catch (error) {
      console.error('Error saving appearance settings:', error);
      toast({
        title: "Fehler",
        description: "Erscheinungsbild konnte nicht gespeichert werden.",
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

  const handleShowUsageReport = async () => {
    toast({
      title: "Nutzungsbericht wird generiert...",
      description: "Der Bericht wird analysiert...",
    });
    
    try {
      const { data, error } = await supabase.functions.invoke('check-supabase-usage');
      
      if (error) {
        console.error('Error generating usage report:', error);
        toast({
          title: "Fehler beim Generieren",
          description: error.message || "Der Nutzungsbericht konnte nicht generiert werden.",
          variant: "destructive",
        });
      } else {
        setUsageData(data);
        setShowUsageDialog(true);
        toast({
          title: "Bericht erstellt",
          description: "Der Nutzungsbericht wurde erfolgreich generiert!",
        });
      }
    } catch (error: any) {
      console.error('Error invoking usage report function:', error);
      toast({
        title: "Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    }
  };

  // Handler für Wäschebestellungs-Bearbeitung
  const handleEditLinenOrder = async (order: any) => {
    if (showLinenOrderDialog) {
      console.log('⏭️ Dialog bereits offen, ignoriere Klick');
      return;
    }

    console.log('✏️ Bearbeite Wäschebestellung:', order.id);
    
    // Lade die Buchung mit Haus-Details
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*, houses!bookings_house_id_fkey(*)')
      .eq('id', order.booking_id)
      .single();
    
    if (error || !booking) {
      console.error('❌ Buchung konnte nicht geladen werden:', error);
      toast({
        title: "Fehler",
        description: "Zugehörige Buchung nicht gefunden.",
        variant: "destructive",
      });
      return;
    }
    
    // Lade die vollständige Order mit allen Details
    const { data: fullOrder, error: orderError } = await supabase
      .from('linen_orders')
      .select('*')
      .eq('id', order.id)
      .single();
    
    if (orderError || !fullOrder) {
      console.error('❌ Bestellung konnte nicht geladen werden:', orderError);
      toast({
        title: "Fehler",
        description: "Bestellung konnte nicht geladen werden.",
        variant: "destructive",
      });
      return;
    }
    
    setSelectedBookingForOrder(booking);
    setEditingOrderId(order.id);
    setEditingOrderData({
      ...fullOrder,
      status: fullOrder.status || 'pending'
    });
    setShowLinenOrderDialog(true);
    
    console.log('🎬 Dialog öffnen für Order:', order.id);
  };

  // Handler für Erstellen/Aktualisieren von Wäschebestellungen
  const handleCreateOrUpdateOrder = async (orderData: any) => {
    try {
      console.log('💾 Speichere Bestellung:', { editingOrderId, orderData });

      const totalItems: number = Object.values(orderData.orderItems || {}).reduce((sum: number, val: any) => sum + Number(val || 0), 0) as number;

      if (editingOrderId) {
        // Update existierende Bestellung
        const updatePayload = {
          items: orderData.orderItems,
          total_items: totalItems as number,
          delivery_date: orderData.deliveryDate,
          delivery_time: '09:00:00' as const,
          delivery_type: orderData.deliveryType || 'delivery',
          notes: orderData.notes,
          status: orderData.status || 'pending',
          updated_at: new Date().toISOString()
        };

        console.log('📝 Update Payload:', updatePayload);

        const { error } = await supabase
          .from('linen_orders')
          .update(updatePayload as any)
          .eq('id', editingOrderId);

        if (error) throw error;

        toast({
          title: "Bestellung aktualisiert",
          description: "Die Wäschebestellung wurde erfolgreich aktualisiert.",
        });
      } else {
        // Neue Bestellung erstellen
        const insertPayload = {
          house_id: selectedBookingForOrder?.houses?.id || selectedBookingForOrder?.house_id,
          booking_id: selectedBookingForOrder?.id,
          items: orderData.orderItems,
          total_items: totalItems as number,
          delivery_date: orderData.deliveryDate,
          delivery_time: '09:00:00' as const,
          delivery_type: orderData.deliveryType || 'delivery',
          notes: orderData.notes,
          status: 'pending' as const
        };

        console.log('➕ Insert Payload:', insertPayload);

        const { error } = await supabase
          .from('linen_orders')
          .insert([insertPayload as any]);

        if (error) throw error;

        toast({
          title: "Bestellung erstellt",
          description: "Die Wäschebestellung wurde erfolgreich erstellt.",
        });
      }

      // Dialog schließen und States zurücksetzen
      setShowLinenOrderDialog(false);
      setSelectedBookingForOrder(null);
      setEditingOrderId(null);
      setEditingOrderData(null);
      
      // Daten neu laden
      window.location.reload();
    } catch (error: any) {
      console.error('❌ Fehler beim Speichern der Bestellung:', error);
      toast({
        title: "Fehler",
        description: error.message || "Bestellung konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    }
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
          houses!bookings_house_id_fkey (
            id,
            name,
            address
          )
        `)
        .neq('status', 'cancelled')
        .order('check_in', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch service tasks with provider information - optimized
  const { data: serviceTasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['dashboard-service-tasks'],
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
          service_providers!service_tasks_provider_id_fkey (
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
    enabled: true, // Immer aktiv, damit Daten im Hintergrund aktualisiert werden
  });

  // Fetch houses data for filters
  const { data: allHousesData } = useQuery({
    queryKey: ['dashboard-houses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name, rental_type')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as any;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch providers with portal access
  const { data: portalProviders } = useQuery({
    queryKey: ['portal-providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_providers')
        .select('*')
        .eq('has_portal', true)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Helper function for service type icons
  const getServiceIcon = (serviceType: string) => {
    switch(serviceType) {
      case 'cleaning':
        return { icon: Sparkles, color: 'text-blue-500' };
      case 'laundry':
        return { icon: Shirt, color: 'text-purple-500' };
      default:
        return { icon: Building2, color: 'text-gray-500' };
    }
  };

  // Nur touristische Häuser anzeigen
  const housesData = useMemo(() => {
    return allHousesData?.filter((h: any) => h.rental_type === 'tourist') || [];
  }, [allHousesData]);

  // Filter bookings based on current filters
  const filteredBookings = useMemo(() => {
    if (!bookingsData) return [];
    
    return bookingsData.filter(booking => {
      // Skip cancelled unless explicitly filtered
      if (booking.status === 'cancelled' && statusFilter !== 'cancelled') {
        return false;
      }
      
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
          cleaning_staff!cleaning_assignments_cleaning_staff_id_fkey (
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
    queryKey: ['dashboard-linen-orders', 'tourist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          *,
          houses!linen_orders_house_id_fkey!inner(id, name, rental_type),
          service_providers!linen_orders_provider_id_fkey (
            id,
            name,
            service_type
          ),
          bookings!linen_orders_booking_id_fkey (
            id,
            guest_name
          )
        `)
        .eq('houses.rental_type', 'tourist');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === 'Übersicht' || activeTab === 'Wäsche' || activeTab === 'Kalender',
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
    { name: 'Mieter', emoji: '🏘️' },
    { name: 'Häuser', emoji: '🏠' },
    { name: 'Reinigung', emoji: '✨' },
    { name: 'Provider', emoji: '🏢' },
    { name: 'Wäsche', emoji: '💧' },
    { name: 'Einstellungen', emoji: '⚙️' }
  ];

  // Dynamisch berechneter Haus-Status basierend auf echten Buchungsdaten
  const housesWithStatus = useMemo(() => {
    if (!housesData || !bookingsData) return [];
    
    // Bereits gefiltert durch Query - nur touristische Häuser
    return housesData.map(house => {
      // Prüfe ob Haus aktuell belegt ist
      const now = new Date();
      const activeBooking = bookingsData.find(booking => 
        booking.houses?.id === house.id &&
        booking.status !== 'cancelled' &&
        new Date(booking.check_in) <= now &&
        new Date(booking.check_out) >= now
      );
      
      return {
        id: house.id,
        name: house.name,
        status: activeBooking ? 'Belegt' : 'Frei',
        icon: getHouseIcon(house.name),
        currentGuest: activeBooking?.guest_name || null
      };
    });
  }, [housesData, bookingsData]);

  // Aktive + Nächste Buchung pro Haus
  const upcomingBookings = useMemo(() => {
    if (!bookingsData || !housesData) return [];
    
    const now = new Date();
    const nowTime = now.getTime();
    const result: any[] = [];
    
    // Für jedes Haus: Aktive + Nächste Buchung finden
    housesData.forEach(house => {
      const houseName = house.name;
      const houseIcon = getHouseIcon(houseName);
      
      // 1. Aktive Buchung (Check-in <= now && Check-out >= now)
      const activeBooking = bookingsData.find(booking => 
        booking.houses?.id === house.id &&
        booking.status === 'confirmed' &&
        new Date(booking.check_in).getTime() <= nowTime &&
        new Date(booking.check_out).getTime() >= nowTime
      );
      
      if (activeBooking) {
        result.push({
          house: houseName,
          guest: activeBooking.guest_name.split(' ')[0],
          date: `bis ${format(new Date(activeBooking.check_out), 'dd.MM.', { locale: de })}`,
          icon: houseIcon,
          checkIn: activeBooking.check_in,
          isActive: true
        });
      }
      
      // 2. Nächste kommende Buchung (Check-in > now)
      const nextBooking = bookingsData
        .filter(booking => 
          booking.houses?.id === house.id &&
          booking.status === 'confirmed' &&
          new Date(booking.check_in).getTime() > nowTime
        )
        .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime())[0];
      
      if (nextBooking) {
        result.push({
          house: houseName,
          guest: nextBooking.guest_name.split(' ')[0],
          date: format(new Date(nextBooking.check_in), 'dd.MM.', { locale: de }),
          icon: houseIcon,
          checkIn: nextBooking.check_in,
          isActive: false
        });
      }
    });
    
    // Sortierung: Aktive zuerst, dann nach Check-in Datum
    return result.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime();
    });
  }, [bookingsData, housesData]);

  // Nächste 2 Reinigungsaufträge
  const cleaningTasks = useMemo(() => {
    if (!serviceTasks || !housesData || !bookingsData) return [];
    
    const now = new Date();
    const nowTime = now.getTime();
    
    return serviceTasks
      .filter(task => 
        task.service_type === 'cleaning' &&
        task.status !== 'completed' &&
        task.status !== 'cancelled' &&
        new Date(task.scheduled_date).getTime() >= nowTime - (24 * 60 * 60 * 1000)
      )
      .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())
      .slice(0, 2) // Nur die nächsten 2 Reinigungen
      .map(task => {
        const house = housesData.find(h => h.id === task.house_id);
        const houseName = house?.name || 'Unbekannt';
        
        // Finde zugehörige Buchung für Gast-Namen
        const booking = bookingsData.find(b => b.id === task.booking_id);
        const guestName = booking?.guest_name || 'Gast';
        const firstName = guestName.split(' ')[0];
        
        return {
          id: task.id,
          house: houseName.replace(' Chalet', ''),
          guest: firstName,
          date: format(new Date(task.scheduled_date), 'dd.MM.', { locale: de }),
          count: 1,
          icon: getHouseIcon(houseName)
        };
      });
  }, [serviceTasks, housesData, bookingsData]);

  // Wäschebestellstatus für nächste 2 Buchungen
  const laundryOrderStatus = useMemo(() => {
    if (!bookingsData || !housesData) return [];
    
    const now = new Date();
    const nowTime = now.getTime();
    
    // Nächste 2 bestätigte Buchungen finden
    const upcomingBookings = bookingsData
      .filter(booking => 
        booking.status === 'confirmed' &&
        new Date(booking.check_in).getTime() > nowTime
      )
      .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime())
      .slice(0, 2);
    
    return upcomingBookings.map(booking => {
      const houseName = booking.houses?.name || 'Unbekannt';
      
      // Suche zugehörige Wäschebestellung
      const linenOrder = linenOrders?.find(order => order.booking_id === booking.id);
      
      let orderStatus = 'keine';
      let statusText = 'Nicht bestellt';
      let statusIcon = '⚠️';
      let statusColor = 'text-red-600';
      
      if (linenOrder) {
        switch (linenOrder.status) {
          case 'delivered':
            orderStatus = 'delivered';
            statusText = 'Geliefert';
            statusIcon = '✅';
            statusColor = 'text-green-600';
            break;
          case 'pending':
          case 'confirmed':
            orderStatus = 'ordered';
            statusText = 'Bestellt';
            statusIcon = '📦';
            statusColor = 'text-blue-600';
            break;
          case 'in_transit':
            orderStatus = 'transit';
            statusText = 'Unterwegs';
            statusIcon = '🚚';
            statusColor = 'text-orange-600';
            break;
          case 'offen':
            orderStatus = 'open';
            statusText = 'Zu bestätigen';
            statusIcon = '📝';
            statusColor = 'text-amber-600';
            break;
          default:
            orderStatus = 'unknown';
            statusText = linenOrder.status;
            statusIcon = '❓';
            statusColor = 'text-gray-600';
        }
      }
      
      return {
        id: booking.id,
        house: houseName.replace(' Chalet', ''),
        guest: booking.guest_name.split(' ')[0],
        checkIn: booking.check_in,
        orderStatus,
        statusText,
        statusIcon,
        statusColor,
        icon: getHouseIcon(houseName)
      };
    });
  }, [bookingsData, housesData, linenOrders]);

  // Prüfe ob es offene Bestellungen gibt (global)
  const hasOpenOrders = useMemo(() => {
    return linenOrders?.some(order => order.status === 'offen') || false;
  }, [linenOrders]);

  // Echte Daten aus useOptimizedLinenManagement verwenden
  const laundryNeeds = useMemo(() => {
    if (!linenData || linenData.length === 0) return [];
    
    return linenData
      .filter(house => house.status === 'critical' || house.status === 'warning')
      .map(house => ({
        name: house.house?.name || 'Unbekannt',
        status: house.status === 'critical' ? 'Kritisch' : 
                house.status === 'warning' ? 'Niedrig' : 'Gut',
        icon: getHouseIcon(house.house?.name || 'Unbekannt'),
        criticalCount: house.criticalCount,
        lowCount: house.lowCount,
        nextBooking: house.nextBookingDate,
        daysAway: house.nextBookingDaysAway
      }))
      .sort((a, b) => {
        // Kritische Häuser zuerst
        if (a.status === 'Kritisch' && b.status !== 'Kritisch') return -1;
        if (a.status !== 'Kritisch' && b.status === 'Kritisch') return 1;
        // Dann nach nächstem Check-in sortieren
        return (a.daysAway || 999) - (b.daysAway || 999);
      });
  }, [linenData]);

  // Helper-Funktion: Haus-spezifische Farbe für "Belegt"-Status
  const getHouseOccupiedColor = (houseName: string): string => {
    const houseColors: Record<string, string> = {
      'Venedigersiedlung Chalet': 'bg-orange-500 text-white',
      'Wald Chalet': 'bg-cyan-200 text-cyan-800',
    };
    
    // Fallback auf orange wenn Haus nicht in der Liste
    return houseColors[houseName] || 'bg-orange-200 text-orange-900';
  };


  const getEventsForDate = (date: Date) => {
    const events = [];
    
    // Use real bookings data instead of mock data
    const realBookings = bookingsData || [];
    
    realBookings.forEach(booking => {
      // Skip cancelled bookings
      if (booking.status === 'cancelled') return;
      
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
          color: 'bg-green-500 text-white'
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
          color: 'bg-red-500 text-white'
        });
      }
    });

    // Reinigungsaufträge anzeigen (HOHE PRIORITÄT)
    const allServiceTasks = serviceTasks || [];
    allServiceTasks.forEach(task => {
      // Nur Cleaning-Tasks anzeigen (keine stornierten)
      if (task.service_type !== 'cleaning' || task.status === 'cancelled') return;
      
      if (task.scheduled_date) {
        const taskDate = parseISO(task.scheduled_date);
        if (isSameDay(date, taskDate)) {
          // Finde das zugehörige Haus
          const house = housesData?.find(h => h.id === task.house_id);
          const houseName = house?.name?.replace(' Chalet', '') || 'Unbekannt';
          
          events.push({
            type: 'cleaning',
            title: `🧹 Reinigung: ${houseName}`,
            task: task,
            color: 'bg-blue-500 text-white'
          });
        }
      }
    });

    // Wäschelieferungen anzeigen (HOHE PRIORITÄT)
    const allLinenOrders = linenOrders || [];
    allLinenOrders.forEach(order => {
      // Keine stornierten Bestellungen
      if (order.status === 'cancelled' || order.status === 'delivered') return;
      
      if (order.delivery_date) {
        const deliveryDate = parseISO(order.delivery_date);
        if (isSameDay(date, deliveryDate)) {
          // Finde das zugehörige Haus
          const house = housesData?.find(h => h.id === order.house_id);
          const houseName = house?.name?.replace(' Chalet', '') || 'Unbekannt';
          
          events.push({
            type: 'laundry',
            title: `🧺 Wäsche: ${houseName}`,
            order: order,
            color: 'bg-purple-500 text-white'
          });
        }
      }
    });
    
    // Belegt-Zeitraum (zwischen Check-in und Check-out)
    realBookings.forEach(booking => {
      if (booking.status === 'cancelled') return;
      
      const checkIn = parseISO(booking.check_in);
      const checkOut = parseISO(booking.check_out);
      const guestDisplayName = booking.guest_name.split(' ')[0];
      const houseDisplayName = booking.houses?.name || 'Unbekanntes Haus';
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
          color: getHouseOccupiedColor(houseDisplayName)
        });
      }
    });
    
    // NEU: Freie Tage für jedes Haus erkennen (NIEDRIGE PRIORITÄT)
    const allHouses = housesData || [];
    
    allHouses.forEach(house => {
      // Prüfe ob Haus an diesem Tag eine Buchung hat
      const hasBookingOnThisDay = realBookings.some(booking => {
        if (booking.status === 'cancelled') return false;
        if (booking.houses?.id !== house.id) return false;
        
        const checkIn = parseISO(booking.check_in);
        const checkOut = parseISO(booking.check_out);
        const currentDate = new Date(date);
        
        // Haus ist gebucht wenn Tag zwischen Check-in und Check-out liegt (inklusiv)
        return currentDate >= checkIn && currentDate <= checkOut;
      });
      
      // Wenn KEINE Buchung → Haus ist frei
      if (!hasBookingOnThisDay) {
        const shortHouseName = house.name.replace(' Chalet', ''); // "Venedigersiedlung" oder "Wald"
        
        events.push({
          type: 'free',
          title: `Frei: ${shortHouseName}`,
          houseName: house.name,
          booking: {
            house: house.name,
            guest: '',
            checkIn: '',
            checkOut: ''
          },
          color: 'bg-white',
          borderColor: 'border-green-500',
          isFreeDayEvent: true
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
                          className={`text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded-md ${event.color} ${event.isFreeDayEvent ? `border-2 ${event.borderColor}` : ''} truncate font-medium cursor-pointer hover:opacity-80`}
                          title={`${event.title}${event.booking?.house ? ` - ${event.booking.house}` : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                          }}
                        >
                          {event.isFreeDayEvent ? (
                            <span className="text-green-600 font-semibold">{event.title}</span>
                          ) : (
                            event.title
                          )}
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
                            className={`text-[7px] sm:text-xs px-0.5 sm:px-2 py-0.5 rounded-sm sm:rounded-md ${event.color} ${event.isFreeDayEvent ? `border-2 ${event.borderColor}` : ''} w-full font-medium cursor-pointer hover:opacity-80 leading-tight overflow-hidden`}
                            style={{ wordBreak: 'break-word' }}
                            title={`${event.title}${event.booking?.house ? ` - ${event.booking.house}` : ''}`}
                            onClick={() => setSelectedEvent(event)}
                          >
                            {event.isFreeDayEvent ? (
                              <span className="text-green-600 font-semibold">{event.title}</span>
                            ) : (
                              event.title
                            )}
                          </div>
                        ))}
                        {events.length > 2 && (
                          <Popover 
                            open={openPopoverDate === format(date, 'yyyy-MM-dd')} 
                            onOpenChange={(isOpen) => {
                              setOpenPopoverDate(isOpen ? format(date, 'yyyy-MM-dd') : null);
                            }}
                          >
                            <PopoverTrigger asChild>
                              <div 
                                className="text-[7px] sm:text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setOpenPopoverDate(format(date, 'yyyy-MM-dd'));
                                }}
                              >
                                +{events.length - 2} mehr
                              </div>
                            </PopoverTrigger>
                            <PopoverContent 
                              className="w-64 p-2" 
                              align="start"
                              onOpenAutoFocus={(e) => e.preventDefault()}
                            >
                              <div className="text-xs font-semibold mb-2 text-muted-foreground">
                                Alle Events am {format(date, 'd. MMMM', { locale: de })}
                              </div>
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {events.map((event, index) => (
                                  <div
                                    key={index}
                                    className={`text-xs px-2 py-1.5 rounded ${event.color} cursor-pointer hover:opacity-80 font-medium`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      setSelectedEvent(event);
                                      setOpenPopoverDate(null);
                                    }}
                                  >
                                    {event.title}
                                  </div>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
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

    const renderTimelineView = () => {
      return (
        <BookingTimeline
          bookings={bookingsData || []}
          houses={housesData || []}
          selectedDate={selectedDate}
          onBookingClick={(booking) => setSelectedEvent({
            type: 'occupied',
            title: `Buchung: ${booking.guest_name}`,
            booking: {
              ...booking,
              guest: booking.guest_name,
              house: booking.houses?.name || 'Unbekannt',
              checkIn: booking.check_in,
              checkOut: booking.check_out
            },
            color: 'bg-cyan-400 text-white'
          })}
        />
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
                onClick={() => setSelectedDate(calendarView === 'week' ? addDays(selectedDate, -7) : subMonths(selectedDate, 1))}
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
                onClick={() => setSelectedDate(calendarView === 'week' ? addDays(selectedDate, 7) : addMonths(selectedDate, 1))}
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
            <Button
              variant={calendarView === 'timeline' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCalendarView('timeline')}
            >
              📊 Timeline
            </Button>
          </div>
        </div>

        {calendarView === 'timeline' ? (
          <div className="overflow-x-auto">
            {renderTimelineView()}
          </div>
        ) : (
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
                      
                      {selectedEvent.type === 'free' ? (
                        <div className="space-y-3">
                          <h4 className="font-semibold text-foreground">Verfügbarkeit</h4>
                          <div className="space-y-2 text-sm">
                            <div><span className="font-medium">Haus:</span> {selectedEvent.houseName}</div>
                            <div><span className="font-medium">Status:</span> <span className="text-green-600 font-semibold">Verfügbar</span></div>
                          </div>
                        </div>
                      ) : selectedEvent.type === 'checkin' || selectedEvent.type === 'checkout' || selectedEvent.type === 'occupied' ? (
                        <div className="space-y-3">
                          <h4 className="font-semibold text-foreground">Buchungsdetails</h4>
                          <div className="space-y-2 text-sm">
                            {selectedEvent.booking?.guest && (
                              <div><span className="font-medium">Gast:</span> {selectedEvent.booking.guest}</div>
                            )}
                            {selectedEvent.booking?.house && (
                              <div><span className="font-medium">Haus:</span> {selectedEvent.booking.house}</div>
                            )}
                            {selectedEvent.booking?.dates && (
                              <div><span className="font-medium">Zeitraum:</span> {selectedEvent.booking.dates}</div>
                            )}
                            {selectedEvent.booking?.guests && (
                              <div><span className="font-medium">Gäste:</span> {selectedEvent.booking.guests}</div>
                            )}
                            {selectedEvent.booking?.status && (
                              <div><span className="font-medium">Status:</span> {selectedEvent.booking.status}</div>
                            )}
                            {selectedEvent.booking?.checkIn && (
                              <div><span className="font-medium">Check-in:</span> {format(parseISO(selectedEvent.booking.checkIn), 'dd.MM.yyyy HH:mm', { locale: de })}</div>
                            )}
                            {selectedEvent.booking?.checkOut && (
                              <div><span className="font-medium">Check-out:</span> {format(parseISO(selectedEvent.booking.checkOut), 'dd.MM.yyyy HH:mm', { locale: de })}</div>
                            )}
                          </div>
                        </div>
                      ) : selectedEvent.type === 'cleaning' ? (
                        <div className="space-y-3">
                          <h4 className="font-semibold text-foreground">Reinigungsdetails</h4>
                          <div className="space-y-2 text-sm">
                            {selectedEvent.booking?.house && (
                              <div><span className="font-medium">Haus:</span> {selectedEvent.booking.house}</div>
                            )}
                            {selectedEvent.cleaning?.date && (
                              <div><span className="font-medium">Datum:</span> {format(parseISO(selectedEvent.cleaning.date), 'dd.MM.yyyy', { locale: de })}</div>
                            )}
                            {selectedEvent.cleaning?.provider && (
                              <div><span className="font-medium">Anbieter:</span> {selectedEvent.cleaning.provider}</div>
                            )}
                            {selectedEvent.cleaning?.status && (
                              <div><span className="font-medium">Status:</span> {selectedEvent.cleaning.status}</div>
                            )}
                            {selectedEvent.booking?.guest && (
                              <div><span className="font-medium">Buchung:</span> {selectedEvent.booking.guest}</div>
                            )}
                          </div>
                        </div>
                      ) : selectedEvent.type === 'laundry' ? (
                        <div className="space-y-3">
                          <h4 className="font-semibold text-foreground">Wäschedetails</h4>
                          <div className="space-y-2 text-sm">
                            {selectedEvent.booking?.house && (
                              <div><span className="font-medium">Haus:</span> {selectedEvent.booking.house}</div>
                            )}
                            {selectedEvent.laundry?.status && (
                              <div><span className="font-medium">Status:</span> {selectedEvent.laundry.status}</div>
                            )}
                            {selectedEvent.laundry?.provider && (
                              <div><span className="font-medium">Anbieter:</span> {selectedEvent.laundry.provider}</div>
                            )}
                            {selectedEvent.laundry?.items && (
                              <div><span className="font-medium">Artikel:</span> {selectedEvent.laundry.items.join(', ')}</div>
                            )}
                            {selectedEvent.booking?.guest && (
                              <div><span className="font-medium">Buchung:</span> {selectedEvent.booking.guest}</div>
                            )}
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
                          {event.booking?.house && (
                            <p className="text-sm text-muted-foreground">
                              {event.booking.house}
                            </p>
                          )}
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
                    <div className="w-4 h-4 bg-orange-500 rounded-md border border-orange-600"></div>
                    <span className="text-sm text-foreground">Venedigersiedlung Belegt</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 bg-cyan-200 rounded-md border border-cyan-300"></div>
                    <span className="text-sm text-foreground">Wald Chalet Belegt</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 bg-blue-500 rounded-md"></div>
                    <span className="text-sm text-foreground">Reinigung</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 bg-purple-500 rounded-md"></div>
                    <span className="text-sm text-foreground">Wäsche</span>
                  </div>
                  <div className="flex items-center space-x-3 pt-2 border-t">
                    <div className="w-4 h-4 bg-white rounded-md border-2 border-green-500"></div>
                    <span className="text-sm text-green-600 font-semibold">Frei (beide Häuser)</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
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
      case 'Mieter':
        return <TenantManagement />;
      case 'Häuser':
        return <HouseManagement />;
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
              {portalProviders?.length === 0 && (
                <p className="text-center text-muted-foreground col-span-full">
                  Keine Provider mit Portal-Zugang konfiguriert.
                </p>
              )}
              
              {portalProviders?.map((provider) => {
                const { icon: Icon, color } = getServiceIcon(provider.service_type);
                const displayName = provider.service_type === 'cleaning' 
                  ? `${provider.name} Cleaning Portal` 
                  : `${provider.name} Laundry Portal`;
                const description = provider.service_type === 'cleaning'
                  ? 'Reinigungsaufträge verwalten und bearbeiten'
                  : 'Wäscheaufträge verwalten und bearbeiten';

                return (
                  <Card key={provider.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="text-center">
                      <CardTitle className="flex items-center justify-center gap-2">
                        <Icon className={`w-5 h-5 ${color}`} />
                        {displayName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-center space-y-4">
                      <p className="text-sm text-gray-600">
                        {description}
                      </p>
                      <Button 
                        className="w-full" 
                        onClick={() => window.open(provider.portal_token, '_blank')}
                      >
                        Portal öffnen
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
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
                        {localProfileSettings.user_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-medium">{localProfileSettings.user_name}</h3>
                      <p className="text-sm text-muted-foreground">{localProfileSettings.company_name}</p>
                    </div>
                  </div>
                  
                   <div className="space-y-3">
                     <div>
                       <Label htmlFor="userName">Benutzername</Label>
                       <Input 
                         id="userName" 
                         value={localProfileSettings.user_name}
                         onChange={(e) => setLocalProfileSettings(prev => ({
                           ...prev,
                           user_name: e.target.value
                         }))}
                       />
                     </div>
                     <div>
                       <Label htmlFor="companyName">Firmenname</Label>
                       <Input 
                         id="companyName" 
                         value={localProfileSettings.company_name}
                         onChange={(e) => setLocalProfileSettings(prev => ({
                           ...prev,
                           company_name: e.target.value
                         }))}
                       />
                     </div>
                   </div>

                   <Button className="w-full" onClick={saveProfileSettings} disabled={isSavingProfile}>
                     <Save className="w-4 h-4 mr-2" />
                     {isSavingProfile ? 'Speichern...' : 'Profil speichern'}
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

              {/* Nutzungsberichte */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileBarChart className="w-5 h-5 text-primary" />
                    Nutzungsberichte
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Detaillierte Analyse der Supabase-Nutzung mit Empfehlungen
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Automatisch jeden Montag um 9:00 Uhr</span>
                    </div>
                  </div>

                  <Button 
                    className="w-full" 
                    onClick={handleShowUsageReport}
                  >
                    <FileBarChart className="w-4 h-4 mr-2" />
                    Bericht anzeigen
                  </Button>
                </CardContent>
              </Card>

              {/* E-Mail-Versand */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" />
                    E-Mail-Versand
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="emailAddress">Absender-Adresse</Label>
                      <Input 
                        id="emailAddress"
                        type="email"
                        value={localEmailSettings.email}
                        onChange={(e) => setLocalEmailSettings(prev => ({
                          ...prev,
                          email: e.target.value
                        }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="emailDisplayName">Anzeigename</Label>
                      <Input 
                        id="emailDisplayName"
                        value={localEmailSettings.display_name}
                        onChange={(e) => setLocalEmailSettings(prev => ({
                          ...prev,
                          display_name: e.target.value
                        }))}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium">Status</span>
                      <Badge variant="outline" className="text-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Verbunden (Gmail SMTP)
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Alle E-Mails werden über Ihren Gmail-Account versendet. 
                    Das App-Passwort ist sicher in den Secrets gespeichert.
                  </p>

                  <div className="space-y-2">
                    <Button 
                      className="w-full" 
                      onClick={handleSaveEmailSettings}
                      disabled={isSavingEmail}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isSavingEmail ? 'Speichern...' : 'E-Mail-Einstellungen speichern'}
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={async () => {
                        try {
                          const { error } = await supabase.functions.invoke('send-gmail', {
                            body: {
                              to: [localEmailSettings.email],
                              subject: 'Test-E-Mail vom Ferienhaus Management',
                              text: `Dies ist eine Test-E-Mail.\n\nGesendet am: ${new Date().toLocaleString('de-DE')}\n\nWenn Sie diese E-Mail erhalten, funktioniert der E-Mail-Versand korrekt.\n\nMit freundlichen Grüßen\n${localEmailSettings.display_name} System`
                            }
                          });
                          if (error) throw error;
                          toast({
                            title: "Test-E-Mail versendet",
                            description: `Eine Test-E-Mail wurde an ${localEmailSettings.email} gesendet.`,
                          });
                        } catch (error: any) {
                          toast({
                            variant: "destructive",
                            title: "Fehler beim Versenden",
                            description: error.message || "Die Test-E-Mail konnte nicht versendet werden.",
                          });
                        }
                      }}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Test-E-Mail senden
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
                        <Button 
                          variant={localAppearanceSettings.theme === 'light' ? 'default' : 'outline'} 
                          size="sm"
                          onClick={() => handleSaveAppearanceSettings({ ...localAppearanceSettings, theme: 'light' })}
                        >
                          Hell
                        </Button>
                        <Button 
                          variant={localAppearanceSettings.theme === 'dark' ? 'default' : 'outline'} 
                          size="sm"
                          onClick={() => handleSaveAppearanceSettings({ ...localAppearanceSettings, theme: 'dark' })}
                        >
                          Dunkel
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label>Sprache</Label>
                      <Select 
                        value={localAppearanceSettings.language}
                        onValueChange={(value) => handleSaveAppearanceSettings({ ...localAppearanceSettings, language: value })}
                      >
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
                      <Switch 
                        checked={localAppearanceSettings.compact_view}
                        onCheckedChange={(checked) => handleSaveAppearanceSettings({ ...localAppearanceSettings, compact_view: checked })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Gästeliste Import */}
              <GuestImportCard />

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

    // Get unique status values for filter (booking_status enum: confirmed, checked_in, completed, cancelled)
    const availableStatuses = [
      { value: 'all', label: 'Alle Status' },
      { value: 'confirmed', label: 'Bestätigt' },
      { value: 'checked_in', label: 'Eingecheckt' },
      { value: 'completed', label: 'Abgeschlossen' },
      { value: 'cancelled', label: 'Storniert' }
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
        {/* Guest Contact Alert Banner */}
        <GuestContactAlertBanner />
        
        {/* Rating Reminder Banner */}
        <div className="mt-4">
          <RatingReminderBanner />
        </div>
        
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
                              <LaundryOrderCard 
                                key={order.id} 
                                order={order} 
                                colorVariant={colorVariant}
                                onEdit={handleEditLinenOrder}
                                onSync={async (order) => {
                                  setSyncingOrderId(order.id);
                                  try {
                                    await syncOrder(order.id);
                                  } finally {
                                    setSyncingOrderId(null);
                                  }
                                }}
                                onResetSync={async (order) => { await resetSync(order.id); }}
                                isSyncing={syncingOrderId === order.id}
                                externalSyncEnabled={externalSyncEnabled}
                              />
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
                <span className="truncate">Ferienhäuser ({housesWithStatus.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {housesWithStatus.map((house) => (
                <div key={house.id} className="flex items-center justify-between min-w-0">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <span className="text-sm flex-shrink-0">{house.icon}</span>
                    <span className="text-sm font-medium truncate">{house.name}</span>
                  </div>
                  <span className={`text-sm font-bold whitespace-nowrap ${
                    house.status === 'Belegt' ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {house.status === 'Belegt' ? '🔴' : '🟢'}{house.status}
                  </span>
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
              {upcomingBookings.length > 0 ? (
                upcomingBookings.map((booking, index) => (
                  <div key={index} className="flex items-center justify-between min-w-0">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <span className="text-sm flex-shrink-0">{booking.icon}</span>
                      <span className="text-sm truncate">
                        <span className="font-medium">{booking.house}</span>
                        <span className="text-muted-foreground"> · {booking.guest}</span>
                      </span>
                    </div>
                    <span className="text-sm whitespace-nowrap text-green-600 font-bold">
                      {booking.date}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">Keine kommenden Buchungen</p>
              )}
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
                  <span className="text-sm font-medium truncate flex-1">
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
                {hasOpenOrders && (
                  <span className="animate-pulse text-amber-600 text-lg ml-auto flex-shrink-0">
                    🔔
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {laundryOrderStatus.length === 0 ? (
                <div className="text-sm text-muted-foreground flex items-center">
                  <span className="mr-2">ℹ️</span>
                  Keine kommenden Buchungen
                </div>
              ) : (
                laundryOrderStatus.map((item) => (
                <div key={item.id} className="flex items-center justify-between min-w-0 gap-2">
                    <span className="text-sm truncate flex-1">
                      <span className="mr-1.5">{item.icon}</span>
                      <span className="font-medium">{item.house}</span>
                      <span className="text-muted-foreground"> · {item.guest}</span>
                    </span>
                    <div className={`flex items-center gap-1.5 flex-shrink-0 ${item.statusColor}`}>
                      <span className="text-base">{item.statusIcon}</span>
                      <span className="text-sm font-bold">{item.statusText}</span>
                    </div>
                  </div>
                ))
              )}
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

      <UsageReportDialog
        open={showUsageDialog}
        onOpenChange={setShowUsageDialog}
        data={usageData}
      />

      {/* Wäschebestellungs-Dialog */}
      {selectedBookingForOrder && (
        <LinenOrderDialog 
          open={showLinenOrderDialog}
          onOpenChange={(open) => {
            setShowLinenOrderDialog(open);
            if (!open) {
              setSelectedBookingForOrder(null);
              setEditingOrderId(null);
              setEditingOrderData(null);
            }
          }}
          orderItems={editingOrderData?.items || {}}
          houseName={selectedBookingForOrder?.houses?.name || ''}
          houseId={selectedBookingForOrder?.houses?.id || selectedBookingForOrder?.house_id || ''}
          selectedBooking={selectedBookingForOrder}
          onCreateOrder={handleCreateOrUpdateOrder}
          mode={editingOrderId ? 'edit' : 'create'}
          initialData={editingOrderData ? {
            deliveryDate: editingOrderData.delivery_date,
            deliveryType: editingOrderData.delivery_type,
            notes: editingOrderData.notes,
            status: editingOrderData.status
          } : undefined}
        />
      )}

      {/* Copyright Footer */}
      <footer className="mt-8 py-4 border-t border-border/50 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Steinbock Ferienhaus Manager
        </p>
      </footer>
    </div>
  );
};

export default OriginalDashboard;