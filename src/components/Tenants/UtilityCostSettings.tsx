import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Save, Building2 } from 'lucide-react';
import { useHouses } from '@/hooks/useHouses';
import {
  useUtilitySettings,
  useSaveUtilitySettings,
  useUtilityCostCategories,
  distributionKeyLabels,
} from '@/hooks/useUtilityCosts';

const UtilityCostSettings = () => {
  const { data: houses } = useHouses({ rental_type: 'long_term' });
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(null);
  const { data: settings, isLoading: settingsLoading } = useUtilitySettings(selectedHouseId);
  const { data: categories } = useUtilityCostCategories();
  const saveSettings = useSaveUtilitySettings();

  const [formData, setFormData] = useState({
    total_area_sqm: '',
    tenant_area_sqm: '',
    total_units: '1',
    tenant_persons: '1',
    monthly_prepayment: '',
  });

  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (houses?.length && !selectedHouseId) {
      setSelectedHouseId(houses[0].id);
    }
  }, [houses, selectedHouseId]);

  useEffect(() => {
    if (settings) {
      setFormData({
        total_area_sqm: settings.total_area_sqm?.toString() || '',
        tenant_area_sqm: settings.tenant_area_sqm?.toString() || '',
        total_units: settings.total_units?.toString() || '1',
        tenant_persons: settings.tenant_persons?.toString() || '1',
        monthly_prepayment: settings.monthly_prepayment?.toString() || '',
      });
    } else {
      setFormData({
        total_area_sqm: '',
        tenant_area_sqm: '',
        total_units: '1',
        tenant_persons: '1',
        monthly_prepayment: '',
      });
    }
  }, [settings]);

  useEffect(() => {
    if (categories) {
      setActiveCategories(new Set(categories.filter(c => c.is_active).map(c => c.id)));
    }
  }, [categories]);

  const handleSave = () => {
    if (!selectedHouseId) return;

    saveSettings.mutate({
      house_id: selectedHouseId,
      total_area_sqm: formData.total_area_sqm ? parseFloat(formData.total_area_sqm) : null,
      tenant_area_sqm: formData.tenant_area_sqm ? parseFloat(formData.tenant_area_sqm) : null,
      total_units: parseInt(formData.total_units) || 1,
      tenant_persons: parseInt(formData.tenant_persons) || 1,
      monthly_prepayment: formData.monthly_prepayment ? parseFloat(formData.monthly_prepayment) : null,
    });
  };

  const selectedHouse = houses?.find(h => h.id === selectedHouseId);
  const tenantPercentage = formData.total_area_sqm && formData.tenant_area_sqm
    ? ((parseFloat(formData.tenant_area_sqm) / parseFloat(formData.total_area_sqm)) * 100).toFixed(1)
    : null;

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
      {/* Objektauswahl */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Objekt auswählen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedHouseId || ''} onValueChange={setSelectedHouseId}>
            <SelectTrigger>
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
        </CardContent>
      </Card>

      {selectedHouseId && (
        <>
          {/* Gebäudedaten */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="h-5 w-5" />
                  Gebäudedaten
                </CardTitle>
                <Button onClick={handleSave} disabled={saveSettings.isPending} size="sm">
                  <Save className="h-4 w-4 mr-2" />
                  Speichern
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <div className="text-muted-foreground">Lade...</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="total_area">Gesamtfläche Gebäude (m²)</Label>
                      <Input
                        id="total_area"
                        type="number"
                        step="0.01"
                        value={formData.total_area_sqm}
                        onChange={(e) => setFormData({ ...formData, total_area_sqm: e.target.value })}
                        placeholder="z.B. 120"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tenant_area">Mieterfläche (m²)</Label>
                      <Input
                        id="tenant_area"
                        type="number"
                        step="0.01"
                        value={formData.tenant_area_sqm}
                        onChange={(e) => setFormData({ ...formData, tenant_area_sqm: e.target.value })}
                        placeholder="z.B. 85"
                      />
                    </div>
                  </div>

                  {tenantPercentage && (
                    <div className="p-3 bg-muted rounded-lg">
                      <span className="text-sm text-muted-foreground">Flächenanteil Mieter: </span>
                      <span className="font-semibold">{tenantPercentage}%</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="total_units">Wohneinheiten gesamt</Label>
                      <Input
                        id="total_units"
                        type="number"
                        min="1"
                        value={formData.total_units}
                        onChange={(e) => setFormData({ ...formData, total_units: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tenant_persons">Personen im Mieterhaushalt</Label>
                      <Input
                        id="tenant_persons"
                        type="number"
                        min="1"
                        value={formData.tenant_persons}
                        onChange={(e) => setFormData({ ...formData, tenant_persons: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Monatliche NK-Vorauszahlung */}
                  <div className="pt-4 border-t">
                    <div className="space-y-2">
                      <Label htmlFor="monthly_prepayment">Monatliche NK-Vorauszahlung (€)</Label>
                      <div className="flex items-center gap-3">
                        <Input
                          id="monthly_prepayment"
                          type="number"
                          step="0.01"
                          className="w-32"
                          value={formData.monthly_prepayment}
                          onChange={(e) => setFormData({ ...formData, monthly_prepayment: e.target.value })}
                          placeholder="z.B. 130"
                        />
                        {formData.monthly_prepayment && (
                          <span className="text-sm text-muted-foreground">
                            = {(parseFloat(formData.monthly_prepayment) * 12).toFixed(2)} €/Jahr
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Aktive Kostenarten */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Aktive Kostenarten</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categories?.map(category => (
                  <div key={category.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={category.id}
                        checked={activeCategories.has(category.id)}
                        onCheckedChange={(checked) => {
                          const newActive = new Set(activeCategories);
                          if (checked) {
                            newActive.add(category.id);
                          } else {
                            newActive.delete(category.id);
                          }
                          setActiveCategories(newActive);
                        }}
                      />
                      <div>
                        <Label htmlFor={category.id} className="cursor-pointer font-medium">
                          {category.name}
                        </Label>
                        {category.description && (
                          <p className="text-xs text-muted-foreground">{category.description}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {distributionKeyLabels[category.default_distribution_key] || category.default_distribution_key}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default UtilityCostSettings;
