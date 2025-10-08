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

const ConnectedBookingView = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [houseFilter, setHouseFilter] = useState('all');
  const [showLinenOrderDialog, setShowLinenOrderDialog] = useState(false);
  const [selectedBookingForOrder, setSelectedBookingForOrder] = useState<any>(null);
  const [calculatedOrderItems, setCalculatedOrderItems] = useState<Record<string, number>>({});
  const [isCalculating, setIsCalculating] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { housesWithLinenData, createOptimizedOrderMutation } = useOptimizedLinenManagement();

  console.log('ConnectedBookingView rendering with filters:', { statusFilter, houseFilter, searchTerm });

  // Real-time updates for linen orders
  useEffect(() => {
    const channel = supabase
      .channel('linen-orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'linen_orders'
        },
        () => {
          console.log('Linen order updated, invalidating queries...');
          queryClient.invalidateQueries({ queryKey: ['linen-orders-connected'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
          houses:house_id (
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

  // Fetch service tasks
  const { data: serviceTasks } = useQuery({
    queryKey: ['service-tasks-connected'],
    queryFn: async () => {
      console.log('Fetching service tasks...');
      
      const { data, error } = await supabase
        .from('service_tasks')
        .select(`
          *,
          service_providers:provider_id (
            id,
            name,
            service_type
          ),
          cleaning_staff:assigned_staff_id (
            id,
            name
          )
        `);
      
      if (error) {
        console.error('Error fetching service tasks:', error);
        throw error;
      }
      
      console.log('Fetched service tasks:', data);
      return data;
    },
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
            guest_name
          )
        `);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch houses for filter
  const { data: houses } = useQuery({
    queryKey: ['houses-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Filter bookings
  const filteredBookings = bookingsData?.filter(booking => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const guestMatch = booking.guest_name?.toLowerCase().includes(searchLower);
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
      order.booking_id === bookingId
    ) || [];
    
    return { tasks: bookingTasks, laundry: bookingLaundry };
  };

  // Calculate linen demand for a specific booking
  const handleCreateLinenOrder = async (booking: any) => {
    setIsCalculating(true);
    console.log('🧮 Berechne Wäschebedarf für Buchung:', booking);

    try {
      // Find house data with linen definitions
      const houseData = housesWithLinenData?.find((h: any) => h.house.id === booking.house_id);
      
      if (!houseData) {
        toast({
          title: "Hausdaten nicht gefunden",
          description: "Bitte aktualisieren Sie die Seite und versuchen Sie es erneut.",
          variant: "destructive",
        });
        return;
      }

      const house = houseData.house;
      const linenDef = house.linen_set_definitions?.[0];

      if (!linenDef) {
        toast({
          title: "Keine Wäscheset-Regeln definiert",
          description: `Bitte definieren Sie zuerst die Wäscheset-Regeln für ${house.name}.`,
          variant: "destructive",
        });
        return;
      }

      console.log('📊 Wäscheset Definitionen:', linenDef);
      console.log('📦 Aktueller Lagerbestand:', house.linen_stock);
      console.log('📋 Bereits bestellt:', house.ordered_linen);

      const linenStock = house.linen_stock || {};
      const orderedLinen = house.ordered_linen || {};
      const numberOfGuests = booking.number_of_guests;

      // Calculate demand for this booking
      const linenTypes = [
        { key: 'bedding', perGuestKey: 'bedding_per_guest', perBookingKey: null },
        { key: 'large_towels', perGuestKey: 'large_towels_per_guest', perBookingKey: null },
        { key: 'small_towels', perGuestKey: 'small_towels_per_guest', perBookingKey: null },
        { key: 'sauna_towels', perGuestKey: 'sauna_towels_per_guest', perBookingKey: null },
        { key: 'bath_mats', perGuestKey: null, perBookingKey: 'bath_mats_per_booking' },
        { key: 'sink_towels', perGuestKey: null, perBookingKey: 'sink_towels_per_booking' },
        { key: 'kitchen_towels', perGuestKey: null, perBookingKey: 'kitchen_towels_per_booking' },
        { key: 'blankets', perGuestKey: 'blankets_per_guest', perBookingKey: null },
        { key: 'pillow_cases', perGuestKey: 'pillow_cases_per_guest', perBookingKey: null },
      ];

      const orderItems: Record<string, number> = {};
      let hasDeficit = false;

      linenTypes.forEach(type => {
        let demand = 0;
        
        if (type.perGuestKey && linenDef[type.perGuestKey]) {
          demand = numberOfGuests * linenDef[type.perGuestKey];
        } else if (type.perBookingKey && linenDef[type.perBookingKey]) {
          demand = linenDef[type.perBookingKey];
        }

        if (demand > 0) {
          const currentStock = (linenStock[type.key] || 0) + (orderedLinen[type.key] || 0);
          const deficit = Math.max(0, demand - currentStock);
          
          console.log(`  ${type.key}: Bedarf=${demand}, Bestand=${currentStock}, Fehlmenge=${deficit}`);
          
          if (deficit > 0) {
            orderItems[type.key] = deficit;
            hasDeficit = true;
          }
        }
      });

      if (!hasDeficit) {
        toast({
          title: "Ausreichend Lagerbestand",
          description: "Für diese Buchung ist aktuell keine Bestellung erforderlich.",
        });
        setIsCalculating(false);
        return;
      }

      console.log('✅ Berechnete Bestellmenge:', orderItems);

      // Calculate suggested delivery date (2 days before check-in)
      const checkInDate = new Date(booking.check_in);
      const deliveryDate = new Date(checkInDate);
      deliveryDate.setDate(deliveryDate.getDate() - 2);

      setCalculatedOrderItems(orderItems);
      setSelectedBookingForOrder(booking);
      setShowLinenOrderDialog(true);
      
    } catch (error) {
      console.error('❌ Fehler bei Bedarfsberechnung:', error);
      toast({
        title: "Berechnungsfehler",
        description: "Die Wäschebestellung konnte nicht berechnet werden.",
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
    }
  };

  // Handle order creation from dialog
  const handleOrderCreation = async (orderData: any) => {
    console.log('📝 Erstelle Bestellung:', orderData);
    
    try {
      await createOptimizedOrderMutation.mutateAsync({
        houseId: selectedBookingForOrder.house_id,
        bookingId: selectedBookingForOrder.id,
        orderItems: orderData.orderItems,
        notes: orderData.notes,
        deliveryDate: orderData.deliveryDate,
        priority: 'normal'
      });

      // Link order to booking by updating the linen_orders table
      // The mutation already handles this, so we just need to refresh the queries
      queryClient.invalidateQueries({ queryKey: ['linen-orders-connected'] });
      queryClient.invalidateQueries({ queryKey: ['connected-bookings'] });
      
      setShowLinenOrderDialog(false);
      setSelectedBookingForOrder(null);
      setCalculatedOrderItems({});
      
      toast({
        title: "Bestellung erfolgreich erstellt",
        description: "Die Wäschebestellung wurde erfolgreich angelegt.",
      });
    } catch (error) {
      console.error('❌ Fehler beim Erstellen der Bestellung:', error);
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
                      <LaundryOrderCard key={order.id} order={order} colorVariant={colorVariant} />
                    ))
                  ) : (
                    <Card className="border-2 border-dashed border-muted hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer" onClick={() => handleCreateLinenOrder(booking)}>
                      <CardContent className="pt-6">
                        <div className="flex flex-col items-center space-y-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <ShoppingCart className="w-6 h-6 text-primary" />
                          </div>
                          <div className="text-center space-y-1">
                            <p className="font-medium text-foreground">Keine Wäschebestellungen</p>
                            <p className="text-xs text-muted-foreground">Klicken um KI-gestützte Bestellung zu erstellen</p>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            disabled={isCalculating}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateLinenOrder(booking);
                            }}
                          >
                            {isCalculating ? 'Berechne...' : 'Bestellung erstellen'}
                          </Button>
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
          onOpenChange={setShowLinenOrderDialog}
          orderItems={calculatedOrderItems}
          houseName={selectedBookingForOrder.houses?.name || 'Unbekannt'}
          houseId={selectedBookingForOrder.house_id}
          selectedBooking={selectedBookingForOrder}
          onCreateOrder={handleOrderCreation}
          isCreating={createOptimizedOrderMutation.isPending}
        />
      )}
    </div>
  );
};

export default ConnectedBookingView;