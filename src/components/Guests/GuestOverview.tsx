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
  const [sortBy, setSortBy] = useState<'booking' | 'name'>('booking');

  const housesQuery: any = useQuery({
    queryKey: ['houses-tourist-dropdown'] as const,
    queryFn: async () => {
      const { data, error }: any = await supabase.from('houses').select('id, name').eq('rental_type', 'tourist').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const guestDataQuery: any = useQuery({
    queryKey: ['guests-tourist-list', searchTerm, statusFilter, houseFilter, categoryFilter, sortBy] as const,
    queryFn: async () => {
      let queryBuilder: any = supabase.from('bookings').select('id, guest_name, guest_email, guest_phone, booking_amount, check_in, check_out, status, nationality, houses!inner(id, name, address, rental_type)').eq('houses.rental_type', 'tourist').not('guest_name', 'is', null);
      if (searchTerm) queryBuilder = queryBuilder.or(`guest_name.ilike.%${searchTerm}%,guest_email.ilike.%${searchTerm}%,guest_phone.ilike.%${searchTerm}%`);
      if (statusFilter !== 'all') queryBuilder = queryBuilder.eq('status', statusFilter);
      if (houseFilter !== 'all') queryBuilder = queryBuilder.eq('house_id', houseFilter);
      const response = await queryBuilder.order('check_in', { ascending: false });
      if (!response.data) return [];
      const guestMap = new Map();
      response.data.forEach((booking: any) => {
        const guestKey = `${booking.guest_name}-${booking.guest_email || ''}-${booking.guest_phone || ''}`;
        if (!guestMap.has(guestKey)) {
          guestMap.set(guestKey, { guest_name: booking.guest_name, guest_email: booking.guest_email, guest_phone: booking.guest_phone, nationality: booking.nationality, bookings: [], total_revenue: 0, last_booking: null, next_booking: null, stay_count: 0, active_booking_count: 0, category: 'new' });
        }
        const guest = guestMap.get(guestKey);
        guest.bookings.push(booking);
        guest.stay_count += 1;
        if (booking.status !== 'cancelled') {
          guest.total_revenue += booking.booking_amount || 0;
          guest.active_booking_count += 1;
        }
        const bookingDate = new Date(booking.check_in);
        const now = new Date();
        if (booking.status !== 'cancelled') {
          if (bookingDate <= now) {
            if (!guest.last_booking || new Date(booking.check_in) > new Date(guest.last_booking.check_in)) guest.last_booking = booking;
          } else {
            if (!guest.next_booking || new Date(booking.check_in) < new Date(guest.next_booking.check_in)) guest.next_booking = booking;
          }
        }
        if (guest.active_booking_count > 1) guest.category = 'returning';
      });
      let guests = Array.from(guestMap.values());
      if (categoryFilter !== 'all') guests = guests.filter(guest => guest.category === categoryFilter);
      if (sortBy === 'name') {
        guests.sort((a: any, b: any) => a.guest_name.localeCompare(b.guest_name));
      } else {
        guests.sort((a: any, b: any) => {
          const hasNextA = !!a.next_booking, hasNextB = !!b.next_booking;
          if (hasNextA && hasNextB) return new Date(a.next_booking.check_in).getTime() - new Date(b.next_booking.check_in).getTime();
          if (hasNextA && !hasNextB) return -1;
          if (!hasNextA && hasNextB) return 1;
          const lastA = a.last_booking?.check_in, lastB = b.last_booking?.check_in;
          if (!lastA && !lastB) return 0;
          if (!lastA) return 1;
          if (!lastB) return -1;
          return new Date(lastB).getTime() - new Date(lastA).getTime();
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative"><span className="absolute left-3 top-3 text-lg">🔍</span><Input placeholder="Name, E-Mail oder Telefon..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" /></div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger><span className="mr-2">👥</span><SelectValue placeholder="Kategorie" /></SelectTrigger><SelectContent><SelectItem value="all">Alle Kategorien</SelectItem><SelectItem value="new">Neue Gäste</SelectItem><SelectItem value="returning">Stammgäste</SelectItem></SelectContent></Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><span className="mr-2">✓</span><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Alle Status</SelectItem><SelectItem value="confirmed">Bestätigt</SelectItem><SelectItem value="cancelled">Storniert</SelectItem><SelectItem value="completed">Abgeschlossen</SelectItem></SelectContent></Select>
          <Select value={houseFilter} onValueChange={setHouseFilter}><SelectTrigger><span className="mr-2">🏠</span><SelectValue placeholder="Haus" /></SelectTrigger><SelectContent><SelectItem value="all">Alle Häuser</SelectItem>{housesQuery.data?.map((house: any) => (<SelectItem key={house.id} value={house.id}>{house.name}</SelectItem>))}</SelectContent></Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'booking' | 'name')}><SelectTrigger><span className="mr-2">🔄</span><SelectValue placeholder="Sortierung" /></SelectTrigger><SelectContent><SelectItem value="booking">Nach Buchungsdatum</SelectItem><SelectItem value="name">Nach Name</SelectItem></SelectContent></Select>
        </div>
        <GuestList guests={guestDataQuery.data || []} isLoading={guestDataQuery.isLoading} />
      </div>
    </div>
  );
};

export default GuestOverview;
