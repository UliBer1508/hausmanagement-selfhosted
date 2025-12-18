import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import LaundryOrderCard from '@/components/Bookings/LaundryOrderCard';
import { useToast } from '@/hooks/use-toast';
import { useExternalSync } from '@/hooks/useExternalSync';
import { getGuestName } from '@/lib/guestHelpers';

interface LinenOrdersListProps {
  onEditOrder?: (order: any) => void;
  onDeleteOrder?: (order: any) => Promise<void>;
}

const LinenOrdersList = ({ onEditOrder, onDeleteOrder }: LinenOrdersListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [houseFilter, setHouseFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);
  const hasInitializedFilter = useRef(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { syncOrder, resetSync, isEnabled: externalSyncEnabled } = useExternalSync();

  // Fetch linen orders with related data (only tourist rentals)
  const { data: linenOrders, isLoading } = useQuery({
    queryKey: ['linen-orders-list', 'tourist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          *,
          houses!inner (
            id,
            name,
            address,
            rental_type
          ),
          bookings (
            id,
            guest_name,
            guest_email,
            check_in,
            check_out,
            number_of_guests,
            guest_id,
            guests (*)
          )
        `)
        .eq('houses.rental_type', 'tourist')
        .order('delivery_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Dynamischer Default: Wenn offene Bestellungen existieren → Filter auf 'offen'
  useEffect(() => {
    if (!hasInitializedFilter.current && linenOrders && linenOrders.length > 0) {
      const hasOpenOrders = linenOrders.some(order => order.status === 'offen');
      if (hasOpenOrders) {
        setStatusFilter('offen');
      }
      hasInitializedFilter.current = true;
    }
  }, [linenOrders]);

  // Fetch houses for filter
  const { data: houses } = useQuery({
    queryKey: ['houses-filter', 'tourist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name')
        .eq('rental_type', 'tourist')
        .order('name');
      
      if (error) throw error;
      return data || [];
    },
  });

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

  // Filter orders
  const filteredOrders = linenOrders?.filter(order => {
    const guestNameFromBooking = order.bookings ? getGuestName(order.bookings) : '';
    const matchesSearch = 
      guestNameFromBooking.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.houses?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesHouse = houseFilter === 'all' || order.house_id === houseFilter;

    // Zeitfilter-Logik (vorausschauend)
    let matchesTime = true;
    if (timeFilter !== 'all' && order.delivery_date) {
      const deliveryDate = new Date(order.delivery_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const futureDate = new Date();
      
      switch (timeFilter) {
        case '1':
          futureDate.setMonth(today.getMonth() + 1);
          break;
        case '3':
          futureDate.setMonth(today.getMonth() + 3);
          break;
        case '6':
          futureDate.setMonth(today.getMonth() + 6);
          break;
        case '12':
          futureDate.setMonth(today.getMonth() + 12);
          break;
      }
      
      matchesTime = deliveryDate >= today && deliveryDate <= futureDate;
    }

    return matchesSearch && matchesStatus && matchesHouse && matchesTime;
  }) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Bestellungen werden geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Gast, Haus oder Notizen durchsuchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status filtern" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="offen">📝 Offen</SelectItem>
                <SelectItem value="pending">⏳ Ausstehend</SelectItem>
                <SelectItem value="in_progress">🔄 In Bearbeitung</SelectItem>
                <SelectItem value="completed">✅ Abgeschlossen</SelectItem>
                <SelectItem value="delivered">📦 Geliefert</SelectItem>
                <SelectItem value="cancelled">❌ Storniert</SelectItem>
              </SelectContent>
            </Select>

            {/* House Filter */}
            <Select value={houseFilter} onValueChange={setHouseFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Haus filtern" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Häuser</SelectItem>
                {houses?.map(house => (
                  <SelectItem key={house.id} value={house.id}>
                    {house.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Time Filter */}
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Zeitraum filtern" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Zeiträume</SelectItem>
                <SelectItem value="1">📅 Nächster Monat</SelectItem>
                <SelectItem value="3">📅 Nächste 3 Monate</SelectItem>
                <SelectItem value="6">📅 Nächste 6 Monate</SelectItem>
                <SelectItem value="12">📅 Nächstes Jahr</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <span className="text-5xl block mb-4">📦</span>
            <h3 className="text-lg font-medium mb-2">Keine Bestellungen gefunden</h3>
            <p className="text-muted-foreground">
              {searchTerm || statusFilter !== 'all' || houseFilter !== 'all' || timeFilter !== 'all'
                ? 'Versuchen Sie andere Filter.'
                : 'Erstellen Sie Ihre erste Wäschebestellung.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <LaundryOrderCard
              key={order.id}
              order={order}
              colorVariant="purple"
              onEdit={onEditOrder}
              onDelete={onDeleteOrder}
              onConfirm={(order) => confirmOrderMutation.mutate(order.id)}
              onSync={async (order) => {
                setSyncingOrderId(order.id);
                try {
                  const result = await syncOrder(order.id);
                  if (result.success) {
                    queryClient.invalidateQueries({ queryKey: ['linen-orders-list'] });
                  }
                } finally {
                  setSyncingOrderId(null);
                }
              }}
              onResetSync={async (order) => {
                const success = await resetSync(order.id);
                if (success) {
                  queryClient.invalidateQueries({ queryKey: ['linen-orders-list'] });
                }
              }}
              isSyncing={syncingOrderId === order.id}
              externalSyncEnabled={externalSyncEnabled}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default LinenOrdersList;
