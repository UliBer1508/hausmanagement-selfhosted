import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  ShoppingCart, 
  Mail,
  Calendar,
  Users,
  TrendingUp
} from 'lucide-react';
import { format, addDays, isBefore } from 'date-fns';
import { de } from 'date-fns/locale';

interface LinenManagementProps {
  house: any;
}

interface LinenDemand {
  itemType: string;
  label: string;
  currentStock: number;
  totalDemand: number;
  deficit: number;
  status: 'sufficient' | 'low' | 'critical';
  bookingDetails: Array<{
    guestName: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    demand: number;
  }>;
}

const LinenManagement = ({ house }: LinenManagementProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedBookings, setSelectedBookings] = useState<string[]>([]);
  const [lookaheadDays, setLookaheadDays] = useState(30);

  // Fetch linen set definitions
  const { data: linenDef } = useQuery({
    queryKey: ['linen-definitions', house?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', house.id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data || {};
    },
    enabled: !!house?.id,
  });

  // Fetch upcoming bookings
  const { data: upcomingBookings } = useQuery({
    queryKey: ['upcoming-bookings', house?.id, lookaheadDays],
    queryFn: async () => {
      const lookaheadDate = format(addDays(new Date(), lookaheadDays), 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('house_id', house.id)
        .gte('check_in', format(new Date(), 'yyyy-MM-dd'))
        .lte('check_in', lookaheadDate)
        .order('check_in', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!house?.id,
  });

  // Fetch existing linen orders
  const { data: existingOrders } = useQuery({
    queryKey: ['linen-orders', house?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select('*')
        .eq('house_id', house.id)
        .in('status', ['pending', 'confirmed', 'in_progress'])
        .order('order_date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!house?.id,
  });

  // Calculate linen demand analysis
  const linenAnalysis = useMemo(() => {
    if (!linenDef || !upcomingBookings || !house?.linen_stock) return [];

    const linenTypes = [
      { key: 'bedding', label: 'Bettwäsche', perGuestKey: 'bedding_per_guest', perBookingKey: null },
      { key: 'large_towels', label: 'Badetücher', perGuestKey: 'large_towels_per_guest', perBookingKey: null },
      { key: 'small_towels', label: 'Handtücher klein', perGuestKey: 'small_towels_per_guest', perBookingKey: null },
      { key: 'sauna_towels', label: 'Saunatücher', perGuestKey: 'sauna_towels_per_guest', perBookingKey: null },
      { key: 'bath_mats', label: 'Badematten', perGuestKey: null, perBookingKey: 'bath_mats_per_booking' },
      { key: 'sink_towels', label: 'WB-Handtücher', perGuestKey: null, perBookingKey: 'sink_towels_per_booking' },
      { key: 'kitchen_towels', label: 'Geschirrtücher', perGuestKey: null, perBookingKey: 'kitchen_towels_per_booking' },
      { key: 'blankets', label: 'Decken', perGuestKey: 'blankets_per_guest', perBookingKey: null },
      { key: 'pillow_cases', label: 'Kissenbezüge', perGuestKey: 'pillow_cases_per_guest', perBookingKey: null },
    ];

    const bookingsToConsider = selectedBookings.length > 0 
      ? upcomingBookings.filter(b => selectedBookings.includes(b.id))
      : upcomingBookings;

    return linenTypes.map(type => {
      const currentStock = house.linen_stock[type.key] || 0;
      const orderedStock = house.ordered_linen?.[type.key] || 0;
      const availableStock = currentStock + orderedStock;
      
      let totalDemand = 0;
      const bookingDetails: LinenDemand['bookingDetails'] = [];

      bookingsToConsider.forEach(booking => {
        let bookingDemand = 0;
        
        if (type.perGuestKey) {
          bookingDemand = booking.number_of_guests * (linenDef[type.perGuestKey] || 0);
        } else if (type.perBookingKey) {
          bookingDemand = linenDef[type.perBookingKey] || 0;
        }

        if (bookingDemand > 0) {
          bookingDetails.push({
            guestName: booking.guest_name,
            checkIn: booking.check_in,
            checkOut: booking.check_out,
            guests: booking.number_of_guests,
            demand: bookingDemand
          });
        }
        
        totalDemand += bookingDemand;
      });

      const deficit = Math.max(0, totalDemand - availableStock);
      let status: LinenDemand['status'] = 'sufficient';
      
      if (deficit > 0) {
        status = 'critical';
      } else if (totalDemand > availableStock * 0.8) {
        status = 'low';
      }

      return {
        itemType: type.key,
        label: type.label,
        currentStock: availableStock,
        totalDemand,
        deficit,
        status,
        bookingDetails: bookingDetails.sort((a, b) => 
          new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
        )
      };
    }).filter(item => item.totalDemand > 0);
  }, [linenDef, upcomingBookings, house?.linen_stock, house?.ordered_linen, selectedBookings]);

  // Create automatic order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (orderItems: Record<string, number>) => {
      const totalItems = Object.values(orderItems).reduce((sum, count) => sum + count, 0);
      
      const { data, error } = await supabase
        .from('linen_orders')
        .insert({
          house_id: house.id,
          provider_id: 'd8110105-8ac9-45e3-ad32-aaf42393744c', // Default laundry provider
          items: orderItems,
          total_items: totalItems,
          status: 'pending',
          order_date: format(new Date(), 'yyyy-MM-dd'),
          delivery_date: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
          notes: `Automatische Bestellung basierend auf Bedarfsanalyse für ${lookaheadDays} Tage`
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linen-orders', house.id] });
      toast({
        title: "Bestellung erstellt",
        description: "Die Wäschebestellung wurde erfolgreich erstellt.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Die Bestellung konnte nicht erstellt werden.",
        variant: "destructive",
      });
      console.error('Error creating linen order:', error);
    },
  });

  const handleCreateOrder = () => {
    const orderItems: Record<string, number> = {};
    
    linenAnalysis.forEach(item => {
      if (item.deficit > 0) {
        orderItems[item.itemType] = item.deficit;
      }
    });

    if (Object.keys(orderItems).length > 0) {
      createOrderMutation.mutate(orderItems);
    }
  };

  const getStatusColor = (status: LinenDemand['status']) => {
    switch (status) {
      case 'sufficient': return 'bg-green-100 text-green-800 border-green-200';
      case 'low': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: LinenDemand['status']) => {
    switch (status) {
      case 'sufficient': return <CheckCircle className="w-4 h-4" />;
      case 'low': return <AlertTriangle className="w-4 h-4" />;
      case 'critical': return <AlertTriangle className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const criticalItems = linenAnalysis.filter(item => item.status === 'critical');
  const lowItems = linenAnalysis.filter(item => item.status === 'low');

  return (
    <div className="space-y-6">
      {/* Alert for critical items */}
      {criticalItems.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{criticalItems.length} Wäschearten</strong> haben kritische Bestände für die kommenden Buchungen.
            <Button
              variant="outline" 
              size="sm" 
              className="ml-2"
              onClick={handleCreateOrder}
              disabled={createOrderMutation.isPending}
            >
              <ShoppingCart className="w-4 h-4 mr-1" />
              Automatisch bestellen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="analysis" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="analysis">Bedarfsanalyse</TabsTrigger>
          <TabsTrigger value="bookings">Buchungen</TabsTrigger>
          <TabsTrigger value="orders">Bestellungen</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="space-y-4">
          {/* Analysis Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Bedarfsanalyse für {house.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Vorausschau:</label>
                  <select 
                    value={lookaheadDays} 
                    onChange={(e) => setLookaheadDays(Number(e.target.value))}
                    className="border rounded px-2 py-1"
                  >
                    <option value={14}>14 Tage</option>
                    <option value={30}>30 Tage</option>
                    <option value={60}>60 Tage</option>
                    <option value={90}>90 Tage</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {upcomingBookings?.length || 0} Buchungen berücksichtigt
                  </span>
                </div>
              </div>

              {/* Linen Status Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {linenAnalysis.map((item) => (
                  <Card key={item.itemType} className="relative">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium">{item.label}</h4>
                        <Badge 
                          variant="outline" 
                          className={getStatusColor(item.status)}
                        >
                          {getStatusIcon(item.status)}
                          <span className="ml-1">
                            {item.status === 'sufficient' && 'Ausreichend'}
                            {item.status === 'low' && 'Niedrig'}
                            {item.status === 'critical' && 'Kritisch'}
                          </span>
                        </Badge>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bestand:</span>
                          <span className="font-medium">{item.currentStock}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bedarf:</span>
                          <span className="font-medium">{item.totalDemand}</span>
                        </div>
                        {item.deficit > 0 && (
                          <div className="flex justify-between text-red-600">
                            <span>Fehlend:</span>
                            <span className="font-bold">{item.deficit}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Verfügbar:</span>
                          <span className={`font-medium ${item.deficit > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {Math.max(0, item.currentStock - item.totalDemand)}
                          </span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${
                              item.status === 'sufficient' ? 'bg-green-500' :
                              item.status === 'low' ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ 
                              width: `${Math.min(100, (item.currentStock / item.totalDemand) * 100)}%` 
                            }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {Math.round((item.currentStock / item.totalDemand) * 100)}% verfügbar
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bookings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Anstehende Buchungen ({upcomingBookings?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingBookings?.map((booking) => {
                  const totalLinenDemand = linenAnalysis.reduce((sum, item) => {
                    const bookingDemand = item.bookingDetails.find(bd => bd.guestName === booking.guest_name);
                    return sum + (bookingDemand?.demand || 0);
                  }, 0);

                  return (
                    <div 
                      key={booking.id} 
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedBookings.includes(booking.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedBookings([...selectedBookings, booking.id]);
                            } else {
                              setSelectedBookings(selectedBookings.filter(id => id !== booking.id));
                            }
                          }}
                          className="rounded"
                        />
                        <div>
                          <div className="font-medium">{booking.guest_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de })} - {' '}
                            {format(new Date(booking.check_out), 'dd.MM.yyyy', { locale: de })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="w-4 h-4" />
                          <span>{booking.number_of_guests} Gäste</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {totalLinenDemand} Teile benötigt
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Aktuelle Bestellungen
              </CardTitle>
            </CardHeader>
            <CardContent>
              {existingOrders?.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Keine aktiven Bestellungen
                </p>
              ) : (
                <div className="space-y-3">
                  {existingOrders?.map((order) => (
                    <div key={order.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium">
                          Bestellung #{order.id.slice(0, 8)}
                        </div>
                        <Badge variant="outline">{order.status}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div>Bestellt am: {format(new Date(order.order_date), 'dd.MM.yyyy', { locale: de })}</div>
                        {order.delivery_date && (
                          <div>Lieferung: {format(new Date(order.delivery_date), 'dd.MM.yyyy', { locale: de })}</div>
                        )}
                        <div>Gesamt: {order.total_items} Teile</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LinenManagement;