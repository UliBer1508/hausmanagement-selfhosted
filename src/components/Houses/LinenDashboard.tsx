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
import { LINEN_ORDER_STATUSES } from '@/lib/linenOrderHelpers';
import LinenInventoryDialog from './LinenInventoryDialog';
import LinenOrderDialog from './LinenOrderDialog';
import LinenOrdersList from './LinenOrdersList';
import AutoLinenOrderSettingsCard from './AutoLinenOrderSettingsCard';

interface HouseLinenStatus {
  house: any;
  // Neue Metriken
  bookingsWithOrder: number;        // Buchungen MIT Wäschebestellung
  pendingOrders: number;            // Davon noch nicht geliefert (status=pending)
  bookingsWithoutOrder: number;     // Buchungen OHNE Wäschebestellung
  ordersToApprove: number;          // Bestellungen zur Genehmigung (status=offen)
  nextApprovalDue?: string;         // Datum der nächsten zu genehmigenden Bestellung
  nextBookingWithoutOrder?: string; // Nächste Buchung ohne Bestellung
  // Legacy für Kompatibilität
  urgentBookingsWithoutOrder: number;
  ordersToApproveList: any[];
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
          linen_set_definitions!linen_set_definitions_house_id_fkey (*)
        `)
        .eq('rental_type', 'tourist')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch upcoming bookings for all houses (only confirmed)
  const { data: upcomingBookings } = useQuery({
    queryKey: ['all-upcoming-bookings-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, linen_orders!linen_orders_booking_id_fkey(id)')
        .gte('check_out', format(new Date(), 'yyyy-MM-dd'))
        .in('status', ['confirmed', 'checked_in'])
        .order('check_in', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch orders to approve (status 'offen')
  const { data: ordersToApprove } = useQuery({
    queryKey: ['linen-orders-to-approve', 'tourist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          *,
          houses!linen_orders_house_id_fkey!inner(id, name, rental_type),
          bookings!linen_orders_booking_id_fkey(guest_name, check_in)
        `)
        .eq('houses.rental_type', 'tourist')
        .eq('status', 'offen')
        .order('delivery_date', { ascending: true });
      
      if (error) throw error;
      
      const today = new Date();
      return data.map(order => {
        const daysUntilDelivery = Math.ceil(
          (new Date(order.delivery_date).getTime() - today.getTime()) 
          / (1000 * 60 * 60 * 24)
        );
        return { ...order, daysUntilDelivery, isUrgent: daysUntilDelivery <= 7 };
      });
    }
  });

  // Fetch pending orders (status 'pending' - bestätigt, noch nicht geliefert)
  const { data: pendingOrders } = useQuery({
    queryKey: ['linen-orders-pending', 'tourist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          *,
          houses!linen_orders_house_id_fkey!inner(id, name, rental_type),
          bookings!linen_orders_booking_id_fkey(guest_name, check_in)
        `)
        .eq('houses.rental_type', 'tourist')
        .eq('status', 'offen')
        .order('delivery_date', { ascending: true });
      
      if (error) throw error;
      return data || [];
    }
  });

  // Calculate linen status for each house
  const houseStatuses: HouseLinenStatus[] = houses?.map(house => {
    const houseBookings = upcomingBookings?.filter(b => b.house_id === house.id) || [];
    
    // Buchungen MIT Wäschebestellung
    const bookingsWithOrderArr = houseBookings.filter(booking => 
      booking.linen_orders && booking.linen_orders.length > 0
    );
    
    // Buchungen OHNE Wäschebestellung
    const bookingsWithoutOrderArr = houseBookings.filter(booking => 
      !booking.linen_orders || booking.linen_orders.length === 0
    );

    // Pending orders für dieses Haus (bestätigt, noch nicht geliefert)
    const housePendingOrders = pendingOrders?.filter(o => o.house_id === house.id) || [];
    
    // Orders zur Genehmigung für dieses Haus (status=offen)
    const houseOrdersToApprove = ordersToApprove?.filter(o => o.house_id === house.id) || [];

    // Dringlichkeit berechnen
    const today = new Date();
    const urgentBookings = bookingsWithoutOrderArr.filter(booking => {
      const daysUntil = Math.ceil((new Date(booking.check_in).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil <= 7;
    });

    // Status bestimmen
    let status: HouseLinenStatus['status'] = 'good';
    const hasUrgentApproval = houseOrdersToApprove.some(o => o.isUrgent);
    if (urgentBookings.length > 0 || hasUrgentApproval) {
      status = 'critical';
    } else if (bookingsWithoutOrderArr.length > 0 || houseOrdersToApprove.length > 0) {
      status = 'warning';
    }

    // Nächste Buchung ohne Bestellung
    const nextUnorderedBooking = [...bookingsWithoutOrderArr].sort((a, b) => 
      new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
    )[0];

    // Nächste zu genehmigende Bestellung
    const nextApproval = houseOrdersToApprove[0];

    return {
      house,
      bookingsWithOrder: bookingsWithOrderArr.length,
      pendingOrders: housePendingOrders.length,
      bookingsWithoutOrder: bookingsWithoutOrderArr.length,
      ordersToApprove: houseOrdersToApprove.length,
      nextApprovalDue: nextApproval?.delivery_date,
      nextBookingWithoutOrder: nextUnorderedBooking?.check_in,
      urgentBookingsWithoutOrder: urgentBookings.length,
      ordersToApproveList: houseOrdersToApprove.slice(0, 2),
      status
    };
  }) || [];

  const overallStatus = {
    totalHouses: houseStatuses.length,
    totalOrdersToApprove: ordersToApprove?.length || 0,
    urgentOrdersToApprove: ordersToApprove?.filter(o => o.isUrgent).length || 0,
    totalPendingOrders: pendingOrders?.length || 0,
    totalBookingsWithoutOrder: houseStatuses.reduce((sum, h) => sum + h.bookingsWithoutOrder, 0),
    totalBookingsWithOrder: houseStatuses.reduce((sum, h) => sum + h.bookingsWithOrder, 0),
    totalUrgentBookings: houseStatuses.reduce((sum, h) => sum + h.urgentBookingsWithoutOrder, 0),
    criticalHouses: houseStatuses.filter(h => h.status === 'critical').length,
  };

  // Confirm order mutation (offen → ausstehend)
  const confirmOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from('linen_orders')
        .update({ status: LINEN_ORDER_STATUSES.AUSSTEHEND })
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
      case 'good': return 'border-l-4 border-l-green-600 bg-green-50';
      case 'warning': return 'border-l-4 border-l-yellow-500 bg-green-50';
      case 'critical': return 'border-l-4 border-l-red-500 bg-green-50';
      default: return 'border-l-4 border-l-gray-300 bg-green-50';
    }
  };

  const getStatusPillText = (status: HouseLinenStatus['status']) => {
    switch (status) {
      case 'good': return 'OK';
      case 'warning': return 'Zu prüfen';
      case 'critical': return 'Dringend';
      default: return '—';
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
      <div className="space-y-6">
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
    <div className="space-y-6">
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏠</span>
              <div>
                <div className="text-2xl font-bold">{overallStatus.totalHouses}</div>
                <div className="text-sm text-muted-foreground">Häuser</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✅</span>
              <div>
                <div className="text-2xl font-bold text-green-600">{overallStatus.totalBookingsWithOrder}</div>
                <div className="text-sm text-muted-foreground">Mit Bestellung</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📦</span>
              <div>
                <div className="text-2xl font-bold text-blue-600">{overallStatus.totalPendingOrders}</div>
                <div className="text-sm text-muted-foreground">Ausstehend</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{overallStatus.totalBookingsWithoutOrder}</div>
                <div className="text-sm text-muted-foreground">Ohne Bestellung</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📝</span>
              <div>
                <div className="text-2xl font-bold text-amber-600">{overallStatus.totalOrdersToApprove}</div>
                <div className="text-sm text-muted-foreground">Zu genehmigen</div>
                {overallStatus.urgentOrdersToApprove > 0 && (
                  <div className="text-xs font-bold text-red-600 mt-1">
                    ({overallStatus.urgentOrdersToApprove} dringend)
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alert */}
      {(overallStatus.urgentOrdersToApprove > 0 || overallStatus.totalUrgentBookings > 0) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-5 w-5" />
          <AlertDescription>
            <strong>DRINGEND:</strong>
            {overallStatus.urgentOrdersToApprove > 0 && (
              <span className="block mt-1">
                • <strong>{overallStatus.urgentOrdersToApprove} Bestellungen</strong> müssen genehmigt werden (Lieferung ≤7 Tage)
              </span>
            )}
            {overallStatus.totalUrgentBookings > 0 && (
              <span className="block mt-1">
                • <strong>{overallStatus.totalUrgentBookings} Buchungen</strong> benötigen eine Bestellung (Check-in ≤7 Tage)
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Houses - stacked on mobile, 2-column on larger screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {houseStatuses.map((houseStatus) => (
          <Card
            key={houseStatus.house.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedHouse(houseStatus.house)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelectedHouse(houseStatus.house);
              }
            }}
            className={`relative cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary ${getStatusColor(houseStatus.status)}`}
            aria-label={`${houseStatus.house.name} verwalten`}
          >
            <div
              className="flex items-center gap-2 px-3 py-2 text-white rounded-t-lg"
              style={{ background: 'linear-gradient(100deg,#059669,#10b981)' }}
            >
              <div
                className="w-7 h-7 rounded-lg grid place-items-center text-[15px] shrink-0"
                style={{ background: 'rgba(255,255,255,.22)' }}
              >
                📦
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-wider opacity-90">
                  Wäsche · {houseStatus.house.name}
                </div>
                <div className="text-[14px] font-extrabold leading-tight truncate">
                  Wäsche-Status
                </div>
              </div>
              <span
                className="text-[10px] font-extrabold px-2 py-1 rounded-full bg-white/95 shrink-0"
                style={{ color: '#059669' }}
              >
                {getStatusPillText(houseStatus.status)}
              </span>
            </div>
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                {/* House Address */}
                {houseStatus.house.address && (
                  <div className="text-xs text-muted-foreground truncate">{houseStatus.house.address}</div>
                )}

                {/* Stats Grid - Compact */}
                <div className="flex flex-wrap gap-4">
                  {/* Mit Bestellung */}
                  <div className="text-center min-w-[64px]">
                    <div className="text-xl font-bold text-green-600">{houseStatus.bookingsWithOrder}</div>
                    <div className="text-xs text-muted-foreground">Mit Bestellung</div>
                  </div>

                  {/* Ausstehend (pending) */}
                  <div className="text-center min-w-[64px]">
                    <div className="text-xl font-bold text-blue-600">{houseStatus.pendingOrders}</div>
                    <div className="text-xs text-muted-foreground">Ausstehend</div>
                  </div>

                  {/* Ohne Bestellung */}
                  <div className="text-center min-w-[64px]">
                    <div className={cn(
                      "text-xl font-bold",
                      houseStatus.bookingsWithoutOrder > 0 ? "text-yellow-600" : "text-muted-foreground"
                    )}>
                      {houseStatus.bookingsWithoutOrder}
                    </div>
                    <div className="text-xs text-muted-foreground">Ohne Bestellung</div>
                    {houseStatus.urgentBookingsWithoutOrder > 0 && (
                      <div className="text-xs text-red-600 font-medium">({houseStatus.urgentBookingsWithoutOrder} dringend)</div>
                    )}
                  </div>

                  {/* Zu genehmigen */}
                  <div className="text-center min-w-[64px]">
                    <div className={cn(
                      "text-xl font-bold",
                      houseStatus.ordersToApprove > 0 ? "text-amber-600" : "text-muted-foreground"
                    )}>
                      {houseStatus.ordersToApprove}
                    </div>
                    <div className="text-xs text-muted-foreground">Zu genehmigen</div>
                  </div>

                  {/* Nächste Fälligkeit */}
                  <div className="text-center min-w-[100px] ml-auto">
                    {houseStatus.nextApprovalDue ? (
                      <>
                        <div className="text-xs font-bold text-amber-600">
                          in {calculateDaysUntil(houseStatus.nextApprovalDue)} Tagen
                        </div>
                        <div className="text-xs text-muted-foreground">Nächste Genehmigung</div>
                      </>
                    ) : houseStatus.nextBookingWithoutOrder ? (
                      <>
                        <div className={cn(
                          "text-xs font-bold",
                          houseStatus.urgentBookingsWithoutOrder > 0 ? "text-red-600" : "text-yellow-600"
                        )}>
                          in {calculateDaysUntil(houseStatus.nextBookingWithoutOrder)} Tagen
                        </div>
                        <div className="text-xs text-muted-foreground">Nächste ohne Best.</div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-bold text-green-600">—</div>
                        <div className="text-xs text-muted-foreground">Alles erledigt</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {houseStatus.ordersToApprove > 0 && (
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700"
                      onClick={() => handleConfirmOrder(houseStatus.ordersToApproveList[0]?.id)}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Genehmigen
                    </Button>
                  )}
                </div>
              </div>

              {/* Expandable approval section */}
              {houseStatus.ordersToApprove > 1 && (
                <div className="mt-3 pt-3 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                  <div className="text-sm text-muted-foreground mb-2">
                    {houseStatus.ordersToApprove} Bestellungen zur Genehmigung:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {houseStatus.ordersToApproveList.map((order: any) => (
                      <div 
                        key={order.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border",
                          order.isUrgent ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "border-amber-200 bg-amber-50 dark:bg-amber-950/20"
                        )}
                      >
                        <span>{order.bookings?.guest_name || 'Ohne Buchung'}</span>
                        <span className="text-muted-foreground">
                          {format(new Date(order.delivery_date), 'dd.MM.', { locale: de })}
                        </span>
                        {order.isUrgent && <Badge variant="destructive" className="text-xs h-5">!</Badge>}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-green-600 hover:text-green-700 hover:bg-green-100"
                          onClick={() => handleConfirmOrder(order.id)}
                        >
                          <CheckCircle className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
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
            className="bg-primary hover:bg-primary/90 w-full sm:w-auto shrink-0"
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
              : upcomingBookings?.filter(b => b.house_id === orderHouse.id) || []
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