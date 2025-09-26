import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  ShoppingCart, 
  Edit,
  Calendar,
  Users,
  Home,
  TrendingUp,
  Percent
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import LinenOrderDialog from './LinenOrderDialog';
import LinenSetRulesTab from './LinenSetRulesTab';
import LinenOrdersTab from './LinenOrdersTab';

interface LinenInventoryDashboardProps {
  house: any;
}

interface LinenCategory {
  key: string;
  label: string;
  currentStock: number;
  totalDemand: number;
  shortage: number;
  status: 'sufficient' | 'low' | 'critical';
  availabilityPercent: number;
}

interface BookingDemand {
  id: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  days: number;
  guests: number;
  bathrooms: number;
  totalLinenItems: number;
}

const LinenInventoryDashboard = ({ house }: LinenInventoryDashboardProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedBookings, setSelectedBookings] = useState<string[]>([]);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

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
      return data || {
        bedding_per_guest: 1,
        large_towels_per_guest: 1,
        small_towels_per_guest: 1,
        sauna_towels_per_guest: 1,
        blankets_per_guest: 1,
        pillow_cases_per_guest: 1,
        bath_mats_per_booking: 3,
        sink_towels_per_booking: 3,
        kitchen_towels_per_booking: 2
      };
    },
    enabled: !!house?.id,
  });

  // Fetch upcoming bookings
  const { data: upcomingBookings } = useQuery({
    queryKey: ['linen-upcoming-bookings', house?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('house_id', house.id)
        .gte('check_in', new Date().toISOString().split('T')[0])
        .order('check_in', { ascending: true })
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!house?.id,
  });

  // Create linen order mutation
  const createLinenOrderMutation = useMutation({
    mutationFn: async (orderData: {
      orderItems: Record<string, number>;
      notes?: string;
      deliveryDate?: string;
      deliveryType?: 'delivery' | 'pickup';
    }) => {
      console.log('📤 Sende Bestellung an Datenbank:', orderData);
      
      const totalItems = Object.values(orderData.orderItems).reduce((sum, count) => sum + count, 0);
      
      // Use selected booking if available, otherwise find the next confirmed booking
      let targetBookingId = null;
      
      if (selectedBookings.length > 0) {
        // Use the first selected booking
        targetBookingId = selectedBookings[0];
        console.log('🎯 Verwende ausgewählte Buchung:', targetBookingId);
      } else {
        // Fallback: Find the current booking for this house
        const { data: currentBooking } = await supabase
          .from('bookings')
          .select('id')
          .eq('house_id', house.id)
          .eq('status', 'confirmed')
          .gte('check_out', new Date().toISOString())
          .order('check_in', { ascending: true })
          .limit(1)
          .single();
        
        targetBookingId = currentBooking?.id || null;
        console.log('🔗 Fallback - Verknüpfe mit nächster Buchung:', targetBookingId);
      }

      const { data, error } = await supabase
        .from('linen_orders')
        .insert({
          house_id: house.id,
          booking_id: targetBookingId,
          provider_id: 'd8110105-8ac9-45e3-ad32-aaf42393744c', // Default laundry provider
          items: orderData.orderItems,
          total_items: totalItems,
          status: 'pending',
          order_date: format(new Date(), 'yyyy-MM-dd'),
          delivery_date: orderData.deliveryDate || format(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
          delivery_type: orderData.deliveryType || 'delivery',
          notes: orderData.notes || 'Bestellung über Inventar-Dashboard'
        })
        .select()
        .single();

      if (error) {
        console.error('❌ DB Fehler:', error);
        throw error;
      }
      
      console.log('✅ Bestellung erfolgreich erstellt:', data);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['linen-orders', house.id] });
      toast({
        title: "Bestellung erstellt",
        description: `Bestellung mit ${data.total_items} Artikeln wurde erfolgreich erstellt.`,
      });
    },
    onError: (error: any) => {
      console.error('❌ Bestellfehler:', error);
      toast({
        title: "Fehler bei Bestellung",
        description: error.message || "Die Bestellung konnte nicht erstellt werden.",
        variant: "destructive",
      });
    },
  });

  // Calculate linen categories with demand
  const linenCategories = useMemo((): LinenCategory[] => {
    if (!linenDef || !upcomingBookings || !house?.linen_stock) return [];

    const categories = [
      { key: 'bedding', label: 'Bettwäsche', perGuestKey: 'bedding_per_guest' as const, perBookingKey: null },
      { key: 'blankets', label: 'Decken', perGuestKey: 'blankets_per_guest' as const, perBookingKey: null },
      { key: 'bath_mats', label: 'Badematten', perGuestKey: null, perBookingKey: 'bath_mats_per_booking' as const },
      { key: 'sink_towels', label: 'Handtücher Waschbecken', perGuestKey: null, perBookingKey: 'sink_towels_per_booking' as const },
      { key: 'large_towels', label: 'Handtücher groß', perGuestKey: 'large_towels_per_guest' as const, perBookingKey: null },
      { key: 'pillow_cases', label: 'Kissenbezüge', perGuestKey: 'pillow_cases_per_guest' as const, perBookingKey: null },
      { key: 'sauna_towels', label: 'Saunatücher', perGuestKey: 'sauna_towels_per_guest' as const, perBookingKey: null },
      { key: 'small_towels', label: 'Handtücher klein', perGuestKey: 'small_towels_per_guest' as const, perBookingKey: null },
      { key: 'kitchen_towels', label: 'Küchentücher', perGuestKey: null, perBookingKey: 'kitchen_towels_per_booking' as const },
    ];

    const bookingsToConsider = selectedBookings.length > 0 
      ? upcomingBookings.filter(b => selectedBookings.includes(b.id))
      : upcomingBookings.slice(0, 8); // Consider next 8 bookings by default

    return categories.map(category => {
      const currentStock = house.linen_stock[category.key] || 0;
      const orderedStock = house.ordered_linen?.[category.key] || 0;
      const availableStock = currentStock + orderedStock;
      
      let totalDemand = 0;

      bookingsToConsider.forEach(booking => {
        if (category.perGuestKey && linenDef[category.perGuestKey]) {
          totalDemand += booking.number_of_guests * linenDef[category.perGuestKey];
        } else if (category.perBookingKey && linenDef[category.perBookingKey]) {
          totalDemand += linenDef[category.perBookingKey];
        }
      });

      const shortage = Math.max(0, totalDemand - availableStock);
      const availabilityPercent = totalDemand > 0 ? Math.round((availableStock / totalDemand) * 100) : 100;
      
      let status: LinenCategory['status'] = 'sufficient';
      if (shortage > 0) {
        status = 'critical';
      } else if (availabilityPercent < 100 && availabilityPercent >= 70) {
        status = 'low';
      }

      return {
        key: category.key,
        label: category.label,
        currentStock: availableStock,
        totalDemand,
        shortage,
        status,
        availabilityPercent: Math.min(100, availabilityPercent)
      };
    }).filter(cat => cat.totalDemand > 0);
  }, [linenDef, upcomingBookings, house?.linen_stock, house?.ordered_linen, selectedBookings]);

  // Calculate booking demand details
  const bookingDemands = useMemo((): BookingDemand[] => {
    if (!upcomingBookings || !linenDef) return [];

    return upcomingBookings.map(booking => {
      const checkIn = new Date(booking.check_in);
      const checkOut = new Date(booking.check_out);
      const days = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      
      // Calculate total linen items needed for this booking
      let totalLinenItems = 0;
      linenCategories.forEach(category => {
        if (category.key.includes('per_guest')) {
          totalLinenItems += booking.number_of_guests * (linenDef[`${category.key}_per_guest` as keyof typeof linenDef] || 0);
        } else {
          totalLinenItems += linenDef[`${category.key}_per_booking` as keyof typeof linenDef] || 0;
        }
      });

      return {
        id: booking.id,
        guestName: booking.guest_name,
        checkIn: booking.check_in,
        checkOut: booking.check_out,
        days,
        guests: booking.number_of_guests,
        bathrooms: house.bathrooms || 1,
        totalLinenItems
      };
    });
  }, [upcomingBookings, linenDef, linenCategories, house.bathrooms]);

  const criticalCategories = linenCategories.filter(cat => cat.status === 'critical');
  const lowCategories = linenCategories.filter(cat => cat.status === 'low');

  const getStatusColor = (status: LinenCategory['status']) => {
    switch (status) {
      case 'sufficient': return 'bg-green-100 text-green-800 border-green-200';
      case 'low': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status: LinenCategory['status']) => {
    switch (status) {
      case 'sufficient': return 'Ausreichend';
      case 'low': return 'Niedrig';
      case 'critical': return 'Kritisch';
      default: return 'Unbekannt';
    }
  };

  const getStatusIcon = (status: LinenCategory['status']) => {
    switch (status) {
      case 'sufficient': return <CheckCircle className="w-4 h-4" />;
      case 'low': return <AlertTriangle className="w-4 h-4" />;
      case 'critical': return <AlertTriangle className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const handleBookingSelection = (bookingId: string, checked: boolean) => {
    if (checked) {
      setSelectedBookings([...selectedBookings, bookingId]);
    } else {
      setSelectedBookings(selectedBookings.filter(id => id !== bookingId));
    }
  };

  const handleCreateOrder = () => {
    setShowOrderDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* Header with house info and actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Home className="w-6 h-6 text-primary" />
              <div>
                <CardTitle className="text-xl">{house.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{house.address}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleCreateOrder}
                disabled={criticalCategories.length === 0}
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Bestellen
              </Button>
              <Button 
                variant="outline"
                onClick={() => setIsEditMode(!isEditMode)}
              >
                <Edit className="w-4 h-4 mr-2" />
                Bearbeiten
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="inventar" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inventar">Inventar</TabsTrigger>
          <TabsTrigger value="wäscheset-regeln">Wäscheset-Regeln</TabsTrigger>
          <TabsTrigger value="bestellungen">Bestellungen</TabsTrigger>
        </TabsList>

        <TabsContent value="inventar" className="space-y-6">
          {/* Critical items alert */}
          {criticalCategories.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{criticalCategories.length} Wäschekategorien</strong> haben kritische Bestände. 
                Bestellung empfohlen!
              </AlertDescription>
            </Alert>
          )}

          {/* Linen categories grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {linenCategories.map((category) => (
              <Card key={category.key} className="relative">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-medium text-sm">{category.label}</h4>
                    <Badge 
                      variant="outline" 
                      className={`${getStatusColor(category.status)} text-xs`}
                    >
                      {getStatusIcon(category.status)}
                      <span className="ml-1">{getStatusText(category.status)}</span>
                    </Badge>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bestand:</span>
                      <span className="font-medium">{category.currentStock}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bedarf:</span>
                      <span className="font-medium">{category.totalDemand}</span>
                    </div>
                    {category.shortage > 0 && (
                      <div className="flex justify-between text-red-600 font-medium">
                        <span>↓ {category.shortage} fehlen</span>
                        <span>{Math.round((category.shortage / category.totalDemand) * 100)}% fehlt</span>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{category.availabilityPercent}% verfügbar</span>
                      <span>{Math.max(0, category.currentStock - category.totalDemand)} übrig</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          category.status === 'sufficient' ? 'bg-green-500' :
                          category.status === 'low' ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ 
                          width: `${category.availabilityPercent}%` 
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Upcoming bookings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Anstehende Buchungen ({upcomingBookings?.length || 0}) - {selectedBookings.length} ausgewählt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {bookingDemands.map((booking) => (
                  <div 
                    key={booking.id} 
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedBookings.includes(booking.id)}
                        onCheckedChange={(checked) => 
                          handleBookingSelection(booking.id, checked as boolean)
                        }
                      />
                      <div>
                        <div className="font-medium">{booking.guestName}</div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(booking.checkIn), 'dd.MM.yyyy', { locale: de })} - {' '}
                          {format(new Date(booking.checkOut), 'dd.MM.yyyy', { locale: de })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium">{booking.totalLinenItems} Teile</div>
                      <div className="text-muted-foreground">
                        {booking.days} Tage • {booking.guests} Gäste • {booking.bathrooms} Bäder
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wäscheset-regeln">
          <LinenSetRulesTab house={house} />
        </TabsContent>

        <TabsContent value="bestellungen">
          <LinenOrdersTab house={house} />
        </TabsContent>
      </Tabs>

      {showOrderDialog && (
        <LinenOrderDialog
          open={showOrderDialog}
          onOpenChange={setShowOrderDialog}
          orderItems={criticalCategories.reduce((acc, cat) => ({
            ...acc,
            [cat.key]: cat.shortage
          }), {})}
          houseName={house.name}
          selectedBooking={
            selectedBookings.length > 0 
              ? upcomingBookings?.find(b => b.id === selectedBookings[0])
              : upcomingBookings?.[0] // Fallback to first booking
          }
          onCreateOrder={(orderData) => {
            console.log('🚀 Creating order with hook:', orderData);
            
            createLinenOrderMutation.mutate({
              orderItems: orderData.orderItems,
              notes: orderData.notes,
              deliveryDate: orderData.deliveryDate,
              deliveryType: orderData.deliveryType
            });
            
            setShowOrderDialog(false);
          }}
          isCreating={createLinenOrderMutation.isPending}
        />
      )}
    </div>
  );
};

export default LinenInventoryDashboard;