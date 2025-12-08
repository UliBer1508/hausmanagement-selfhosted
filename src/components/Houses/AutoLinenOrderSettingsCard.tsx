import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, Settings, Link2, AlertTriangle } from 'lucide-react';
import { useLinenAutomationSettings } from '@/hooks/useLinenAutomationSettings';
import { useExternalArticleMapping } from '@/hooks/useExternalArticleMapping';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import ExternalArticleMappingDialog from './ExternalArticleMappingDialog';

const AutoLinenOrderSettingsCard = () => {
  const { settings, isLoading, updateSettings, isUpdating } = useLinenAutomationSettings();
  const { mappings } = useExternalArticleMapping();
  
  const [localIsEnabled, setLocalIsEnabled] = useState<boolean>(true);
  const [localLookaheadBookings, setLocalLookaheadBookings] = useState<number>(3);
  const [localDeliveryAdvanceDays, setLocalDeliveryAdvanceDays] = useState<number>(14);
  const [localMinAdvanceDays, setLocalMinAdvanceDays] = useState<number>(7);
  const [localProviderId, setLocalProviderId] = useState<string>('');
  const [localExternalSyncEnabled, setLocalExternalSyncEnabled] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);

  // Load settings into local state when available
  useEffect(() => {
    if (settings) {
      setLocalIsEnabled(settings.is_enabled);
      setLocalLookaheadBookings(settings.lookahead_bookings);
      setLocalDeliveryAdvanceDays(settings.delivery_advance_days);
      setLocalMinAdvanceDays(settings.min_advance_days);
      setLocalProviderId(settings.default_provider_id || 'none');
      setLocalExternalSyncEnabled(settings.external_sync_enabled || false);
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
      external_sync_enabled: localExternalSyncEnabled,
    });
    setHasChanges(false);
  };

  const handleChange = () => {
    setHasChanges(true);
  };

  // Count mappings for display
  const mappingCount = mappings?.length || 0;

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
    <>
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
        
        <CardContent className="space-y-6">
          {/* Lokale Automatisierung */}
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
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Wie funktioniert die Automatisierung?</strong><br />
              Täglich um 6:00 Uhr prüft das System die nächsten <strong>{localLookaheadBookings} Buchungen</strong> pro Haus. 
              Wenn keine Wäschebestellung existiert und der Check-in mindestens <strong>{localMinAdvanceDays} Tage</strong> entfernt ist, 
              wird automatisch eine Bestellung mit Status "offen" erstellt. 
              Der Liefertermin wird auf <strong>{localDeliveryAdvanceDays} Tage vor Check-in</strong> gesetzt.
            </p>
          </div>

          {/* Externe Synchronisation */}
          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h4 className="font-medium">Externe Synchronisation</h4>
                  <p className="text-xs text-muted-foreground">
                    Bestellungen automatisch an Wäsche Oberpinzgau senden
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch 
                  checked={localExternalSyncEnabled}
                  onCheckedChange={(checked) => {
                    setLocalExternalSyncEnabled(checked);
                    handleChange();
                  }}
                />
                <Label className="text-sm font-medium cursor-pointer">
                  Aktivieren
                </Label>
              </div>
            </div>

            {localExternalSyncEnabled && (
              <div className="space-y-3">
                {mappingCount === 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Keine Artikel-Zuordnungen vorhanden. Bitte konfigurieren Sie zuerst das Mapping.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center gap-3">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowMappingDialog(true)}
                    className="gap-2"
                  >
                    <Link2 className="h-4 w-4" />
                    Artikel-Mapping bearbeiten
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {mappingCount} Artikel zugeordnet
                  </span>
                </div>

                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Hinweis:</strong> Wenn aktiviert, werden Bestellungen automatisch an das externe 
                    Wäscheportal gesendet, sobald der Status auf "pending" gesetzt wird. 
                    Stellen Sie sicher, dass alle Artikel und Hausobjekte korrekt zugeordnet sind.
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ExternalArticleMappingDialog 
        open={showMappingDialog} 
        onOpenChange={setShowMappingDialog} 
      />
    </>
  );
};

export default AutoLinenOrderSettingsCard;
