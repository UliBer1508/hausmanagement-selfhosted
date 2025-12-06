import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Save, RotateCcw, Plus, Trash2, Info } from 'lucide-react';
import { LinenItemConfig, ItemColor, ITEM_COLORS } from '@/types/linen';
import { migrateOldToNewStructure, groupByCategory } from '@/lib/linenMigration';
import { LinenItemDialog } from './LinenItemDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface LinenSetRulesTabProps {
  house: any;
}

const LinenSetRulesTab = ({ house }: LinenSetRulesTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Record<string, LinenItemConfig>>({});
  const [originalItems, setOriginalItems] = useState<Record<string, LinenItemConfig>>({});
  const [selectedColor, setSelectedColor] = useState<string>(house?.default_linen_color || 'white_striped');
  const [originalColor, setOriginalColor] = useState<string>(house?.default_linen_color || 'white_striped');
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [hasMigrated, setHasMigrated] = useState(false);

  // Fetch current linen set definitions
  const { data: linenDef, isLoading } = useQuery({
    queryKey: ['linen-definitions', house?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', house.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!house?.id,
  });

  // Migrate old structure to new on first load
  useEffect(() => {
    if (linenDef && !hasMigrated) {
      const migratedItems = migrateOldToNewStructure(linenDef);
      setItems(migratedItems);
      setOriginalItems(JSON.parse(JSON.stringify(migratedItems)));
      setHasMigrated(true);
    }
  }, [linenDef, hasMigrated]);

  // Check for changes (items + color)
  useEffect(() => {
    const itemsChanged = JSON.stringify(items) !== JSON.stringify(originalItems);
    const colorChanged = selectedColor !== originalColor;
    setHasChanges(itemsChanged || colorChanged);
  }, [items, originalItems, selectedColor, originalColor]);

  // Group items by category
  const groupedItems = useMemo(() => groupByCategory(items), [items]);

  // Update item
  const updateItem = (key: string, updates: Partial<LinenItemConfig>) => {
    setItems(prev => ({
      ...prev,
      [key]: { ...prev[key], ...updates }
    }));
  };

  // Add new item
  const handleAddItem = (newItem: LinenItemConfig) => {
    setItems(prev => ({
      ...prev,
      [newItem.key]: newItem
    }));
  };

  // Delete item
  const handleDelete = (key: string) => {
    const { [key]: removed, ...rest } = items;
    setItems(rest);
    setDeleteKey(null);
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Save linen rules to linen_set_definitions
      const updateData = {
        house_id: house.id,
        custom_categories: items as any,
        // Set old columns to 0 for backward compatibility
        bedding_per_guest: 0,
        large_towels_per_guest: 0,
        small_towels_per_guest: 0,
        sauna_towels_per_guest: 0,
        blankets_per_guest: 0,
        pillow_cases_per_guest: 0,
        bath_mats_per_booking: 0,
        sink_towels_per_booking: 0,
        kitchen_towels_per_booking: 0,
        table_linens_per_booking: 0
      };

      const { data: existing } = await supabase
        .from('linen_set_definitions')
        .select('id')
        .eq('house_id', house.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('linen_set_definitions')
          .update(updateData)
          .eq('house_id', house.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('linen_set_definitions')
          .insert(updateData);
        if (error) throw error;
      }

      // 2. Save default_linen_color to houses table
      const { error: houseError } = await supabase
        .from('houses')
        .update({ default_linen_color: selectedColor })
        .eq('id', house.id);
      if (houseError) throw houseError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linen-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['houses'] });
      setOriginalItems(JSON.parse(JSON.stringify(items)));
      setOriginalColor(selectedColor);
      setHasChanges(false);
      toast({
        title: "✅ Gespeichert",
        description: "Wäscheset-Regeln und Standardfarbe wurden aktualisiert",
      });
    },
    onError: (error) => {
      toast({
        title: "❌ Fehler",
        description: "Regeln konnten nicht gespeichert werden",
        variant: "destructive",
      });
      console.error('Save error:', error);
    }
  });

  const handleReset = () => {
    setItems(JSON.parse(JSON.stringify(originalItems)));
    setSelectedColor(originalColor);
    setHasChanges(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Lade Wäscheset-Regeln...</div>
      </div>
    );
  }

  const categoryIcons = {
    'Schlafbereich': '🛏️',
    'Badbereich': '🛁',
    'Wellness': '🧖',
    'Küchenbereich': '🍴'
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Wäscheset-Regeln für {house.name}</CardTitle>
              <CardDescription>
                Definieren Sie, wie viel Wäsche pro Gast oder pro Buchung benötigt wird
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowAddDialog(true)} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Neues Item
              </Button>
              {hasChanges && (
                <>
                  <Button onClick={handleReset} variant="outline" size="sm">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Zurücksetzen
                  </Button>
                  <Button onClick={() => saveMutation.mutate()} size="sm">
                    <Save className="w-4 h-4 mr-2" />
                    Speichern
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Standard-Wäschefarbe Auswahl */}
          <div className="mb-6 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🎨</span>
              <Label className="text-base font-semibold">Standard-Wäschefarbe</Label>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Diese Farbe wird bei neuen Wäschebestellungen automatisch vorausgewählt.
            </p>
            <RadioGroup
              value={selectedColor}
              onValueChange={setSelectedColor}
              className="flex flex-wrap gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="grey_striped" id="grey_striped" />
                <Label htmlFor="grey_striped" className="cursor-pointer">🔲 Grau gestreift</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="white_striped" id="white_striped" />
                <Label htmlFor="white_striped" className="cursor-pointer">⬜ Weiß gestreift</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="colorful" id="colorful" />
                <Label htmlFor="colorful" className="cursor-pointer">🌈 Bunt</Label>
              </div>
            </RadioGroup>
          </div>

          <Alert className="mb-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Die Tabelle ist immer editierbar. Änderungen werden mit <strong>Speichern</strong> übernommen.
              Bei "saisonal" werden Winter (Okt-Apr) und Sommer (Mai-Sep) berücksichtigt.
            </AlertDescription>
          </Alert>

          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            categoryItems.length > 0 && (
              <div key={category} className="mb-8">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span>{categoryIcons[category as keyof typeof categoryIcons]}</span>
                  {category}
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Wäsche</TableHead>
                        <TableHead className="w-[100px]">Anzahl</TableHead>
                        <TableHead className="w-[150px]">Berechnung</TableHead>
                        <TableHead className="w-[150px]">Verfügbarkeit</TableHead>
                        {category === 'Badbereich' && (
                          <TableHead className="w-[100px]">Farbe</TableHead>
                        )}
                        <TableHead className="w-[100px]">Winter</TableHead>
                        <TableHead className="w-[100px]">Sommer</TableHead>
                        <TableHead className="w-[80px]">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryItems.map(item => (
                        <TableRow key={item.key}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{item.icon}</span>
                              <span className="font-medium">{item.label}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={99}
                              value={item.quantity}
                              onChange={(e) => updateItem(item.key, { quantity: parseInt(e.target.value) || 0 })}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={item.calculation_type}
                              onValueChange={(v) => updateItem(item.key, { calculation_type: v as any })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="per_guest">pro Gast</SelectItem>
                                <SelectItem value="per_booking">pro Buchung</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={item.availability}
                              onValueChange={(v) => {
                                updateItem(item.key, {
                                  availability: v as any,
                                  season: v === 'year_round' ? null : item.season
                                });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="year_round">ganzes Jahr</SelectItem>
                                <SelectItem value="seasonal">saisonal</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          {category === 'Badbereich' && (
                            <TableCell>
                              <Select
                                value={item.color || 'white'}
                                onValueChange={(v) => updateItem(item.key, { color: v as ItemColor })}
                              >
                                <SelectTrigger className="w-24">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ITEM_COLORS.map(c => (
                                    <SelectItem key={c.key} value={c.key}>
                                      {c.icon} {c.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          )}
                          <TableCell>
                            {item.availability === 'seasonal' && (
                              <Checkbox
                                checked={item.season === 'winter'}
                                onCheckedChange={(checked) => 
                                  updateItem(item.key, { season: checked ? 'winter' : 'summer' })
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {item.availability === 'seasonal' && (
                              <Checkbox
                                checked={item.season === 'summer'}
                                onCheckedChange={(checked) => 
                                  updateItem(item.key, { season: checked ? 'summer' : 'winter' })
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteKey(item.key)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          ))}
        </CardContent>
      </Card>

      <LinenItemDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSave={handleAddItem}
        existingKeys={Object.keys(items)}
      />

      <AlertDialog open={!!deleteKey} onOpenChange={() => setDeleteKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wäsche-Item löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie "{items[deleteKey!]?.label}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteKey && handleDelete(deleteKey)}>
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LinenSetRulesTab;
