import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ShoppingCart } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import BookingCard from './BookingCard';
import ServiceTaskCard from './ServiceTaskCard';
import LaundryOrderCard from './LaundryOrderCard';
import ConnectionLine from './ConnectionLine';
import LinenOrderDialog from '../Houses/LinenOrderDialog';
import { useOptimizedLinenManagement } from '@/hooks/useOptimizedLinenManagement';
import { useExternalSync } from '@/hooks/useExternalSync';
import { getGuestName } from '@/lib/guestHelpers';

const ConnectedBookingView = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [houseFilter, setHouseFilter] = useState('all');
  const [showLinenOrderDialog, setShowLinenOrderDialog] = useState(false);
  const [selectedBookingForOrder, setSelectedBookingForOrder] = useState<any>(null);
  const [calculatedOrderItems, setCalculatedOrderItems] = useState<Record<string, number>>({});
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { createOptimizedOrderMutation } = useOptimizedLinenManagement();
  const { syncOrder, resetSync, isSyncing, isEnabled: externalSyncEnabled } = useExternalSync();
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);

  console.log('ConnectedBookingView rendering with filters:', { statusFilter, houseFilter, searchTerm });

  // Real-time updates for ALL tables
  useEffect(() => {
    console.log('🔌 Setting up realtime channels...');
    
    // Channel 1: Linen Orders
    const linenChannel = supabase
      .channel('linen-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'linen_orders' },
        (payload) => {
          console.log('🔔 Linen order changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['linen-orders-connected'] });
          queryClient.refetchQueries({ queryKey: ['linen-orders-connected'] });
          queryClient.refetchQueries({ queryKey: ['connected-bookings'] });
        }
      )
      .subscribe();

    // Channel 2: Bookings
    const bookingsChannel = supabase
      .channel('bookings-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        (payload) => {
          console.log('🔔 Booking changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['bookings'] });
          queryClient.invalidateQueries({ queryKey: ['connected-bookings'] });
          queryClient.refetchQueries({ queryKey: ['connected-bookings'] });
        }
      )
      .subscribe();

    // Channel 3: Service Tasks (Reinigungen)
    const tasksChannel = supabase
      .channel('service-tasks-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_tasks' },
        (payload) => {
          console.log('🔔 Service task changed:', payload);
          queryClient.invalidateQueries({ queryKey: ['service_tasks'] });
          queryClient.invalidateQueries({ queryKey: ['service-tasks-connected'] });
          queryClient.refetchQueries({ queryKey: ['service-tasks-connected'] });
          queryClient.refetchQueries({ queryKey: ['connected-bookings'] });
        }
      )
      .subscribe();

    return () => {
      console.log('🔌 Cleaning up realtime channels...');
      supabase.removeChannel(linenChannel);
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(tasksChannel);
    };
  }, [queryClient]);

  // Fetch bookings with related data
  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ['connected-bookings'],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select(`
          *,
          guests (*),
          houses!bookings_house_id_fkey (
            id,
            name,
            address
          )
        `)
        .order('check_in', { ascending: true });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as 'confirmed' | 'checked_in' | 'completed' | 'cancelled');
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch service tasks - DEBUG: staleTime:0 um Cache zu umgehen
  const { data: serviceTasks } = useQuery({
    queryKey: ['service-tasks-connected'],
    queryFn: async () => {
      console.log('🔍 [DEBUG] Fetching service tasks from Supabase...');
      
      // Vereinfachte Query zum Debuggen - nur Haupttabelle
      const { data, error } = await supabase
        .from('service_tasks')
        .select('*');
      
      if (error) {
        console.error('❌ Error fetching service tasks:', error);
        throw error;
      }
      
      // DEBUG: Zeige status_changed_by für alle Tasks
      console.log('✅ [DEBUG] service_tasks RAW from Supabase:', data?.map(t => ({
        id: t.id.substring(0, 8),
        status: t.status,
        status_changed_by: t.status_changed_by,
        status_changed_at: t.status_changed_at
      })));
      
      return data;
    },
    staleTime: 0,  // DEBUG: Kein Cache
    gcTime: 0,     // DEBUG: Sofort garbage collect
  });

  // Fetch linen orders
  const { data: linenOrders } = useQuery({
    queryKey: ['linen-orders-connected'],
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
            guest_name,
            guests (*)
          )
        `);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch houses for filter (only tourist rentals)
  const { data: houses } = useQuery({
    queryKey: ['houses-filter', 'tourist'],
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

  // Filter bookings
  const filteredBookings = bookingsData?.filter(booking => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const guestMatch = getGuestName(booking).toLowerCase().includes(searchLower);
      const houseMatch = booking.houses?.name?.toLowerCase().includes(searchLower);
      if (!guestMatch && !houseMatch) return false;
    }

    if (houseFilter !== 'all' && booking.house_id !== houseFilter) {
      return false;
    }

    return true;
  }) || [];

  // Get related data for each booking
  const getBookingRelatedData = (bookingId: string) => {
    const bookingTasks = serviceTasks?.filter(task => task.booking_id === bookingId) || [];
    // Get linen orders directly by booking_id
    const bookingLaundry = linenOrders?.filter(order => 
      order.booking_id === bookingId && 
      order.status !== 'cancelled' // Stornierte ausblenden
    ) || [];
    
    return { tasks: bookingTasks, laundry: bookingLaundry };
  };

  // Simple handler to open linen order dialog
  const handleCreateLinenOrder = (booking: any) => {
    console.log('✅ Button geklickt für Buchung:', booking);
    setSelectedBookingForOrder(booking);
    setCalculatedOrderItems({}); // Empty - user fills manually
    setEditingOrderId(null);
    setIsEditMode(false);
    setShowLinenOrderDialog(true);
  };

  // Handler for editing existing linen orders
  const handleEditLinenOrder = async (order: any) => {
    // Prevent multiple clicks
    if (showLinenOrderDialog) {
      console.log('⏭️ Dialog bereits offen, ignoriere Klick');
      return;
    }

    console.log('✏️ Bearbeite Wäschebestellung:', order.id);
    console.log('📋 Order Details:', { booking_id: order.booking_id, items: order.items });
    
    // Erst in gefilterten Daten suchen
    let booking = bookingsData?.find(b => b.id === order.booking_id);
    console.log('🔍 Buchung gefunden in bookingsData:', booking ? 'Ja' : 'Nein');
    
    // Falls nicht gefunden: Direkt aus DB laden (Fallback für gefilterte Buchungen)
    if (!booking) {
      console.log('⚠️ Buchung nicht in gefilterten Daten. Lade aus DB...');
      
      const { data: fetchedBooking, error } = await supabase
        .from('bookings')
        .select('*, guests!bookings_guest_id_fkey(*), houses!bookings_house_id_fkey(*)')
        .eq('id', order.booking_id)
        .single();
      
      if (error || !fetchedBooking) {
        console.error('❌ Buchung konnte nicht geladen werden:', error);
        toast({
          title: "Fehler",
          description: "Zugehörige Buchung nicht gefunden.",
          variant: "destructive",
        });
        return;
      }
      
    booking = fetchedBooking;
      console.log('✅ Buchung aus DB geladen:', getGuestName(booking));
    }
    
    console.log('📦 Setze Dialog-Daten:', {
      guestName: getGuestName(booking),
      houseName: booking.houses?.name,
      itemsCount: Object.keys(order.items || {}).length
    });
    
    // Open dialog with existing data
    setSelectedBookingForOrder(booking);
    setCalculatedOrderItems(order.items || {});
    setEditingOrderId(order.id);
    setIsEditMode(true);
    setShowLinenOrderDialog(true);
    
    console.log('🎬 Dialog-States gesetzt, Dialog sollte jetzt öffnen');
  };

  // Handle order creation/update from dialog
  const handleOrderCreation = async (orderData: any) => {
    console.log('📝 Speichere Bestellung:', orderData);
    
    try {
      if (isEditMode && editingOrderId) {
        // UPDATE existing order
        console.log('🔄 Update Bestellung:', editingOrderId);
        
        const { error } = await supabase
          .from('linen_orders')
          .update({
            items: orderData.orderItems,
            notes: orderData.notes,
            delivery_date: orderData.deliveryDate,
            delivery_type: orderData.deliveryType || 'delivery',
            status: 'pending', // Set to pending when editing
            updated_at: new Date().toISOString()
          })
          .eq('id', editingOrderId);
        
        if (error) throw error;
        
        toast({
          title: "Bestellung aktualisiert",
          description: `Wäschebestellung für ${getGuestName(selectedBookingForOrder)} wurde aktualisiert.`,
        });
      } else {
        // CREATE new order
        await createOptimizedOrderMutation.mutateAsync({
          houseId: selectedBookingForOrder.house_id,
          bookingId: selectedBookingForOrder.id,
          orderItems: orderData.orderItems,
          notes: orderData.notes,
          deliveryDate: orderData.deliveryDate,
          priority: 'normal'
        });
        
        toast({
          title: "Bestellung erstellt",
          description: `Wäschebestellung für ${getGuestName(selectedBookingForOrder)} wurde erstellt.`,
        });
      }

      // Invalidate and refetch all queries
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-connected'] });
      await queryClient.invalidateQueries({ queryKey: ['connected-bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders'] });
      await queryClient.refetchQueries({ queryKey: ['linen-orders-connected'] });
      await queryClient.refetchQueries({ queryKey: ['connected-bookings'] });
      
      // Close dialog and reset state
      setShowLinenOrderDialog(false);
      setSelectedBookingForOrder(null);
      setCalculatedOrderItems({});
      setEditingOrderId(null);
      setIsEditMode(false);
      
    } catch (error) {
      console.error('❌ Fehler:', error);
      toast({
        title: "Fehler",
        description: "Die Bestellung konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    }
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Buchungen mit verknüpften Aufträgen</h1>
        <p className="text-muted-foreground">Übersicht über Buchungen und ihre zugehörigen Service-Aufträge und Wäschebestellungen (inkl. abgeschlossene)</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
          </div>
        </CardContent>
      </Card>

      {/* Connected Bookings */}
      <div className="space-y-8">
        {filteredBookings.map((booking, index) => {
          const { tasks, laundry } = getBookingRelatedData(booking.id);
          const colorVariant = index === 0 ? 'green' : index === 1 ? 'blue' : 'purple';
          
          return (
            <div key={booking.id} className="relative">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Booking Card */}
                <BookingCard 
                  booking={booking} 
                  colorVariant={colorVariant} 
                  onBookingUpdated={() => window.location.reload()}
                />
                
                {/* Service Tasks */}
                <div className="space-y-3">
                  {tasks.length > 0 ? (
                    tasks.map((task) => (
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
                    <Card 
                      className="border-2 border-dashed border-muted hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer" 
                      onClick={() => handleCreateLinenOrder(booking)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex flex-col items-center space-y-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <ShoppingCart className="w-6 h-6 text-primary" />
                          </div>
                          <div className="text-center space-y-1">
                            <p className="font-medium text-foreground">Keine Wäschebestellungen</p>
                            <p className="text-xs text-muted-foreground">Klicken um Bestellung zu erstellen</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
              
              {/* Connection Lines */}
              {tasks.length > 0 && (
                <ConnectionLine
                  fromColumn={1}
                  toColumn={2}
                  fromIndex={0}
                  toIndex={0}
                  color={colorVariant}
                />
              )}
              {laundry.length > 0 && tasks.length > 0 && (
                <ConnectionLine
                  fromColumn={2}
                  toColumn={3}
                  fromIndex={0}
                  toIndex={0}
                  color={colorVariant}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Linen Order Dialog */}
      {selectedBookingForOrder && (
        <LinenOrderDialog
          open={showLinenOrderDialog}
          onOpenChange={(open) => {
            setShowLinenOrderDialog(open);
            if (!open) {
              setSelectedBookingForOrder(null);
              setCalculatedOrderItems({});
              setEditingOrderId(null);
              setIsEditMode(false);
            }
          }}
          orderItems={calculatedOrderItems}
          houseName={selectedBookingForOrder.houses?.name || 'Unbekannt'}
          houseId={selectedBookingForOrder.house_id}
          selectedBooking={selectedBookingForOrder}
          onCreateOrder={handleOrderCreation}
          isCreating={createOptimizedOrderMutation.isPending}
          mode={isEditMode ? 'edit' : 'create'}
        />
      )}
    </div>
  );
};

export default ConnectedBookingView;