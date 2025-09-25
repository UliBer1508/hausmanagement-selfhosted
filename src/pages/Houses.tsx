import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Home } from 'lucide-react';
import HouseCard from '@/components/Houses/HouseCard';
import CreateHouseDialog from '@/components/Houses/CreateHouseDialog';

const Houses = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Fetch houses with all related data
  const { data: housesData, isLoading } = useQuery({
    queryKey: ['houses-full'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select(`
          *,
          linen_set_definitions (
            *
          )
        `)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch inventory counts per house
  const { data: inventoryCounts } = useQuery({
    queryKey: ['house-inventory-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('house_inventory')
        .select('house_id, category, quantity')
        .order('house_id');
      
      if (error) throw error;
      
      // Group by house_id and count items
      const counts = data.reduce((acc: any, item: any) => {
        if (!acc[item.house_id]) {
          acc[item.house_id] = { total: 0, categories: {} };
        }
        acc[item.house_id].total += item.quantity || 0;
        acc[item.house_id].categories[item.category] = 
          (acc[item.house_id].categories[item.category] || 0) + (item.quantity || 0);
        return acc;
      }, {});
      
      return counts;
    },
  });

  const filteredHouses = housesData?.filter(house =>
    house.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    house.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Häuser werden geladen...</p>
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
            <Home className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Häuser verwalten</h1>
          </div>
          <p className="text-muted-foreground">
            Verwalten Sie Ihre Ferienhäuser und Wäschebestände
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Neues Haus
        </Button>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Nach Name oder Adresse suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Houses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredHouses?.map((house) => (
          <HouseCard
            key={house.id}
            house={house}
            inventoryCount={inventoryCounts?.[house.id] || { total: 0, categories: {} }}
          />
        )) || (
          <div className="col-span-full text-center py-8">
            <p className="text-muted-foreground">Keine Häuser gefunden</p>
          </div>
        )}
      </div>

      {/* Create House Dialog */}
      <CreateHouseDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
};

export default Houses;