import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search } from 'lucide-react';
import HouseCard from './HouseCard';
import CreateHouseDialog from './CreateHouseDialog';
import ScrapePricesDialog from './CompetitorAnalysis/ScrapePricesDialog';

const HouseManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Fetch houses data
  const { data: housesData, isLoading: housesLoading } = useQuery({
    queryKey: ['houses-management'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('*, linen_set_definitions!linen_set_definitions_house_id_fkey(*)')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch inventory counts per house
  const { data: inventoryData } = useQuery({
    queryKey: ['house-inventory-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('house_inventory')
        .select('house_id, category, quantity');
      
      if (error) throw error;
      return data;
    },
  });

  // Process inventory data to get counts per house
  const inventoryCounts = useMemo(() => {
    if (!inventoryData) return {};
    
    const counts: Record<string, { total: number; categories: Record<string, number> }> = {};
    
    inventoryData.forEach((item) => {
      if (!counts[item.house_id]) {
        counts[item.house_id] = { total: 0, categories: {} };
      }
      counts[item.house_id].total += item.quantity;
      counts[item.house_id].categories[item.category] = 
        (counts[item.house_id].categories[item.category] || 0) + item.quantity;
    });
    
    return counts;
  }, [inventoryData]);

  // Filter houses based on search term
  const filteredHouses = useMemo(() => {
    if (!housesData) return [];
    
    const searchLower = searchTerm.toLowerCase();
    return housesData.filter(house => 
      house.name.toLowerCase().includes(searchLower) ||
      house.address?.toLowerCase().includes(searchLower)
    );
  }, [housesData, searchTerm]);

  if (housesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Ferienhäuser und Mietobjekte</h1>
          <p className="text-muted-foreground mt-2">
            Verwalten Sie Ihre Immobilien und deren Inventar
          </p>
        </div>
        <div className="flex gap-2">
          <ScrapePricesDialog />
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Haus hinzufügen
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Häuser durchsuchen..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Houses Grid */}
      {filteredHouses.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {searchTerm ? 'Keine Häuser gefunden' : 'Noch keine Häuser vorhanden'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredHouses.map((house) => (
            <HouseCard
              key={house.id}
              house={house}
              inventoryCount={inventoryCounts[house.id] || { total: 0, categories: {} }}
            />
          ))}
        </div>
      )}

      {/* Create House Dialog */}
      <CreateHouseDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
};

export default HouseManagement;
