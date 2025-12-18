import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, Save, Plus, Trash2, Calculator } from 'lucide-react';
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

  useEffect(() => {
    if (houses?.length && !selectedHouseId) {
      setSelectedHouseId(houses[0].id);
    }
  }, [houses, selectedHouseId]);

  useEffect(() => {
    if (costs) {
      const costMap: Record<string, string> = {};
      costs.forEach(c => {
        costMap[c.category_id] = c.total_amount.toString();
      });
      setEditingCosts(costMap);
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

  const usedCategoryIds = new Set(costs?.map(c => c.category_id) || []);
  const availableCategories = categories?.filter(c => c.is_active && !usedCategoryIds.has(c.id)) || [];

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
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calculator className="h-5 w-5" />
                Kosten {selectedYear}
              </CardTitle>
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
        </>
      )}
    </div>
  );
};

export default UtilityCostEntry;
