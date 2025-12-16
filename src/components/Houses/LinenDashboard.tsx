import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Clock, Package, CheckCircle, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useOptimizedLinenManagement } from '@/hooks/useOptimizedLinenManagement';
import { cn } from '@/lib/utils';
import LinenInventoryDialog from './LinenInventoryDialog';
import LinenOrderDialog from './LinenOrderDialog';
import LinenOrdersList from './LinenOrdersList';
import AutoLinenOrderSettingsCard from './AutoLinenOrderSettingsCard';

interface HouseLinenStatus {
  house: any;
  totalItems: number;
  upcomingBookings: number;
  nextBookingDate?: string;
  bookingsWithoutOrder: number;
  urgentBookingsWithoutOrder: number;
  soonBookingsWithoutOrder: number;
  openOrders: number;
  urgentOpenOrders: number;
  soonOpenOrders: number;
  openOrdersList: any[];
  status: 'good' | 'warning' | 'critical';
}

const LinenDashboard = () => {
  const location = useLocation();
  const [selectedHouse, setSelectedHouse] = useState<any>(null);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [orderHouse, setOrderHouse] = useState<any>(null);
  const [calculatedOrderItems, setCalculatedOrderItems] = useState<Record<string, number>>({});
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [showNewOrderDialog, setShowNewOrderDialog] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Automatisches Öffnen einer spezifischen Bestellung
  useEffect(() => {
    if (location.state?.openOrderId) {
      setHighlightedOrderId(location.state.openOrderId);
      // Nach 3 Sekunden Highlight entfernen
      setTimeout(() => setHighlightedOrderId(null), 3000);
      // State zurücksetzen
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);
  const { createOptimizedOrderMutation } = useOptimizedLinenManagement();

  // Fetch all tourist houses with linen data
  const { data: houses, isLoading } = useQuery({
    queryKey: ['houses-linen-overview', 'tourist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select(`
          *,
          linen_set_definitions (*)
        `)
        .eq('rental_type', 'tourist')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch upcoming bookings for all houses (only confirmed)
  const { data: upcomingBookings } = useQuery({
    queryKey: ['all-upcoming-bookings-confirmed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, linen_orders!linen_orders_booking_id_fkey(id)')
        .gte('check_in', format(new Date(), 'yyyy-MM-dd'))
        .eq('status', 'confirmed')
        .order('check_in', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all open orders (status 'offen') with urgency calculation
  const { data: openOrders } = useQuery({
    queryKey: ['linen-orders-open', 'tourist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          *,
          houses!inner(id, name, rental_type),
          bookings(guest_name, check_in)
        `)
        .eq('houses.rental_type', 'tourist')
        .eq('status', 'offen')
        .order('delivery_date', { ascending: true });
      
      if (error) throw error;
      
      // Add urgency calculation based on delivery_date
      const today = new Date();
      return data.map(order => {
        const daysUntilDelivery = Math.ceil(
          (new Date(order.delivery_date).getTime() - today.getTime()) 
          / (1000 * 60 * 60 * 24)
        );
        
        return {
          ...order,
          daysUntilDelivery,
          isUrgent: daysUntilDelivery <= 7,
          isSoon: daysUntilDelivery > 7 && daysUntilDelivery <= 14
        };
      });
    }
  });

  // Calculate linen status for each house
  const houseStatuses: HouseLinenStatus[] = houses?.map(house => {
    const linenStock = house.linen_stock || {};
    const houseBookings = upcomingBookings?.filter(b => b.house_id === house.id) || [];
    
    // Buchungen OHNE Wäschebestellung
    const bookingsWithoutOrder = houseBookings.filter(booking => {
      return !booking.linen_orders || booking.linen_orders.length === 0;
    });

    // Dringlichkeit berechnen (Tage bis Check-in)
    const today = new Date();
    const urgentBookings = bookingsWithoutOrder.filter(booking => {
      const daysUntil = Math.ceil((new Date(booking.check_in).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil <= 7;
    });

    const soonBookings = bookingsWithoutOrder.filter(booking => {
      const daysUntil = Math.ceil((new Date(booking.check_in).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil > 7 && daysUntil <= 14;
    });

    // Offene Bestellungen für dieses Haus
    const houseOpenOrders = openOrders?.filter(o => o.house_id === house.id) || [];
    const urgentOrders = houseOpenOrders.filter(o => o.isUrgent);
    const soonOrders = houseOpenOrders.filter(o => o.isSoon);

    // Status bestimmen
    let status: HouseLinenStatus['status'] = 'good';
    if (urgentBookings.length > 0 || urgentOrders.length > 0) {
      status = 'critical';
    } else if (bookingsWithoutOrder.length > 0 || houseOpenOrders.length > 0) {
      status = 'warning';
    }

    // Nächste Buchung OHNE Bestellung finden
    const nextUnorderedBooking = bookingsWithoutOrder.sort((a, b) => 
      new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
    )[0];

    const totalItems = Object.values(linenStock).reduce((sum, val) => sum + (val as number), 0);

    return {
      house,
      totalItems,
      upcomingBookings: houseBookings.length,
      nextBookingDate: nextUnorderedBooking?.check_in,
      bookingsWithoutOrder: bookingsWithoutOrder.length,
      urgentBookingsWithoutOrder: urgentBookings.length,
      soonBookingsWithoutOrder: soonBookings.length,
      openOrders: houseOpenOrders.length,
      urgentOpenOrders: urgentOrders.length,
      soonOpenOrders: soonOrders.length,
      openOrdersList: houseOpenOrders.slice(0, 2),
      status
    };
  }) || [];

  const overallStatus = {
    totalHouses: houseStatuses.length,
    totalOpenOrders: openOrders?.length || 0,
    urgentOpenOrders: openOrders?.filter(o => o.isUrgent).length || 0,
    soonOpenOrders: openOrders?.filter(o => o.isSoon).length || 0,
    totalBookingsWithoutOrder: houseStatuses.reduce((sum, h) => sum + h.bookingsWithoutOrder, 0),
    totalUrgentBookings: houseStatuses.reduce((sum, h) => sum + h.urgentBookingsWithoutOrder, 0),
    criticalHouses: houseStatuses.filter(h => h.status === 'critical').length,
    warningHouses: houseStatuses.filter(h => h.status === 'warning').length,
    goodHouses: houseStatuses.filter(h => h.status === 'good').length,
  };

  // Confirm order mutation (offen → pending)
  const confirmOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('linen_orders')
        .update({ status: 'pending' })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linen-orders-open'] });
      queryClient.invalidateQueries({ queryKey: ['houses-linen-overview'] });
      queryClient.invalidateQueries({ queryKey: ['linen-orders-list'] });
      toast({
        title: "✅ Bestellung bestätigt",
        description: "Status wurde auf 'Ausstehend' gesetzt."
      });
    },
    onError: (error) => {
      toast({
        title: "❌ Fehler",
        description: `Bestellung konnte nicht bestätigt werden: ${error.message}`,
        variant: "destructive"
      });
    }
  });

  const handleConfirmOrder = (orderId: string) => {
    confirmOrderMutation.mutate(orderId);
  };

  // Countdown in Tagen berechnen
  const calculateDaysUntil = (dateString: string) => {
    const today = new Date();
    const targetDate = new Date(dateString);
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusColor = (status: HouseLinenStatus['status']) => {
    switch (status) {
      case 'good': return 'border-green-200 bg-green-50';
      case 'warning': return 'border-yellow-200 bg-yellow-50';
      case 'critical': return 'border-red-200 bg-blue-50 dark:bg-blue-950/20';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getStatusBadge = (status: HouseLinenStatus['status']) => {
    switch (status) {
      case 'good': 
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <span className="mr-1">✅</span>
            OK
          </Badge>
        );
      case 'warning': 
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <span className="mr-1">⚠️</span>
            Zu prüfen
          </Badge>
        );
      case 'critical': 
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            <span className="mr-1">🔴</span>
            Dringend
          </Badge>
        );
      default: 
        return null;
    }
  };

  // Handle quick order creation
  const handleQuickOrder = (houseStatus: HouseLinenStatus) => {
    console.log('🛒 Quick order for', houseStatus.house.name);
    
    const house = houseStatus.house;
    const linenStock = house.linen_stock || {};
    const orderedLinen = house.ordered_linen || {};
    const linenDef = house.linen_set_definitions?.[0] || {};
    const houseBookings = upcomingBookings?.filter(b => b.house_id === house.id) || [];
    const nearTermBookings = houseBookings.slice(0, 3); // Next 3 bookings
    
    const linenTypes = [
      'bedding', 'large_towels', 'small_towels', 'sauna_towels',
      'bath_mats', 'sink_towels', 'kitchen_towels', 'blankets', 'pillow_cases'
    ];

    const orderItems: Record<string, number> = {};
    
    // Calculate deficits for each linen type
    linenTypes.forEach(type => {
      const currentStock = (linenStock[type] || 0) + (orderedLinen[type] || 0);
      
      let demand = 0;
      nearTermBookings.forEach(booking => {
        const perGuestKey = `${type}_per_guest`;
        const perBookingKey = `${type}_per_booking`;
        
        if (linenDef[perGuestKey]) {
          demand += booking.number_of_guests * linenDef[perGuestKey];
        } else if (linenDef[perBookingKey]) {
          demand += linenDef[perBookingKey];
        }
      });

      const deficit = Math.max(0, demand - currentStock);
      if (deficit > 0) {
        orderItems[type] = deficit;
      }
    });

    if (Object.keys(orderItems).length > 0) {
      setOrderHouse(house);
      setCalculatedOrderItems(orderItems);
      setSelectedBooking(nearTermBookings[0] || null); // Erste kritische Buchung
      setShowOrderDialog(true);
    } else {
      toast({
        title: "Keine Bestellung nötig",
        description: "Ausreichend Lagerbestand für die nächsten Buchungen.",
      });
    }
  };

  // Handle order creation from dialog
  const handleOrderCreation = async (orderData: any) => {
    try {
      await createOptimizedOrderMutation.mutateAsync({
        houseId: orderHouse.id,
        bookingId: orderData.booking_id || selectedBooking?.id,
        orderItems: orderData.orderItems,
        notes: orderData.notes,
        deliveryDate: orderData.deliveryDate,
        priority: 'normal'
      });

      setShowOrderDialog(false);
      setOrderHouse(null);
      setCalculatedOrderItems({});
      setSelectedBooking(null);
      
      toast({
        title: "Bestellung erstellt",
        description: "Die Wäschebestellung wurde erfolgreich angelegt.",
      });
    } catch (error) {
      console.error('❌ Fehler beim Erstellen der Bestellung:', error);
    }
  };

  // Handle edit order
  const handleEditOrder = (order: any) => {
    console.log('📝 Edit Order:', order);
    setEditingOrder(order);
    setEditMode(true);
    setOrderHouse({ id: order.house_id, name: order.houses?.name });
    setCalculatedOrderItems(order.items || {});
    setSelectedBooking(order.bookings || null);
    setShowOrderDialog(true);
  };

  // Update order mutation
  const updateOrderMutation = useMutation({
    mutationFn: async ({ orderId, orderData }: { orderId: string; orderData: any }) => {
      const totalItems = Object.values<number>(orderData.orderItems as Record<string, number>).reduce(
        (sum, count) => sum + count, 
        0
      );
      
      const { data, error } = await supabase
        .from('linen_orders')
        .update({
          items: orderData.orderItems,
          total_items: totalItems,
          notes: orderData.notes,
          delivery_date: orderData.deliveryDate,
          delivery_type: orderData.deliveryType,
          booking_id: orderData.booking_id,
          linen_color: orderData.linenColor,
          item_variants: orderData.itemColors,
          status: orderData.status,
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      // Invalidate all linen order related queries
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-with-bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['houses-linen-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-connected'] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-list'] });
      await queryClient.invalidateQueries({ queryKey: ['connected-bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['booking-orders-status'] });
      
      // Force refetch of critical queries
      await queryClient.refetchQueries({ queryKey: ['linen-orders-list'] });
      await queryClient.refetchQueries({ queryKey: ['linen-orders-connected'] });
      
      setShowOrderDialog(false);
      setEditingOrder(null);
      setEditMode(false);
      setOrderHouse(null);
      toast({
        title: "Bestellung aktualisiert",
        description: "Die Änderungen wurden erfolgreich gespeichert.",
      });
    },
    onError: (error) => {
      console.error('❌ Update error:', error);
      toast({
        title: "Fehler",
        description: "Die Bestellung konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  // Handle order update
  const handleOrderUpdate = async (orderData: any) => {
    if (!editingOrder) return;
    
    try {
      await updateOrderMutation.mutateAsync({
        orderId: editingOrder.id,
        orderData
      });
    } catch (error) {
      console.error('❌ Fehler beim Aktualisieren:', error);
    }
  };

  // Handle delete order
  const handleDeleteOrder = async (order: any) => {
    try {
      const { error } = await supabase
        .from('linen_orders')
        .delete()
        .eq('id', order.id);

      if (error) throw error;

      toast({
        title: "Bestellung gelöscht",
        description: `Die Wäschebestellung wurde erfolgreich gelöscht.`,
      });

      queryClient.invalidateQueries({ queryKey: ['linen-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['houses-linen-overview'] });
    } catch (error) {
      console.error('Error deleting linen order:', error);
      toast({
        title: "Fehler",
        description: "Die Bestellung konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Wäsche-Status wird geladen...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-3xl">📦</span>
            <h1 className="text-3xl font-bold tracking-tight">Wäsche-Dashboard</h1>
          </div>
          <p className="text-muted-foreground">
            Übersicht über alle Wäschebestände und kommende Bedarfe
          </p>
        </div>
      </div>

      {/* Overall Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏠</span>
              <div>
                <div className="text-2xl font-bold">{overallStatus.totalHouses}</div>
                <div className="text-sm text-muted-foreground">Häuser gesamt</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📝</span>
              <div>
                <div className="text-2xl font-bold text-amber-600">{overallStatus.totalOpenOrders}</div>
                <div className="text-sm text-muted-foreground">Offene Bestellungen</div>
                {overallStatus.urgentOpenOrders > 0 && (
                  <div className="text-xs font-bold text-red-600 mt-1">
                    ({overallStatus.urgentOpenOrders} dringend)
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📦</span>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{overallStatus.totalBookingsWithoutOrder}</div>
                <div className="text-sm text-muted-foreground">Buchungen ohne Best.</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔴</span>
              <div>
                <div className="text-2xl font-bold text-red-600">{overallStatus.totalUrgentBookings}</div>
                <div className="text-sm text-muted-foreground">Davon dringend</div>
                <div className="text-xs text-muted-foreground mt-1">(≤7 Tage)</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alert */}
      {(overallStatus.urgentOpenOrders > 0 || overallStatus.totalUrgentBookings > 0) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertDescription>
            <strong>DRINGEND:</strong>
            {overallStatus.urgentOpenOrders > 0 && (
              <span className="block mt-1">
                • <strong>{overallStatus.urgentOpenOrders} offene Bestellungen</strong> müssen bestätigt werden (Lieferung ≤7 Tage)
              </span>
            )}
            {overallStatus.totalUrgentBookings > 0 && (
              <span className="block mt-1">
                • <strong>{overallStatus.totalUrgentBookings} Buchungen</strong> benötigen eine neue Bestellung (Check-in ≤7 Tagen)
              </span>
            )}
            {overallStatus.totalBookingsWithoutOrder > overallStatus.totalUrgentBookings && (
              <span className="block mt-1 text-sm">
                Insgesamt {overallStatus.totalBookingsWithoutOrder} Buchungen ohne Bestellung.
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Houses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {houseStatuses.map((houseStatus) => (
          <Card key={houseStatus.house.id} className={`relative ${getStatusColor(houseStatus.status)}`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{houseStatus.house.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {houseStatus.house.address}
                  </p>
                </div>
                {getStatusBadge(houseStatus.status)}
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Linen Stats */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-medium">Bestellstatus</div>
                  <div className="text-lg font-bold">
                    {houseStatus.bookingsWithoutOrder === 0 ? (
                      <span className="text-green-600">Alle erfasst ✓</span>
                    ) : (
                      <span className="text-red-600">{houseStatus.bookingsWithoutOrder} offen</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="font-medium">Davon dringend</div>
                  <div className="text-lg font-bold">
                    {houseStatus.urgentBookingsWithoutOrder > 0 ? (
                      <span className="text-red-700">{houseStatus.urgentBookingsWithoutOrder}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Offene Bestellungen (zu bestätigen) */}
              {houseStatus.openOrders > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200">
                  <div className="font-medium text-sm mb-2 flex items-center justify-between">
                    <span>📝 Offene Bestellungen (zu bestätigen)</span>
                    <div className="flex gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {houseStatus.openOrders} offen
                      </Badge>
                      {houseStatus.urgentOpenOrders > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {houseStatus.urgentOpenOrders} dringend
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {/* Top 2 dringendste Bestellungen */}
                  <div className="space-y-2">
                    {houseStatus.openOrdersList.map((order: any) => (
                      <div 
                        key={order.id}
                        className={cn(
                          "p-2 rounded border text-sm",
                          order.isUrgent && "border-red-300 bg-red-50 dark:bg-red-950/20",
                          order.isSoon && "border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20",
                          !order.isUrgent && !order.isSoon && "border-gray-300 bg-gray-50 dark:bg-gray-950/20"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">
                            📦 {order.bookings?.guest_name || 'Ohne Buchung'}
                          </span>
                          {order.isUrgent && (
                            <Badge variant="destructive" className="text-xs">DRINGEND</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          Lieferung: {format(new Date(order.delivery_date), 'dd.MM.yyyy', { locale: de })} 
                          {' '}(in {order.daysUntilDelivery} Tagen)
                        </div>
                        <Button 
                          size="sm" 
                          className="w-full h-7 bg-green-600 hover:bg-green-700"
                          onClick={() => handleConfirmOrder(order.id)}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Bestätigen
                        </Button>
                      </div>
                    ))}
                  </div>
                  
                  {houseStatus.openOrders > 2 && (
                    <div className="text-center mt-2">
                      <span className="text-xs text-muted-foreground">
                        + {houseStatus.openOrders - 2} weitere (siehe Bestellungsliste unten)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Issues Summary */}
              {houseStatus.bookingsWithoutOrder > 0 && (
                <div className="space-y-2">
                  {houseStatus.urgentBookingsWithoutOrder > 0 && (
                    <div className="flex items-center gap-2 text-sm text-red-700 font-bold">
                      <AlertTriangle className="h-4 w-4" />
                      <span>{houseStatus.urgentBookingsWithoutOrder} dringende (Check-in ≤ 7 Tage)</span>
                    </div>
                  )}
                  {houseStatus.soonBookingsWithoutOrder > 0 && (
                    <div className="flex items-center gap-2 text-sm text-yellow-700">
                      <Clock className="h-4 w-4" />
                      <span>{houseStatus.soonBookingsWithoutOrder} bald fällig (Check-in ≤ 14 Tage)</span>
                    </div>
                  )}
                  {houseStatus.bookingsWithoutOrder > houseStatus.urgentBookingsWithoutOrder + houseStatus.soonBookingsWithoutOrder && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="h-4 w-4" />
                      <span>
                        {houseStatus.bookingsWithoutOrder - houseStatus.urgentBookingsWithoutOrder - houseStatus.soonBookingsWithoutOrder} weitere ohne Bestellung
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Next Booking */}
              {houseStatus.nextBookingDate && (
                <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Nächste Buchung ohne Bestellung:</span>
                    <Badge variant={houseStatus.urgentBookingsWithoutOrder > 0 ? "destructive" : "secondary"}>
                      in {calculateDaysUntil(houseStatus.nextBookingDate)} Tagen
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(houseStatus.nextBookingDate), 'EEEE, dd.MM.yyyy', { locale: de })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setSelectedHouse(houseStatus.house)}
                >
                  <span className="mr-1">📈</span>
                  Wäsche verwalten
                </Button>
                {houseStatus.status === 'critical' && (
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleQuickOrder(houseStatus)}
                  >
                    <span className="mr-1">🛒</span>
                    Bestellen
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {houseStatuses.length === 0 && (
        <div className="text-center py-12">
          <span className="text-5xl block mb-4">📦</span>
          <h3 className="text-lg font-medium mb-2">Keine Häuser gefunden</h3>
          <p className="text-muted-foreground">
            Fügen Sie Häuser hinzu, um das Wäsche-Management zu nutzen.
          </p>
        </div>
      )}

      {/* Wäschebestellungs-Automatisierung */}
      <AutoLinenOrderSettingsCard />

      {/* Linen Orders with Bookings Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Wäschebestellungen</h2>
            <p className="text-muted-foreground">
              Übersicht aller Wäschebestellungen mit Buchungsinformationen
            </p>
          </div>
          <Button 
            onClick={() => {
              setEditMode(false);
              setEditingOrder(null);
              setSelectedBooking(null);
              setCalculatedOrderItems({});
              setShowNewOrderDialog(true);
            }}
            className="bg-primary hover:bg-primary/90"
          >
                <Plus className="w-4 h-4 mr-2" />
                Neue Wäschebestellung
          </Button>
        </div>
        <LinenOrdersList onEditOrder={handleEditOrder} onDeleteOrder={handleDeleteOrder} />
      </div>

      {/* House Selection Dialog for New Order */}
      <Dialog open={showNewOrderDialog} onOpenChange={setShowNewOrderDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Neue Wäschebestellung</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label>Für welches Haus?</Label>
            <Select onValueChange={(houseId) => {
              const house = houses?.find(h => h.id === houseId);
              if (house) {
                setOrderHouse(house);
                
                // Wäscheset-Regeln des Hauses laden und als Default-Items setzen
                const linenDef = house.linen_set_definitions?.[0];
                if (linenDef) {
                  const defaultItems: Record<string, number> = {};
                  
                  // Per-Guest Items (1 Gast als Basis)
                  if (linenDef.bedding_per_guest) defaultItems.bedding = linenDef.bedding_per_guest;
                  if (linenDef.large_towels_per_guest) defaultItems.large_towels = linenDef.large_towels_per_guest;
                  if (linenDef.small_towels_per_guest) defaultItems.small_towels = linenDef.small_towels_per_guest;
                  if (linenDef.sauna_towels_per_guest) defaultItems.sauna_towels = linenDef.sauna_towels_per_guest;
                  if (linenDef.pillow_cases_per_guest) defaultItems.pillow_cases = linenDef.pillow_cases_per_guest;
                  if (linenDef.blankets_per_guest) defaultItems.blankets = linenDef.blankets_per_guest;
                  
                  // Per-Booking Items
                  if (linenDef.bath_mats_per_booking) defaultItems.bath_mats = linenDef.bath_mats_per_booking;
                  if (linenDef.sink_towels_per_booking) defaultItems.sink_towels = linenDef.sink_towels_per_booking;
                  if (linenDef.kitchen_towels_per_booking) defaultItems.kitchen_towels = linenDef.kitchen_towels_per_booking;
                  
                  setCalculatedOrderItems(defaultItems);
                } else {
                  // Fallback: Alle Kategorien mit 0 initialisieren
                  setCalculatedOrderItems({
                    bedding: 0,
                    large_towels: 0,
                    small_towels: 0,
                    sauna_towels: 0,
                    bath_mats: 0,
                    sink_towels: 0,
                    kitchen_towels: 0,
                  });
                }
                
                setShowOrderDialog(true);
                setShowNewOrderDialog(false);
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Haus auswählen" />
              </SelectTrigger>
              <SelectContent>
                {houses?.map((house) => (
                  <SelectItem key={house.id} value={house.id}>
                    {house.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      {/* House Detail Dialog */}
      {selectedHouse && (
        <LinenInventoryDialog
          house={selectedHouse}
          open={!!selectedHouse}
          onOpenChange={(open) => {
            if (!open) setSelectedHouse(null);
          }}
        />
      )}

      {/* Linen Order Dialog */}
      {orderHouse && (
        <LinenOrderDialog
          open={showOrderDialog}
          onOpenChange={(open) => {
            setShowOrderDialog(open);
            if (!open) {
              setEditMode(false);
              setEditingOrder(null);
            }
          }}
          mode={editMode ? 'edit' : 'create'}
          initialData={editMode ? editingOrder : undefined}
          orderItems={calculatedOrderItems}
          houseName={orderHouse.name || 'Unbekannt'}
          houseId={orderHouse.id}
          selectedBooking={selectedBooking}
          availableBookings={
            editMode && selectedBooking
              ? [selectedBooking]
              : upcomingBookings?.filter(
                  b => b.house_id === orderHouse.id && 
                       (!b.linen_orders || b.linen_orders.length === 0)
                ) || []
          }
          linenSetDefinition={orderHouse.linen_set_definitions?.[0]}
          onCreateOrder={editMode ? handleOrderUpdate : handleOrderCreation}
          isCreating={editMode ? updateOrderMutation.isPending : createOptimizedOrderMutation.isPending}
          allowExceptionalOrder={true}
        />
      )}
    </div>
  );
};

export default LinenDashboard;