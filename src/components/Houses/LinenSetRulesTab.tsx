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
import { LinenItemConfig, ItemColor, LinenColor, ITEM_COLORS, LINEN_COLORS } from '@/types/linen';
import { migrateOldToNewStructure, groupByCategory } from '@/lib/linenMigration';
import { LinenItemDialog } from './LinenItemDialog';
import TeuniSourcePanel from './TeuniSourcePanel';
import { Switch } from '@/components/ui/switch';
import { useLinenAutomationSettings } from '@/hooks/useLinenAutomationSettings';
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
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [hasMigrated, setHasMigrated] = useState(false);
  const { settings: automationSettings } = useLinenAutomationSettings();
  const teuniSyncEnabled = !!(automationSettings as any)?.teuni_stammdaten_sync_enabled;
  const [updatingSource, setUpdatingSource] = useState(false);

  const handleSourceChange = async (toTeuni: boolean) => {
    if (!house?.id) return;
    const next = toTeuni ? 'teuni' : 'own';
    setUpdatingSource(true);
    try {
      const { data: existing } = await supabase
        .from('linen_set_definitions')
        .select('id')
        .eq('house_id', house.id)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from('linen_set_definitions')
          .update({ linen_source: next } as any)
          .eq('house_id', house.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('linen_set_definitions')
          .insert({ house_id: house.id, linen_source: next } as any);
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ['linen-definitions', house.id] });
      toast({
        title: 'Quelle geändert',
        description: next === 'teuni' ? 'Teuni Wäscheartikel & -sets aktiv.' : 'Eigene Wäscheartikel aktiv.',
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e?.message || 'Unbekannter Fehler' });
    } finally {
      setUpdatingSource(false);
    }
  };

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

  const linenSource: 'own' | 'teuni' = ((linenDef as any)?.linen_source as 'own' | 'teuni') || 'own';

  // Migrate old structure to new on first load + auto-save missing colors
  useEffect(() => {
    if (linenDef && !hasMigrated) {
      const migratedItems = migrateOldToNewStructure(linenDef);
      setItems(migratedItems);
      
      const dbItems = linenDef.custom_categories || {};
      setOriginalItems(JSON.parse(JSON.stringify(dbItems)));
      setHasMigrated(true);
      
      // Prüfen ob Migration neue color-Felder hinzugefügt hat
      const hasNewColorFields = Object.entries(migratedItems).some(([key, item]) => {
        const dbItem = dbItems[key];
        return item.color !== undefined && (!dbItem || dbItem.color === undefined);
      });
      
      // Wenn neue Farben hinzugefügt wurden, automatisch speichern
      if (hasNewColorFields && Object.keys(dbItems).length > 0) {
        console.log('Migration: Speichere fehlende color-Felder automatisch...');
        supabase
          .from('linen_set_definitions')
          .update({ custom_categories: JSON.parse(JSON.stringify(migratedItems)) })
          .eq('house_id', house.id)
          .then(({ error }) => {
            if (!error) {
              console.log('Migration: color-Felder erfolgreich gespeichert');
              setOriginalItems(JSON.parse(JSON.stringify(migratedItems)));
              queryClient.invalidateQueries({ queryKey: ['linen-definitions', house.id] });
            }
          });
      }
    }
  }, [linenDef, hasMigrated, house?.id, queryClient]);

  // Check for changes
  useEffect(() => {
    const itemsChanged = JSON.stringify(items) !== JSON.stringify(originalItems);
    setHasChanges(itemsChanged);
  }, [items, originalItems]);

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

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linen-definitions'] });
      setOriginalItems(JSON.parse(JSON.stringify(items)));
      setHasChanges(false);
      toast({
        title: "✅ Gespeichert",
        description: "Wäscheset-Regeln wurden aktualisiert",
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
              <CardTitle>Wäschesets für {house.name}</CardTitle>
              <CardDescription>
                Definieren Sie, welche Wäschesets pro Gast oder pro Buchung benötigt werden
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 mr-2 px-3 py-1 rounded-md border bg-muted/30">
                <span className={`text-xs font-medium ${linenSource === 'own' ? 'text-foreground' : 'text-muted-foreground'}`}>Eigene</span>
                <Switch
                  checked={linenSource === 'teuni'}
                  disabled={!teuniSyncEnabled || updatingSource}
                  onCheckedChange={handleSourceChange}
                />
                <span className={`text-xs font-medium ${linenSource === 'teuni' ? 'text-foreground' : 'text-muted-foreground'}`}>Teuni</span>
              </div>
              {linenSource === 'own' && (
                <Button onClick={() => setShowAddDialog(true)} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Neues Item
                </Button>
              )}
              {linenSource === 'own' && hasChanges && (
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
          {!teuniSyncEnabled && (
            <Alert className="mb-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Teuni-Stammdaten-Sync ist global deaktiviert. In den <strong>Einstellungen → Wäsche-Automatisierung</strong> einschalten, um Teuni-Artikel und -Sets pro Haus nutzen zu können.
              </AlertDescription>
            </Alert>
          )}

          {linenSource === 'teuni' ? (
            <TeuniSourcePanel house={{ id: house.id, name: house.name }} />
          ) : (
          <>
          <Alert className="mb-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Die Tabelle ist immer editierbar. Änderungen werden mit <strong>Speichern</strong> übernommen.
              <strong>Ext. Artikelnr.</strong>: Für farbbasierte Artikel mehrere Nummern mit "/" trennen (z.B. WA001/WA005 für grau/weiß gestreift).
            </AlertDescription>
          </Alert>

          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            categoryItems.length > 0 && (
              <div key={category} className="mb-8">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span>{categoryIcons[category as keyof typeof categoryIcons]}</span>
                  {category}
                </h3>
                <div className="border rounded-lg overflow-hidden overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Wäsche</TableHead>
                        <TableHead className="w-[80px]">Anzahl</TableHead>
                        <TableHead className="w-[120px]">Berechnung</TableHead>
                        <TableHead className="w-[120px]">Verfügbarkeit</TableHead>
                        {(category === 'Badbereich' || category === 'Wellness' || category === 'Schlafbereich' || category === 'Küchenbereich') && (
                          <TableHead className="w-[100px]">Farbe</TableHead>
                        )}
                        <TableHead className="w-[80px]">Winter</TableHead>
                        <TableHead className="w-[80px]">Sommer</TableHead>
                        <TableHead className="w-[200px]">Ext. Artikelnr.</TableHead>
                        <TableHead className="w-[60px]">Aktionen</TableHead>
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
                          {(category === 'Badbereich' || category === 'Wellness' || category === 'Schlafbereich' || category === 'Küchenbereich') && (
                            <TableCell>
                              <Select
                                value={item.color || ''}
                                onValueChange={(v) => updateItem(item.key, { color: v as ItemColor | LinenColor })}
                              >
                                <SelectTrigger className="w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {category === 'Schlafbereich' 
                                    ? LINEN_COLORS.map(c => (
                                        <SelectItem key={c.key} value={c.key}>
                                          {c.icon} {c.label}
                                        </SelectItem>
                                      ))
                                    : ITEM_COLORS.map(c => (
                                        <SelectItem key={c.key} value={c.key}>
                                          {c.icon} {c.label}
                                        </SelectItem>
                                      ))
                                  }
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
                            {/* Externe Artikelnummer - für farbbasierte Items */}
                            {(category === 'Badbereich' || category === 'Wellness' || category === 'Schlafbereich' || category === 'Küchenbereich') ? (
                              <Input
                                placeholder={category === 'Schlafbereich' ? 'WA001/WA005' : 'WA008'}
                                value={(() => {
                                  const extMap = item.external_artikelnummer || {};
                                  // Zeige kompaktes Format: WA001/WA005
                                  const values = Object.values(extMap).filter(Boolean);
                                  return values.join('/');
                                })()}
                                onChange={(e) => {
                                  // Parse: WA001 oder WA001/WA005 für mehrere Farben
                                  const input = e.target.value.trim();
                                  const parts = input.split('/').map(p => p.trim()).filter(Boolean);
                                  
                                  // Für Schlafbereich: erste = grey_striped, zweite = white_striped
                                  // Für Badbereich/Wellness: erste = white, zweite = grey
                                  let newMap: Record<string, string> = {};
                                  if (category === 'Schlafbereich') {
                                    if (parts[0]) newMap['grey_striped'] = parts[0];
                                    if (parts[1]) newMap['white_striped'] = parts[1];
                                  } else {
                                    if (parts[0]) newMap['white'] = parts[0];
                                    if (parts[1]) newMap['grey'] = parts[1];
                                  }
                                  updateItem(item.key, { external_artikelnummer: newMap });
                                }}
                                className="w-28 text-xs"
                              />
                            ) : (
                              <Input
                                placeholder="WA011"
                                value={item.external_artikelnummer?.['default'] || ''}
                                onChange={(e) => {
                                  updateItem(item.key, { 
                                    external_artikelnummer: { 'default': e.target.value.trim() } 
                                  });
                                }}
                                className="w-20 text-xs"
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
          </>
          )}
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
