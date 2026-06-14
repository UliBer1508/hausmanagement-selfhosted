import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, Settings, Link2, AlertTriangle, Play, CheckCircle, Info, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useLinenAutomationSettings } from '@/hooks/useLinenAutomationSettings';
import { useExternalArticleMapping } from '@/hooks/useExternalArticleMapping';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import ExternalArticleMappingDialog from './ExternalArticleMappingDialog';

interface CheckResult {
  success: boolean;
  ordersCreated: number;
  bookingsSkipped: number;
  details: Array<{
    guest: string;
    house: string;
    action: string;
    reason?: string;
    check_in?: string;
    delivery_date?: string;
    items_count?: number;
    existing_status?: string;
    days_until?: number;
    min_required?: number;
    current_open?: number;
    max_allowed?: number;
  }>;
}

const AutoLinenOrderSettingsCard = () => {
  const queryClient = useQueryClient();
  const { settings, isLoading, updateSettings, isUpdating } = useLinenAutomationSettings();
  const { mappings } = useExternalArticleMapping();
  
  const [localIsEnabled, setLocalIsEnabled] = useState<boolean>(true);
  const [localLookaheadBookings, setLocalLookaheadBookings] = useState<number>(3);
  const [localDeliveryAdvanceDays, setLocalDeliveryAdvanceDays] = useState<number>(14);
  const [localMinAdvanceDays, setLocalMinAdvanceDays] = useState<number>(7);
  const [localProviderId, setLocalProviderId] = useState<string>('');
  const [localExternalSyncEnabled, setLocalExternalSyncEnabled] = useState<boolean>(false);
  const [localTeuniStammdatenEnabled, setLocalTeuniStammdatenEnabled] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<CheckResult | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Load settings into local state when available
  useEffect(() => {
    if (settings) {
      setLocalIsEnabled(settings.is_enabled);
      setLocalLookaheadBookings(settings.lookahead_bookings);
      setLocalDeliveryAdvanceDays(settings.delivery_advance_days);
      setLocalMinAdvanceDays(settings.min_advance_days);
      setLocalProviderId(settings.default_provider_id || 'none');
      setLocalExternalSyncEnabled(settings.external_sync_enabled || false);
      setLocalTeuniStammdatenEnabled((settings as any).teuni_stammdaten_sync_enabled || false);
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
      teuni_stammdaten_sync_enabled: localTeuniStammdatenEnabled,
    });
    setHasChanges(false);
  };

  const handleChange = () => {
    setHasChanges(true);
  };

  const handleCheckNow = async () => {
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-create-linen-orders');
      
      if (error) throw error;
      
      const result: CheckResult = {
        success: data?.success ?? false,
        ordersCreated: data?.summary?.orders_created ?? 0,
        bookingsSkipped: data?.summary?.bookings_skipped ?? 0,
        details: data?.details ?? []
      };
      
      setLastCheckResult(result);
      
      // Cache invalidieren damit die Listen sofort aktualisiert werden
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-list'] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-connected'] });
      await queryClient.invalidateQueries({ queryKey: ['houses-linen-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['connected-bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['booking-orders-status'] });
      
      if (result.ordersCreated > 0) {
        toast.success(`${result.ordersCreated} Bestellung(en) erstellt!`);
      } else {
        toast.info('Keine neuen Bestellungen nötig');
      }
      
    } catch (error: any) {
      toast.error('Fehler bei der Prüfung: ' + (error.message || 'Unbekannter Fehler'));
      setLastCheckResult(null);
    } finally {
      setIsChecking(false);
    }
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
        <CardHeader className="flex flex-col gap-3 pb-4 p-3 sm:p-6">
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="flex items-center justify-between gap-2 w-full text-left"
            aria-expanded={isExpanded}
          >
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 shrink-0" />
              Automatisierung
            </CardTitle>
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
          </button>

          {isExpanded && (
          <div className="flex flex-col gap-3 w-full sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Switch
                checked={localIsEnabled}
                onCheckedChange={(checked) => {
                  setLocalIsEnabled(checked);
                  handleChange();
                }}
                disabled={isLoading}
                className="shrink-0"
              />
              <Label className="text-sm font-medium cursor-pointer">
                Automatisierung aktivieren
              </Label>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={handleCheckNow}
                disabled={isChecking || !localIsEnabled}
                size="sm"
                className="gap-2 flex-1 sm:flex-initial"
              >
                {isChecking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Prüfe...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Jetzt prüfen
                  </>
                )}
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || isUpdating}
                size="sm"
                className="gap-2 flex-1 sm:flex-initial"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Speichere...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span className="hidden sm:inline">Einstellungen speichern</span>
                    <span className="sm:hidden">Speichern</span>
                  </>
                )}
              </Button>
            </div>
          </div>
          )}
        </CardHeader>

        {isExpanded && (
        <CardContent className="space-y-4 sm:space-y-6 p-3 sm:p-6 pt-0 sm:pt-0">
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
              Täglich um 6:00 Uhr hält das System maximal <strong>{localLookaheadBookings} offene Bestellungen</strong> pro Haus vor. 
              Wenn der Check-in mindestens <strong>{localMinAdvanceDays} Tage</strong> entfernt ist, 
              wird automatisch eine Bestellung mit Status "offen" erstellt. 
              Der Liefertermin wird auf <strong>{localDeliveryAdvanceDays} Tage vor Check-in</strong> gesetzt.
            </p>
          </div>

          {/* Letzte Prüfung Ergebnis */}
          {lastCheckResult && (
            <div className={`p-3 rounded-md border ${
              lastCheckResult.ordersCreated > 0 
                ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' 
                : 'bg-muted/50 border-border'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {lastCheckResult.ordersCreated > 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <Info className="h-5 w-5 text-muted-foreground" />
                )}
                <strong className="text-sm">Letzte Prüfung:</strong>
              </div>
              <ul className="text-sm space-y-1">
                <li>✅ {lastCheckResult.ordersCreated} Bestellung(en) erstellt</li>
                <li>⏭️ {lastCheckResult.bookingsSkipped} Buchung(en) übersprungen</li>
              </ul>
              
              {lastCheckResult.details.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground font-medium">
                    Details anzeigen ({lastCheckResult.details.length})
                  </summary>
                  <div className="mt-3 space-y-4 max-h-80 overflow-y-auto">
                    {/* Erstellte Bestellungen - Tabelle */}
                    {lastCheckResult.details.filter(d => d.action === 'created').length > 0 && (
                       <div>
                         <p className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center gap-1 mb-2">
                           <CheckCircle className="h-3 w-3" /> Erstellt
                         </p>
                         <div className="overflow-x-auto">
                         <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs h-8">Gast</TableHead>
                              <TableHead className="text-xs h-8">Haus</TableHead>
                              <TableHead className="text-xs h-8">Check-in</TableHead>
                              <TableHead className="text-xs h-8">Lieferung</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {lastCheckResult.details.filter(d => d.action === 'created').map((d, i) => {
                              const formatDate = (dateStr?: string) => {
                                if (!dateStr) return '-';
                                const date = new Date(dateStr);
                                return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }).replace(/\.$/, '') + '.';
                              };
                              return (
                                <TableRow key={`created-${i}`}>
                                  <TableCell className="py-2">
                                    <span className={i === 0 ? "bg-primary text-primary-foreground px-2 py-0.5 rounded text-xs font-medium" : "text-xs"}>
                                      {d.guest}
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <span className={i === 0 ? "bg-primary text-primary-foreground px-2 py-0.5 rounded text-xs font-medium" : "text-xs"}>
                                      {d.house}
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-2 text-xs">{formatDate(d.check_in)}</TableCell>
                                  <TableCell className="py-2 text-xs">{formatDate(d.delivery_date)}</TableCell>
                                </TableRow>
                              );
                             })}
                           </TableBody>
                         </Table>
                         </div>
                       </div>
                    )}

                    {/* Übersprungene Buchungen - Tabelle */}
                    {lastCheckResult.details.filter(d => d.action === 'skipped').length > 0 && (
                       <div>
                         <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-2">
                           <Package className="h-3 w-3" /> Bestehende Bestellungen
                         </p>
                         <div className="overflow-x-auto">
                         <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs h-8">Gast</TableHead>
                              <TableHead className="text-xs h-8">Haus</TableHead>
                              <TableHead className="text-xs h-8">Check-in</TableHead>
                              <TableHead className="text-xs h-8">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {lastCheckResult.details.filter(d => d.action === 'skipped').map((d, i) => {
                              const formatDate = (dateStr?: string) => {
                                if (!dateStr) return '-';
                                const date = new Date(dateStr);
                                return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }).replace(/\.$/, '') + '.';
                              };
                              const getStatusBadge = () => {
                                const status = d.existing_status?.toLowerCase();
                                if (status === 'delivered') {
                                  return <Badge className="bg-green-500 hover:bg-green-600 text-white text-xs">Geliefert</Badge>;
                                }
                                if (status === 'ausstehend') {
                                  return <Badge className="bg-purple-500 hover:bg-purple-600 text-white text-xs">Ausstehend</Badge>;
                                }
                                if (status === 'bestellt') {
                                  return <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs">Bestellt</Badge>;
                                }
                                if (status === 'offen') {
                                  return <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-xs">Offen</Badge>;
                                }
                                if (status === 'cancelled') {
                                  return <Badge className="bg-red-500 hover:bg-red-600 text-white text-xs">Storniert</Badge>;
                                }
                                return <Badge variant="secondary" className="text-xs">-</Badge>;
                              };
                              return (
                                <TableRow key={`skipped-${i}`}>
                                  <TableCell className="py-2 text-xs">{d.guest}</TableCell>
                                  <TableCell className="py-2 text-xs">{d.house}</TableCell>
                                  <TableCell className="py-2 text-xs">{formatDate(d.check_in)}</TableCell>
                                  <TableCell className="py-2 text-xs">{getStatusBadge()}</TableCell>
                                </TableRow>
                              );
                             })}
                           </TableBody>
                         </Table>
                         </div>
                       </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}

          {/* Wäsche Oberpinzgau Synchronisation */}
          <div className="border-t pt-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 min-w-0">
                <Link2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h4 className="font-medium">Wäsche Oberpinzgau Sync</h4>
                  <p className="text-xs text-muted-foreground">
                    Bestellungen zur externen Oberpinzgau-Datenbank synchronisieren (nicht Teuni)
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMappingDialog(true)}
                  className="gap-2 w-full sm:w-auto"
                >
                  <Link2 className="h-4 w-4" />
                  Artikel-Mapping ({mappingCount})
                </Button>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={localExternalSyncEnabled}
                    onCheckedChange={(checked) => {
                      setLocalExternalSyncEnabled(checked);
                      handleChange();
                    }}
                    className="shrink-0"
                  />
                  <Label className="text-sm font-medium cursor-pointer">
                    Aktivieren
                  </Label>
                </div>
              </div>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Wie funktioniert die Synchronisation?</strong><br />
                Wenn aktiviert, werden Wäschebestellungen automatisch an das externe
                <strong> Oberpinzgau-Wäscheportal</strong> gesendet, sobald sie den Status
                <strong> "Ausstehend"</strong> erhalten. Voraussetzung ist, dass jeder Artikel
                über das <strong>Artikel-Mapping</strong> einer externen Artikelnummer zugeordnet wurde.
                Die Übertragung erfolgt einseitig — Statusänderungen im externen Portal werden
                nicht zurück synchronisiert.
              </p>
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

                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>Hinweis:</strong> Wenn aktiviert, werden Bestellungen automatisch an das externe 
                    Wäscheportal gesendet, sobald der Status auf "Ausstehend" gesetzt wird. 
                    Stellen Sie sicher, dass alle Artikel und Hausobjekte korrekt zugeordnet sind.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Teuni Stammdaten-Sync (Artikel & Vorlagen-Sets lesen) */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 min-w-0">
                <Package className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h4 className="font-medium">Teuni Stammdaten-Sync</h4>
                  <p className="text-xs text-muted-foreground">
                    Wäscheartikel und Teuni-Vorlagen-Sets aus Wäsche Oberpinzgau lesen und für Häuser übernehmen.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={localTeuniStammdatenEnabled}
                  onCheckedChange={(checked) => {
                    setLocalTeuniStammdatenEnabled(checked);
                    handleChange();
                  }}
                  className="shrink-0"
                />
                <Label className="text-sm font-medium cursor-pointer">Aktivieren</Label>
              </div>
            </div>
            <div className="p-3 bg-muted/40 rounded-md border">
              <p className="text-xs text-muted-foreground">
                Unabhängig vom Bestellabwicklungs-Sync. Wenn deaktiviert, bleibt die aktuelle Lösung
                (direkter Datenbankzugriff für das Artikel-Mapping) aktiv und es wird kein Teuni-Set-Button
                bei den Wäschesets eines Hauses angezeigt.
              </p>
            </div>
          </div>
        </CardContent>
        )}
      </Card>

      <ExternalArticleMappingDialog 
        open={showMappingDialog} 
        onOpenChange={setShowMappingDialog} 
      />
    </>
  );
};

export default AutoLinenOrderSettingsCard;
