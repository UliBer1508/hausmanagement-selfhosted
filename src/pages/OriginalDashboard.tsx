import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Home, 
  Calendar as CalendarIcon, 
  Users, 
  Building, 
  Sparkles, 
  Shirt, 
  RefreshCw,
  Clock,
  Edit,
  Plus,
  Settings,
  Trash2,
  Database,
  Save,
  Building2,
  FileSpreadsheet
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import steinbockLogo from '@/assets/steinbock-logo.png';
import CreateBookingDialog from '@/components/Bookings/CreateBookingDialog';
// Lazy-loaded tab content & heavy dialogs (drastically reduces initial bundle)
const BookingOverviewFixed = lazy(() => import('@/components/Bookings/BookingOverviewFixed'));
const HouseManagement = lazy(() => import('@/components/Houses/HouseManagement'));
const CleaningManagement = lazy(() => import('@/components/Cleaning/CleaningManagement'));
const GuestManagement = lazy(() => import('@/components/Guests/GuestManagement'));
const TenantManagement = lazy(() => import('@/components/Tenants/TenantManagement'));
const LinenDashboard = lazy(() => import('@/components/Houses/LinenDashboard'));
const ProviderManagementDialog = lazy(() =>
  import('@/components/ServicePortal/ProviderManagementDialog').then(m => ({ default: m.ProviderManagementDialog }))
);
const ProviderBillingDialog = lazy(() =>
  import('@/components/ServicePortal/ProviderBillingDialog').then(m => ({ default: m.ProviderBillingDialog }))
);
const LinenOrderDialog = lazy(() => import('@/components/Houses/LinenOrderDialog'));
const CreateCleaningTaskDialog = lazy(() => import('@/components/Cleaning/CreateCleaningTaskDialog'));
const UsageReportDialog = lazy(() =>
  import('@/components/Dashboard/UsageReportDialog').then(m => ({ default: m.UsageReportDialog }))
);
import { supabase } from '@/integrations/supabase/client';
import { useOptimizedLinenManagement } from '@/hooks/useOptimizedLinenManagement';
import { getLinenStatusEmoji, getHouseIcon } from '@/lib/utils';
import { useExternalSync } from '@/hooks/useExternalSync';
import { useEmailSettings, useProfileSettings, useAppearanceSettings, useRatingReminderSettings } from '@/hooks/useSystemSettings';

// Teuni ist der einzige Wäsche-Dienstleister. Gleiches Muster wie in
// ServicePortal/TeuniOrdersOverview.tsx und AssignOrdersToInvoiceDialog.tsx.
const TEUNI_PROVIDER_ID = 'd8110105-8ac9-45e3-ad32-aaf42393744c';
const PricingTab = lazy(() => import('@/components/Dashboard/PricingTab'));
const ProviderTab = lazy(() => import('@/components/Dashboard/ProviderTab'));
const SettingsTab = lazy(() => import('@/components/Dashboard/SettingsTab'));
const CalendarTab = lazy(() => import('@/components/Dashboard/CalendarTab'));
const OverviewTab = lazy(() => import('@/components/Dashboard/OverviewTab'));

const TabFallback = () => (
  <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
    Lädt…
  </div>
);

const OriginalDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('Übersicht');
  const [editBookingIdFromState, setEditBookingIdFromState] = useState<string | null>(null);
  
  // Tab-Aktivierung und Buchungs-Edit über Navigation State
  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }
    if (location.state?.editBookingId) {
      setEditBookingIdFromState(location.state.editBookingId);
    }
    // State zurücksetzen nach Navigation
    if (location.state?.activeTab || location.state?.editBookingId) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
  const [selectedProviderForBilling, setSelectedProviderForBilling] = useState<any>(null);
  
  // Filter states for overview
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [includeCheckedIn, setIncludeCheckedIn] = useState(true);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
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
  const [selectedBookingForCleaning, setSelectedBookingForCleaning] = useState<any>(null);
  const handleCreateCleaningTask = useCallback((booking: any) => {
    setSelectedBookingForCleaning(booking);
  }, []);
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
      status: fullOrder.status || 'offen'
    });
    setShowLinenOrderDialog(true);
    
    console.log('🎬 Dialog öffnen für Order:', order.id);
  };

  // Handler für Erstellen einer neuen Wäschebestellung aus dem Dashboard
  const handleCreateLinenOrder = async (booking: any) => {
    if (showLinenOrderDialog) return;
    console.log('➕ Neue Wäschebestellung für Buchung:', booking?.id);
    setSelectedBookingForOrder(booking);
    setEditingOrderId(null);

    // Standard-Lieferdatum: Vortag des Check-in
    let defaultDeliveryDate: string | undefined;
    if (booking?.check_in) {
      const d = new Date(booking.check_in);
      d.setDate(d.getDate() - 1);
      defaultDeliveryDate = d.toISOString().slice(0, 10);
    }

    try {
      const { data, error } = await supabase.functions.invoke(
        'generate-booking-linen-order',
        { body: { booking_id: booking.id } }
      );
      if (error) throw error;

      const items = data?.order_items || {};
      setEditingOrderData({
        items,
        item_variants: data?.item_variants || null,
        linen_color: data?.linen_color || null,
        delivery_date: defaultDeliveryDate,
        delivery_type: 'delivery',
        notes: '',
        status: 'offen',
      });

      toast({
        title: 'Wäschebestellung berechnet',
        description: `${data?.total_items ?? 0} Teile vorbefüllt${data?.estimated_cost ? ` – ca. ${data.estimated_cost} EUR` : ''}.`,
      });
    } catch (err: any) {
      console.error('❌ Fehler beim Berechnen der Wäschebestellung:', err);
      setEditingOrderData({
        items: {},
        delivery_date: defaultDeliveryDate,
        delivery_type: 'delivery',
        notes: '',
        status: 'offen',
      });
      toast({
        title: 'Berechnung fehlgeschlagen',
        description: err?.message || 'Bitte Positionen manuell eintragen.',
        variant: 'destructive',
      });
    } finally {
      setShowLinenOrderDialog(true);
    }
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
          status: orderData.status || 'offen',
          updated_at: new Date().toISOString(),
          status_changed_by: 'Admin',
          status_changed_at: new Date().toISOString(),
          linen_color: orderData.linenColor || null,      // NEU: Hauptfarbe
          item_variants: orderData.itemColors || null,    // NEU: Artikelfarben
          // 0 ist KEIN gültiger Betrag (Artikel wurden ja bestellt). Der reine
          // `?? null` griff bei 0 nicht — Ergebnis waren Bestellungen mit
          // total_cost = 0.00, die in allen Karten ohne Betrag erschienen
          // (2d7247bf Adnan 17.05.2026, e4f8fffb Niels 11.05.2026).
          total_cost: orderData.estimatedCost ? orderData.estimatedCost : null,
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
          // PFLICHTFELD: Ohne provider_id zeigt die Wäschekarte keinen Dienstleister
          // an und rückt stattdessen das Lieferdatum nach vorn (Fall Eng Saad
          // Alhajeri, 28.06.2026). Die drei übrigen Anlegewege
          // (create-linen-order-for-booking, useBookingLinenOrders,
          // useOptimizedLinenManagement) setzen sie ebenfalls fest.
          provider_id: TEUNI_PROVIDER_ID,
          order_source: 'manual',
          items: orderData.orderItems,
          total_items: totalItems as number,
          delivery_date: orderData.deliveryDate,
          delivery_time: '09:00:00' as const,
          delivery_type: orderData.deliveryType || 'delivery',
          notes: orderData.notes,
          status: 'offen' as const,
          linen_color: orderData.linenColor || null,      // NEU: Hauptfarbe
          item_variants: orderData.itemColors || null,    // NEU: Artikelfarben
          // 0 ist KEIN gültiger Betrag — siehe Kommentar im Update-Zweig.
          total_cost: orderData.estimatedCost ? orderData.estimatedCost : null,
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

  const queryClient = useQueryClient();

  // Realtime: invalidate dashboard queries when underlying tables change,
  // so newly created linen orders / service tasks / bookings appear without reload.
  useEffect(() => {
    const linenChannel = supabase
      .channel('dashboard-linen-orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'linen_orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-linen-orders', 'tourist'] });
      })
      .subscribe();

    const tasksChannel = supabase
      .channel('dashboard-service-tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_tasks' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-service-tasks'] });
      })
      .subscribe();

    const bookingsChannel = supabase
      .channel('dashboard-bookings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-bookings-v2'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(linenChannel);
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(bookingsChannel);
    };
  }, [queryClient]);

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
          number_of_adults,
          number_of_children,
          house_id,
          booking_amount,
          currency,
          platform,
          external_booking_id,
          external_rating,
          payment_status,
          notes,
          status,
          updated_at,
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
          notes,
          booking_id,
          house_id,
          provider_id,
          status_changed_by,
          status_changed_at,
          updated_at,
          service_providers!service_tasks_provider_id_fkey (
            id,
            name,
            service_type,
            contact_email,
            contact_phone
          ),
          bookings:booking_id (
            id,
            guest_name,
            check_in,
            check_out,
            number_of_guests,
            guests (*)
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
      
      // Status filter - erweitert um Checkbox-Logik für eingecheckte Buchungen
      if (statusFilter !== 'all') {
        if (statusFilter === 'confirmed' && includeCheckedIn) {
          // Zeige confirmed UND checked_in
          if (booking.status !== 'confirmed' && booking.status !== 'checked_in') {
            return false;
          }
        } else if (booking.status !== statusFilter) {
          return false;
        }
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
    }).sort((a, b) => {
      const dateA = new Date(a.check_in).getTime();
      const dateB = new Date(b.check_in).getTime();
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [bookingsData, searchTerm, statusFilter, houseFilter, timePeriodFilter, includeCheckedIn, sortDirection]);

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
            guest_name,
            number_of_guests
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

  // Unverbundene Service-Aufträge (ohne Buchung), nur touristische Häuser
  const unlinkedServiceTasks = useMemo(() => {
    if (!serviceTasks) return [];
    const touristHouseIds = new Set((housesData || []).map((h: any) => h.id));
    return serviceTasks
      .filter((task: any) => !task.booking_id && touristHouseIds.has(task.house_id))
      .map((task: any) => {
        const assignments = cleaningAssignments?.filter((a: any) => a.service_task_id === task.id) || [];
        return { ...task, cleaning_assignments: assignments, direct_assigned_staff: null };
      })
      .sort((a: any, b: any) => {
        const da = a.scheduled_date ? new Date(a.scheduled_date).getTime() : 0;
        const db = b.scheduled_date ? new Date(b.scheduled_date).getTime() : 0;
        return db - da;
      });
  }, [serviceTasks, housesData, cleaningAssignments]);

  // Unverbundene Wäschebestellungen (ohne Buchung), Tourist-Filter erfolgt bereits in der Query
  const unlinkedLinenOrders = useMemo(() => {
    if (!linenOrders) return [];
    return [...linenOrders]
      .filter((order: any) => !order.booking_id)
      .sort((a: any, b: any) => {
        const da = a.delivery_date ? new Date(a.delivery_date).getTime() : 0;
        const db = b.delivery_date ? new Date(b.delivery_date).getTime() : 0;
        return db - da;
      });
  }, [linenOrders]);

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
    { name: 'Preise', emoji: '💶' },
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
        (booking.status === 'confirmed' || booking.status === 'checked_in') &&
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


  const renderTabContent = () => {
    const overviewElement = (
      <OverviewTab
        housesData={housesData}
        filteredBookings={filteredBookings}
        isFiltersExpanded={isFiltersExpanded}
        setIsFiltersExpanded={setIsFiltersExpanded}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        serviceTypeFilter={serviceTypeFilter}
        setServiceTypeFilter={setServiceTypeFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        houseFilter={houseFilter}
        setHouseFilter={setHouseFilter}
        timePeriodFilter={timePeriodFilter}
        setTimePeriodFilter={setTimePeriodFilter}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
        includeCheckedIn={includeCheckedIn}
        setIncludeCheckedIn={setIncludeCheckedIn}
        getBookingRelatedData={getBookingRelatedData}
        getFilteredTasksByService={getFilteredTasksByService}
        handleEditLinenOrder={handleEditLinenOrder}
        handleCreateLinenOrder={handleCreateLinenOrder}
        handleCreateCleaningTask={handleCreateCleaningTask}
        syncingOrderId={syncingOrderId}
        setSyncingOrderId={setSyncingOrderId}
        syncOrder={syncOrder}
        resetSync={resetSync}
        externalSyncEnabled={externalSyncEnabled}
        unlinkedServiceTasks={unlinkedServiceTasks}
        unlinkedLinenOrders={unlinkedLinenOrders}
      />
    );
    switch (activeTab) {
      case 'Übersicht':
        return overviewElement;
      case 'Kalender':
        return (<CalendarTab bookingsData={bookingsData} housesData={housesData} serviceTasks={serviceTasks} linenOrders={linenOrders} />);
      case 'Buchungen':
        return (
          <BookingOverviewFixed 
            autoOpenBookingId={editBookingIdFromState}
            onBookingOpened={() => setEditBookingIdFromState(null)}
          />
        );
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
          <ProviderTab
            portalProviders={portalProviders}
            onOpenProviderManagement={() => setIsProviderDialogOpen(true)}
            onOpenBilling={(provider) => setSelectedProviderForBilling(provider)}
          />
        );
      case 'Wäsche':
        return <LinenDashboard />;
      case 'Preise':
        return <PricingTab />;
      case 'Einstellungen':
        return (
          <SettingsTab
            localProfileSettings={localProfileSettings}
            setLocalProfileSettings={setLocalProfileSettings}
            saveProfileSettings={saveProfileSettings}
            isSavingProfile={isSavingProfile}
            notificationSettings={notificationSettings}
            setNotificationSettings={setNotificationSettings}
            saveNotificationSettings={saveNotificationSettings}
            sendTestNotification={sendTestNotification}
            localEmailSettings={localEmailSettings}
            setLocalEmailSettings={setLocalEmailSettings}
            handleSaveEmailSettings={handleSaveEmailSettings}
            isSavingEmail={isSavingEmail}
            localAppearanceSettings={localAppearanceSettings}
            handleSaveAppearanceSettings={handleSaveAppearanceSettings}
            handleShowUsageReport={handleShowUsageReport}
            saveAllSettings={saveAllSettings}
          />
        );
      default:
        return overviewElement;
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 relative -mt-3 sm:-mt-4 lg:-mt-6">
      {/* Mobile-First Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <img src={steinbockLogo} alt="Steinbock Logo" className="w-12 h-12 sm:w-16 sm:h-16" />
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
                <span className="truncate">Ferienhäuser & Mietobjekte ({housesWithStatus.length})</span>
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

        {/* Navigation als Karten-Buttons */}
        <div className="mb-4 sm:mb-6">
          <nav
            role="tablist"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
          >
            {tabs.map((tab) => {
              const isActive = tab.name === activeTab;
              return (
                <button
                  key={tab.name}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.name)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
                    isActive
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-2 ring-emerald-200'
                      : 'bg-white border-gray-200 text-gray-800 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg leading-none shrink-0">{tab.emoji}</span>
                  <span className="truncate">{tab.name}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                toast({ title: 'Abgemeldet', description: 'Du wurdest erfolgreich abgemeldet.' });
                navigate('/login', { replace: true });
              }}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium text-left transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 bg-white border-gray-200 text-gray-800 hover:border-gray-300"
            >
              <span className="text-lg leading-none shrink-0">🚪</span>
              <span className="truncate">Abmelden</span>
            </button>
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
            <Suspense fallback={<TabFallback />}>{renderTabContent()}</Suspense>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        {isProviderDialogOpen && (
          <ProviderManagementDialog
            open={isProviderDialogOpen}
            onOpenChange={setIsProviderDialogOpen}
          />
        )}

        {showUsageDialog && (
          <UsageReportDialog
            open={showUsageDialog}
            onOpenChange={setShowUsageDialog}
            data={usageData}
          />
        )}

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

        {selectedProviderForBilling && (
          <ProviderBillingDialog
            provider={selectedProviderForBilling}
            open={!!selectedProviderForBilling}
            onOpenChange={(open) => !open && setSelectedProviderForBilling(null)}
          />
        )}

        {selectedBookingForCleaning && (
          <CreateCleaningTaskDialog
            open={!!selectedBookingForCleaning}
            onOpenChange={(open) => !open && setSelectedBookingForCleaning(null)}
            preselectedBooking={selectedBookingForCleaning}
            onTaskCreated={() => setSelectedBookingForCleaning(null)}
          />
        )}
      </Suspense>
    </div>
  );
};

export default OriginalDashboard;
