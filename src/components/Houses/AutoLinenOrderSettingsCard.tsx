import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Settings } from 'lucide-react';
import { useLinenAutomationSettings } from '@/hooks/useLinenAutomationSettings';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';

const AutoLinenOrderSettingsCard = () => {
  const { settings, isLoading, updateSettings, isUpdating } = useLinenAutomationSettings();
  
  const [localIsEnabled, setLocalIsEnabled] = useState<boolean>(true);
  const [localLookaheadBookings, setLocalLookaheadBookings] = useState<number>(3);
  const [localDeliveryAdvanceDays, setLocalDeliveryAdvanceDays] = useState<number>(14);
  const [localMinAdvanceDays, setLocalMinAdvanceDays] = useState<number>(7);
  const [localProviderId, setLocalProviderId] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings into local state when available
  useEffect(() => {
    if (settings) {
      setLocalIsEnabled(settings.is_enabled);
      setLocalLookaheadBookings(settings.lookahead_bookings);
      setLocalDeliveryAdvanceDays(settings.delivery_advance_days);
      setLocalMinAdvanceDays(settings.min_advance_days);
      setLocalProviderId(settings.default_provider_id || 'none');
      setHasChanges(false);
    }
  }, [settings]);

  // Fetch service providers (laundry) for dropdown
  const { data: providers } = useQuery({
    queryKey: ['service-providers-laundry'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_providers')
        .select('*')
        .eq('service_type', 'laundry')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const handleSave = () => {
    updateSettings({
      is_enabled: localIsEnabled,
      lookahead_bookings: localLookaheadBookings,
      delivery_advance_days: localDeliveryAdvanceDays,
      min_advance_days: localMinAdvanceDays,
      default_provider_id: localProviderId === 'none' ? null : localProviderId,
    });
    setHasChanges(false);
  };

  const handleChange = () => {
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-2 lg:space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Automatisierung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-2 lg:space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Automatisierung
        </CardTitle>
        
        <div className="flex items-center gap-3">
          <Switch 
            checked={localIsEnabled}
            onCheckedChange={(checked) => {
              setLocalIsEnabled(checked);
              handleChange();
            }}
            disabled={isLoading}
          />
          <Label className="text-sm font-medium cursor-pointer">
            Automatisierung aktivieren
          </Label>
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || isUpdating}
            size="sm"
            className="gap-2"
          >
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Speichere...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Einstellungen speichern
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Anzahl Buchungen */}
          <div className="space-y-2">
            <Label htmlFor="lookahead-bookings">Buchungen im Voraus</Label>
            <Input
              id="lookahead-bookings"
              type="number"
              min={1}
              max={10}
              value={localLookaheadBookings}
              onChange={(e) => {
                setLocalLookaheadBookings(parseInt(e.target.value) || 3);
                handleChange();
              }}
              disabled={!localIsEnabled}
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Anzahl der nächsten Buchungen
            </p>
          </div>

          {/* Vorlaufzeit Lieferung */}
          <div className="space-y-2">
            <Label htmlFor="delivery-advance">Vorlaufzeit Lieferung (Tage)</Label>
            <Input
              id="delivery-advance"
              type="number"
              min={1}
              max={30}
              value={localDeliveryAdvanceDays}
              onChange={(e) => {
                setLocalDeliveryAdvanceDays(parseInt(e.target.value) || 14);
                handleChange();
              }}
              disabled={!localIsEnabled}
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Lieferung X Tage vor Check-in
            </p>
          </div>

          {/* Minimaler Vorlauf */}
          <div className="space-y-2">
            <Label htmlFor="min-advance">Minimaler Vorlauf (Tage)</Label>
            <Input
              id="min-advance"
              type="number"
              min={1}
              max={14}
              value={localMinAdvanceDays}
              onChange={(e) => {
                setLocalMinAdvanceDays(parseInt(e.target.value) || 7);
                handleChange();
              }}
              disabled={!localIsEnabled}
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Nicht bestellen wenn zu nah
            </p>
          </div>

          {/* Standard-Wäscherei (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="default-provider">Standard-Wäscherei</Label>
            <Select
              value={localProviderId}
              onValueChange={(value) => {
                setLocalProviderId(value);
                handleChange();
              }}
              disabled={!localIsEnabled}
            >
              <SelectTrigger id="default-provider" className="bg-background">
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="none">Keine Auswahl</SelectItem>
                {providers?.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Für zukünftige Features
            </p>
          </div>
        </div>

        {/* Info-Box */}
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Wie funktioniert die Automatisierung?</strong><br />
            Täglich um 6:00 Uhr prüft das System die nächsten <strong>{localLookaheadBookings} Buchungen</strong> pro Haus. 
            Wenn keine Wäschebestellung existiert und der Check-in mindestens <strong>{localMinAdvanceDays} Tage</strong> entfernt ist, 
            wird automatisch eine Bestellung mit Status "offen" erstellt. 
            Der Liefertermin wird auf <strong>{localDeliveryAdvanceDays} Tage vor Check-in</strong> gesetzt.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AutoLinenOrderSettingsCard;
