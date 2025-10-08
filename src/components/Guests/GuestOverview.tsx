import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import GuestStats from './GuestStats';
import GuestList from './GuestList';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


const GuestOverview = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [houseFilter, setHouseFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Fetch houses for filter
  const { data: houses } = useQuery({
    queryKey: ['houses'],
    queryFn: async () => {
      const { data } = await supabase.from('houses').select('id, name');
      return data || [];
    },
  });

  // Fetch guest data with aggregated information
  const { data: guestData, isLoading } = useQuery({
    queryKey: ['guest-overview', searchTerm, statusFilter, houseFilter, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select(`
          id,
          guest_name,
          guest_email,
          guest_phone,
          booking_amount,
          check_in,
          check_out,
          status,
          nationality,
          houses!inner(id, name, address)
        `)
        .not('guest_name', 'is', null);

      if (searchTerm) {
        query = query.or(`guest_name.ilike.%${searchTerm}%,guest_email.ilike.%${searchTerm}%,guest_phone.ilike.%${searchTerm}%`);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as 'confirmed' | 'cancelled' | 'completed');
      }

      if (houseFilter !== 'all') {
        query = query.eq('house_id', houseFilter);
      }

      const { data } = await query.order('check_in', { ascending: false });

      if (!data) return [];

      // Group by guest and aggregate data
      const guestMap = new Map();
      
      data.forEach(booking => {
        const guestKey = `${booking.guest_name}-${booking.guest_email || ''}-${booking.guest_phone || ''}`;
        
        if (!guestMap.has(guestKey)) {
          guestMap.set(guestKey, {
            guest_name: booking.guest_name,
            guest_email: booking.guest_email,
            guest_phone: booking.guest_phone,
            nationality: booking.nationality,
            bookings: [],
            total_revenue: 0,
            last_booking: null,
            next_booking: null,
            stay_count: 0,
            category: 'new', // will be determined later
          });
        }

        const guest = guestMap.get(guestKey);
        guest.bookings.push(booking);
        guest.total_revenue += booking.booking_amount || 0;
        guest.stay_count += 1;

        // Determine last and next bookings
        const bookingDate = new Date(booking.check_in);
        const now = new Date();

        if (bookingDate <= now) {
          if (!guest.last_booking || new Date(booking.check_in) > new Date(guest.last_booking.check_in)) {
            guest.last_booking = booking;
          }
        } else {
          if (!guest.next_booking || new Date(booking.check_in) < new Date(guest.next_booking.check_in)) {
            guest.next_booking = booking;
          }
        }

        // Determine category
        if (guest.stay_count > 1) {
          guest.category = 'returning';
        }
      });

      let guests = Array.from(guestMap.values());

      // Apply category filter
      if (categoryFilter !== 'all') {
        guests = guests.filter(guest => {
          if (categoryFilter === 'new') return guest.category === 'new';
          if (categoryFilter === 'returning') return guest.category === 'returning';
          return true;
        });
      }

      return guests;
    },
  });

  return (
    <div className="space-y-6">
      <GuestStats />
      
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Filter & Suche</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <span className="absolute left-3 top-3 text-lg">🔍</span>
            <Input
              placeholder="Name, E-Mail oder Telefon..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger>
              <span className="mr-2">👥</span>
              <SelectValue placeholder="Kategorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kategorien</SelectItem>
              <SelectItem value="new">Neue Gäste</SelectItem>
              <SelectItem value="returning">Stammgäste</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <span className="mr-2">✓</span>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="confirmed">Bestätigt</SelectItem>
              <SelectItem value="cancelled">Storniert</SelectItem>
              <SelectItem value="completed">Abgeschlossen</SelectItem>
            </SelectContent>
          </Select>

          <Select value={houseFilter} onValueChange={setHouseFilter}>
            <SelectTrigger>
              <span className="mr-2">🏠</span>
              <SelectValue placeholder="Haus" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Häuser</SelectItem>
              {houses?.map((house) => (
                <SelectItem key={house.id} value={house.id}>
                  {house.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <GuestList 
        guests={guestData || []} 
        isLoading={isLoading}
      />
    </div>
  );
};

export default GuestOverview;