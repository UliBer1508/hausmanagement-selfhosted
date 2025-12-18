import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, Save, Plus, Trash2, Calculator, FileSpreadsheet, ListPlus, SaveAll } from 'lucide-react';
import { useHouses } from '@/hooks/useHouses';
import {
  useUtilitySettings,
  useUtilityCosts,
  useUtilityCostCategories,
  useSaveUtilityCost,
  useDeleteUtilityCost,
  calculateTenantShare,
  distributionKeyLabels,
  UtilitySettings,
} from '@/hooks/useUtilityCosts';
import { toast } from 'sonner';
import ExcelUtilityImport from './ExcelUtilityImport';

const currentYear = new Date().getFullYear();

const UtilityCostEntry = () => {
  const { data: houses } = useHouses({ rental_type: 'long_term' });
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const { data: settings } = useUtilitySettings(selectedHouseId);
  const { data: costs, isLoading: costsLoading } = useUtilityCosts(selectedHouseId, selectedYear);
  const { data: categories } = useUtilityCostCategories();
  const saveCost = useSaveUtilityCost();
  const deleteCost = useDeleteUtilityCost();

  const [editingCosts, setEditingCosts] = useState<Record<string, string>>({});
  const [newCategoryId, setNewCategoryId] = useState<string>('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  useEffect(() => {
    if (houses?.length && !selectedHouseId) {
      setSelectedHouseId(houses[0].id);
    }
  }, [houses, selectedHouseId]);

  // Reset state when house or year changes
  useEffect(() => {
    setEditingCosts({});
    setShowAllCategories(false);
  }, [selectedHouseId, selectedYear]);

  // Merge DB values without overwriting manual input
  useEffect(() => {
    if (costs) {
      setEditingCosts(prev => {
        const newCosts = { ...prev };
        costs.forEach(c => {
          // Only set if not already manually entered
          if (!(c.category_id in newCosts) || newCosts[c.category_id] === '') {
            newCosts[c.category_id] = c.total_amount.toString();
          }
        });
        return newCosts;
      });
    }
  }, [costs]);

  const handleSaveCost = (categoryId: string) => {
    if (!selectedHouseId) return;

    const amount = parseFloat(editingCosts[categoryId] || '0');
    if (isNaN(amount)) {
      toast.error('Ungültiger Betrag');
      return;
    }

    const category = categories?.find(c => c.id === categoryId);

    saveCost.mutate({
      house_id: selectedHouseId,
      category_id: categoryId,
      year: selectedYear,
      total_amount: amount,
      distribution_key: category?.default_distribution_key || 'wohnflaeche',
    });
  };

  const handleAddCategory = () => {
    if (!newCategoryId || !selectedHouseId) return;

    const category = categories?.find(c => c.id === newCategoryId);
    if (!category) return;

    saveCost.mutate({
      house_id: selectedHouseId,
      category_id: newCategoryId,
      year: selectedYear,
      total_amount: 0,
      distribution_key: category.default_distribution_key,
    });

    setNewCategoryId('');
  };

  const handleDeleteCost = (costId: string) => {
    if (!selectedHouseId) return;
    deleteCost.mutate({ id: costId, houseId: selectedHouseId, year: selectedYear });
  };

  const handleShowAllCategories = () => {
    if (!categories) return;
    
    // Add all active categories that don't have costs yet
    const newEditingCosts = { ...editingCosts };
    categories.filter(c => c.is_active).forEach(cat => {
      if (!(cat.id in newEditingCosts)) {
        newEditingCosts[cat.id] = '';
      }
    });
    setEditingCosts(newEditingCosts);
    setShowAllCategories(true);
  };

  const handleSaveAll = async () => {
    if (!selectedHouseId || !categories) return;

    const toSave = Object.entries(editingCosts)
      .filter(([_, value]) => value !== '' && parseFloat(value) > 0)
      .map(([categoryId, value]) => {
        const category = categories.find(c => c.id === categoryId);
        return {
          house_id: selectedHouseId,
          category_id: categoryId,
          year: selectedYear,
          total_amount: parseFloat(value),
          distribution_key: category?.default_distribution_key || 'wohnflaeche',
        };
      });

    if (toSave.length === 0) {
      toast.error('Keine Beträge zum Speichern');
      return;
    }

    let saved = 0;
    for (const cost of toSave) {
      try {
        await saveCost.mutateAsync(cost);
        saved++;
      } catch (e) {
        console.error('Error saving cost:', e);
      }
    }
    
    toast.success(`${saved} Kosten gespeichert`);
    setShowAllCategories(false);
  };

  const usedCategoryIds = new Set(costs?.map(c => c.category_id) || []);
  const availableCategories = categories?.filter(c => c.is_active && !usedCategoryIds.has(c.id)) || [];
  
  // Combine existing costs with all categories when showing all
  const displayCategories = showAllCategories 
    ? categories?.filter(c => c.is_active) || []
    : [];

  const totalCosts = costs?.reduce((sum, c) => sum + c.total_amount, 0) || 0;
  const totalTenantShare = costs?.reduce((sum, c) => {
    if (!settings) return sum;
    const key = c.distribution_key || c.category?.default_distribution_key || 'wohnflaeche';
    const { share } = calculateTenantShare(c.total_amount, key, settings as UtilitySettings);
    return sum + share;
  }, 0) || 0;

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  if (!houses?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Keine Festvermietungen vorhanden.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <Select value={selectedHouseId || ''} onValueChange={setSelectedHouseId}>
                <SelectTrigger>
                  <Building2 className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Objekt wählen..." />
                </SelectTrigger>
                <SelectContent>
                  {houses?.map(house => (
                    <SelectItem key={house.id} value={house.id}>
                      {house.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedHouseId && !settings && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-4">
            <p className="text-sm text-amber-600">
              ⚠️ Bitte zuerst Gebäudedaten in den Einstellungen konfigurieren.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedHouseId && settings && (
        <>
          {/* Kostentabelle */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calculator className="h-5 w-5" />
                  Kosten {selectedYear}
                </CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleShowAllCategories}
                    disabled={showAllCategories}
                  >
                    <ListPlus className="h-4 w-4 mr-2" />
                    Alle Kategorien
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowImportDialog(true)}
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Excel Import
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {costsLoading ? (
                <div className="text-muted-foreground py-4">Lade...</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kostenart</TableHead>
                        <TableHead className="text-right">Gesamtkosten</TableHead>
                        <TableHead className="text-center">Verteilung</TableHead>
                        <TableHead className="text-right">Mieteranteil</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Existing costs */}
                      {costs?.map(cost => {
                        const key = cost.distribution_key || cost.category?.default_distribution_key || 'wohnflaeche';
                        const { share, percentage } = calculateTenantShare(
                          parseFloat(editingCosts[cost.category_id] || '0'),
                          key,
                          settings as UtilitySettings
                        );

                        return (
                          <TableRow key={cost.id}>
                            <TableCell className="font-medium">
                              {cost.category?.name || 'Unbekannt'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  className="w-28 text-right"
                                  value={editingCosts[cost.category_id] || ''}
                                  onChange={(e) => setEditingCosts({
                                    ...editingCosts,
                                    [cost.category_id]: e.target.value
                                  })}
                                />
                                <span className="text-muted-foreground">€</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-sm text-muted-foreground">
                              {percentage.toFixed(1)}% {distributionKeyLabels[key]?.split(' ')[0]}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {share.toFixed(2)} €
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleSaveCost(cost.category_id)}
                                  disabled={saveCost.isPending}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => handleDeleteCost(cost.id)}
                                  disabled={deleteCost.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      
                      {/* Show all categories (empty rows for input) */}
                      {showAllCategories && displayCategories
                        .filter(cat => !usedCategoryIds.has(cat.id))
                        .map(category => {
                          const key = category.default_distribution_key || 'wohnflaeche';
                          const amount = parseFloat(editingCosts[category.id] || '0');
                          const { share, percentage } = calculateTenantShare(
                            amount,
                            key,
                            settings as UtilitySettings
                          );

                          return (
                            <TableRow key={category.id} className="bg-muted/20">
                              <TableCell className="font-medium text-muted-foreground">
                                {category.name}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="w-28 text-right"
                                    placeholder="0,00"
                                    value={editingCosts[category.id] || ''}
                                    onChange={(e) => setEditingCosts({
                                      ...editingCosts,
                                      [category.id]: e.target.value
                                    })}
                                  />
                                  <span className="text-muted-foreground">€</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center text-sm text-muted-foreground">
                                {percentage.toFixed(1)}% {distributionKeyLabels[key]?.split(' ')[0]}
                              </TableCell>
                              <TableCell className="text-right font-medium text-muted-foreground">
                                {share.toFixed(2)} €
                              </TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          );
                        })}
                      
                      {/* Summenzeile */}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell>GESAMT</TableCell>
                        <TableCell className="text-right">{totalCosts.toFixed(2)} €</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right">{totalTenantShare.toFixed(2)} €</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  
                  {/* Alle speichern Button wenn alle Kategorien angezeigt werden */}
                  {showAllCategories && (
                    <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                      <Button 
                        variant="outline" 
                        onClick={() => setShowAllCategories(false)}
                      >
                        Abbrechen
                      </Button>
                      <Button 
                        onClick={handleSaveAll}
                        disabled={saveCost.isPending}
                      >
                        <SaveAll className="h-4 w-4 mr-2" />
                        Alle speichern
                      </Button>
                    </div>
                  )}

                  {/* Neue Kostenart hinzufügen */}
                  {availableCategories.length > 0 && (
                    <div className="flex gap-2 mt-4 pt-4 border-t">
                      <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Kostenart hinzufügen..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCategories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={handleAddCategory} disabled={!newCategoryId || saveCost.isPending}>
                        <Plus className="h-4 w-4 mr-2" />
                        Hinzufügen
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Excel Import Dialog */}
          <ExcelUtilityImport
            open={showImportDialog}
            onOpenChange={setShowImportDialog}
            houseId={selectedHouseId}
            year={selectedYear}
            categories={categories || []}
            houseName={houses?.find(h => h.id === selectedHouseId)?.name || ''}
          />
        </>
      )}
    </div>
  );
};

export default UtilityCostEntry;
