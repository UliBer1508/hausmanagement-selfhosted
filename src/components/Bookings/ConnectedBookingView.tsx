import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import BookingCard from './BookingCard';
import ServiceTaskCard from './ServiceTaskCard';
import LaundryOrderCard from './LaundryOrderCard';
import ConnectionLine from './ConnectionLine';

const ConnectedBookingView = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [houseFilter, setHouseFilter] = useState('all');

  console.log('ConnectedBookingView rendering with filters:', { statusFilter, houseFilter, searchTerm });

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

  // Fetch laundry orders
  const { data: laundryOrders } = useQuery({
    queryKey: ['laundry-orders-connected'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('laundry_orders')
        .select(`
          *,
          laundry_order_items (
            id,
            item_name,
            item_type,
            quantity,
            status
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
    // Get laundry orders through service tasks
    const taskIds = bookingTasks.map(task => task.id);
    const bookingLaundry = laundryOrders?.filter(order => 
      taskIds.includes(order.service_task_id)
    ) || [];
    
    return { tasks: bookingTasks, laundry: bookingLaundry };
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
                      <ServiceTaskCard key={task.id} task={task} colorVariant={colorVariant} />
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
    </div>
  );
};

export default ConnectedBookingView;