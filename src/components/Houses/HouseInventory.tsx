import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Package, Edit, Trash2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface HouseInventoryProps {
  house: any;
}

const HouseInventory = ({ house }: HouseInventoryProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'kitchen',
    quantity: 1,
    expected_quantity: 1,
    location: '',
    condition: 'good'
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch inventory items for this house
  const { data: inventoryItems, isLoading } = useQuery({
    queryKey: ['house-inventory', house?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('house_inventory')
        .select('*')
        .eq('house_id', house.id)
        .order('category')
        .order('name');
      
      if (error) throw error;
      return data;
    },
    enabled: !!house?.id,
  });

  // Add new inventory item
  const addItemMutation = useMutation({
    mutationFn: async (item: typeof newItem) => {
      const { error } = await supabase
        .from('house_inventory')
        .insert([{
          ...item,
          house_id: house.id
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['house-inventory', house.id] });
      queryClient.invalidateQueries({ queryKey: ['house-inventory-counts'] });
      toast({
        title: "Inventar-Gegenstand hinzugefügt",
        description: "Der neue Gegenstand wurde erfolgreich hinzugefügt.",
      });
      setIsAddDialogOpen(false);
      setNewItem({
        name: '',
        category: 'kitchen',
        quantity: 1,
        expected_quantity: 1,
        location: '',
        condition: 'good'
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Der Gegenstand konnte nicht hinzugefügt werden.",
        variant: "destructive",
      });
      console.error('Error adding inventory item:', error);
    },
  });

  // Update inventory item
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from('house_inventory')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['house-inventory', house.id] });
      queryClient.invalidateQueries({ queryKey: ['house-inventory-counts'] });
      toast({
        title: "Inventar aktualisiert",
        description: "Die Änderungen wurden erfolgreich gespeichert.",
      });
      setEditingItem(null);
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Der Gegenstand konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
      console.error('Error updating inventory item:', error);
    },
  });

  // Delete inventory item
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('house_inventory')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['house-inventory', house.id] });
      queryClient.invalidateQueries({ queryKey: ['house-inventory-counts'] });
      toast({
        title: "Inventar-Gegenstand gelöscht",
        description: "Der Gegenstand wurde erfolgreich entfernt.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Der Gegenstand konnte nicht gelöscht werden.",
        variant: "destructive",
      });
      console.error('Error deleting inventory item:', error);
    },
  });

  const categories = ['kitchen', 'bathroom', 'bedroom', 'living_room', 'outdoor', 'cleaning', 'other'];
  const conditions = ['good', 'fair', 'poor', 'broken'];

  const filteredItems = inventoryItems?.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.location?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'good': return 'bg-green-100 text-green-800';
      case 'fair': return 'bg-yellow-100 text-yellow-800';
      case 'poor': return 'bg-orange-100 text-orange-800';
      case 'broken': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Inventar ({filteredItems?.length || 0} Gegenstände)</h3>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Gegenstand hinzufügen
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neuen Gegenstand hinzufügen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="item-name">Name *</Label>
                <Input
                  id="item-name"
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  placeholder="z.B. Schöpflöffel"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="item-category">Kategorie</Label>
                  <Select value={newItem.category} onValueChange={(value) => setNewItem({ ...newItem, category: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>
                          {cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="item-condition">Zustand</Label>
                  <Select value={newItem.condition} onValueChange={(value) => setNewItem({ ...newItem, condition: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {conditions.map(condition => (
                        <SelectItem key={condition} value={condition}>
                          {condition.charAt(0).toUpperCase() + condition.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="item-quantity">Anzahl</Label>
                  <Input
                    id="item-quantity"
                    type="number"
                    min="0"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="item-expected">Soll-Anzahl</Label>
                  <Input
                    id="item-expected"
                    type="number"
                    min="0"
                    value={newItem.expected_quantity}
                    onChange={(e) => setNewItem({ ...newItem, expected_quantity: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-location">Standort</Label>
                <Input
                  id="item-location"
                  value={newItem.location}
                  onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                  placeholder="z.B. Küche, Schrank links"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button
                  onClick={() => addItemMutation.mutate(newItem)}
                  disabled={!newItem.name.trim() || addItemMutation.isPending}
                >
                  {addItemMutation.isPending ? 'Hinzufügen...' : 'Hinzufügen'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Nach Name oder Standort suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Kategorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kategorien</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Items */}
      <div className="space-y-3">
        {filteredItems?.map((item) => (
          <Card key={item.id}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium">{item.name}</h4>
                    <Badge variant="outline">
                      {item.category.charAt(0).toUpperCase() + item.category.slice(1).replace('_', ' ')}
                    </Badge>
                    <Badge className={getConditionColor(item.condition)}>
                      {item.condition.charAt(0).toUpperCase() + item.condition.slice(1)}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <span>Anzahl: {item.quantity} / {item.expected_quantity}</span>
                    {item.location && <span>Standort: {item.location}</span>}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingItem(item)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteItemMutation.mutate(item.id)}
                    disabled={deleteItemMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )) || (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Keine Inventar-Gegenstände gefunden</p>
          </div>
        )}
      </div>

      {/* Edit Item Dialog */}
      {editingItem && (
        <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gegenstand bearbeiten</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Anzahl</Label>
                  <Input
                    type="number"
                    min="0"
                    value={editingItem.quantity}
                    onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 0 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Zustand</Label>
                  <Select value={editingItem.condition} onValueChange={(value) => setEditingItem({ ...editingItem, condition: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {conditions.map(condition => (
                        <SelectItem key={condition} value={condition}>
                          {condition.charAt(0).toUpperCase() + condition.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingItem(null)}>
                  Abbrechen
                </Button>
                <Button
                  onClick={() => updateItemMutation.mutate({ id: editingItem.id, updates: editingItem })}
                  disabled={updateItemMutation.isPending}
                >
                  {updateItemMutation.isPending ? 'Speichern...' : 'Speichern'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default HouseInventory;