import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Save, Package, Shirt } from 'lucide-react';

interface LinenInventoryProps {
  house: any;
}

const LinenInventory = ({ house }: LinenInventoryProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Current linen stock
  const [linenStock, setLinenStock] = useState(house?.linen_stock || {});
  
  // Linen requirements per guest/booking
  const [linenRequirements, setLinenRequirements] = useState(
    house?.linen_set_definitions?.[0] || {}
  );

  // Fetch linen set definitions for this house
  const { data: linenDefs } = useQuery({
    queryKey: ['linen-definitions', house?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', house.id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!house?.id,
  });

  // Update linen stock
  const updateLinenStockMutation = useMutation({
    mutationFn: async (newStock: any) => {
      const { error } = await supabase
        .from('houses')
        .update({ linen_stock: newStock })
        .eq('id', house.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['houses-full'] });
      toast({
        title: "Wäschebestand aktualisiert",
        description: "Die Änderungen wurden erfolgreich gespeichert.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Der Wäschebestand konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
      console.error('Error updating linen stock:', error);
    },
  });

  // Update linen requirements
  const updateLinenRequirementsMutation = useMutation({
    mutationFn: async (requirements: any) => {
      const { error } = await supabase
        .from('linen_set_definitions')
        .upsert({
          house_id: house.id,
          ...requirements,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linen-definitions', house.id] });
      toast({
        title: "Wäsche-Definitionen aktualisiert",
        description: "Die Änderungen wurden erfolgreich gespeichert.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Die Wäsche-Definitionen konnten nicht aktualisiert werden.",
        variant: "destructive",
      });
      console.error('Error updating linen requirements:', error);
    },
  });

  const linenItems = [
    { key: 'bedding', label: 'Bettwäsche', icon: '🛏️' },
    { key: 'large_towels', label: 'Handtücher groß', icon: '🏊‍♂️' },
    { key: 'small_towels', label: 'Handtücher klein', icon: '🚿' },
    { key: 'sauna_towels', label: 'Saunatücher', icon: '🧖‍♀️' },
    { key: 'bath_mats', label: 'Badematten', icon: '🛁' },
    { key: 'sink_towels', label: 'WB-Handtücher', icon: '🚰' },
    { key: 'kitchen_towels', label: 'Küchentücher', icon: '🍽️' },
    { key: 'blankets', label: 'Decken', icon: '🛋️' },
    { key: 'pillow_cases', label: 'Kissenbezüge', icon: '😴' },
  ];

  const requirementItems = [
    { key: 'bedding_per_guest', label: 'Bettwäsche pro Gast' },
    { key: 'large_towels_per_guest', label: 'Handtücher groß pro Gast' },
    { key: 'small_towels_per_guest', label: 'Handtücher klein pro Gast' },
    { key: 'sauna_towels_per_guest', label: 'Saunatücher pro Gast' },
    { key: 'bath_mats_per_booking', label: 'Badematten pro Buchung' },
    { key: 'sink_towels_per_booking', label: 'WB-Handtücher pro Buchung' },
    { key: 'kitchen_towels_per_booking', label: 'Küchentücher pro Buchung' },
    { key: 'blankets_per_guest', label: 'Decken pro Gast' },
    { key: 'pillow_cases_per_guest', label: 'Kissenbezüge pro Gast' },
  ];

  return (
    <div className="space-y-6">
      {/* Current Stock */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Aktueller Wäschebestand
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {linenItems.map((item) => (
              <div key={item.key} className="space-y-2">
                <Label htmlFor={`stock-${item.key}`} className="flex items-center gap-2">
                  <span>{item.icon}</span>
                  {item.label}
                </Label>
                <Input
                  id={`stock-${item.key}`}
                  type="number"
                  min="0"
                  value={linenStock[item.key] || 0}
                  onChange={(e) => setLinenStock({
                    ...linenStock,
                    [item.key]: parseInt(e.target.value) || 0
                  })}
                />
              </div>
            ))}
          </div>
          
          <Button
            onClick={() => updateLinenStockMutation.mutate(linenStock)}
            disabled={updateLinenStockMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {updateLinenStockMutation.isPending ? 'Speichern...' : 'Bestand speichern'}
          </Button>
        </CardContent>
      </Card>

      {/* Linen Requirements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shirt className="w-5 h-5" />
            Wäsche-Definitionen
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Definieren Sie, wieviel Wäsche pro Gast bzw. pro Buchung benötigt wird.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {requirementItems.map((item) => (
              <div key={item.key} className="space-y-2">
                <Label htmlFor={`req-${item.key}`}>
                  {item.label}
                </Label>
                <Input
                  id={`req-${item.key}`}
                  type="number"
                  min="0"
                  value={linenRequirements[item.key] || 0}
                  onChange={(e) => setLinenRequirements({
                    ...linenRequirements,
                    [item.key]: parseInt(e.target.value) || 0
                  })}
                />
              </div>
            ))}
          </div>
          
          <Button
            onClick={() => updateLinenRequirementsMutation.mutate(linenRequirements)}
            disabled={updateLinenRequirementsMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {updateLinenRequirementsMutation.isPending ? 'Speichern...' : 'Definitionen speichern'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default LinenInventory;