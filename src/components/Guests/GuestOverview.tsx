import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import GuestStats from './GuestStats';
import GuestList from './GuestList';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGuests } from '@/hooks/useGuests';

const fetchTouristHouses = async () => {
  const { data, error } = await supabase
    .from('houses')
    .select('id, name')
    .eq('rental_type', 'tourist')
    .order('name');
  if (error) throw error;
  return data || [];
};

const GuestOverview = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [houseFilter, setHouseFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'booking' | 'name'>('booking');

  const { data: houses } = useQuery({
    queryKey: ['houses-tourist-dropdown'],
    queryFn: fetchTouristHouses,
  });

  // Use the new useGuests hook that reads from guests table
  const { data: guestData, isLoading } = useGuests({
    searchTerm: searchTerm || undefined,
    statusFilter: statusFilter !== 'all' ? statusFilter : undefined,
    houseFilter: houseFilter !== 'all' ? houseFilter : undefined,
    categoryFilter: categoryFilter !== 'all' ? categoryFilter : undefined,
    sortBy,
  });

  return (
    <div className="space-y-6">
      <GuestStats />
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Filter & Suche</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
              {houses?.map((h) => (
                <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'booking' | 'name')}>
            <SelectTrigger>
              <span className="mr-2">🔄</span>
              <SelectValue placeholder="Sortierung" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="booking">Nach Buchungsdatum</SelectItem>
              <SelectItem value="name">Nach Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <GuestList guests={guestData || []} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default GuestOverview;
