import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, AlertTriangle, CheckCircle2, Link2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useExternalArticleMapping } from '@/hooks/useExternalArticleMapping';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { translateItemType } from '@/lib/linenOrderHelpers';
import { externalLaundryClient, ExternalWaescheArtikel } from '@/integrations/externalLaundry/client';
import { toast } from '@/hooks/use-toast';
import { useLinenAutomationSettings } from '@/hooks/useLinenAutomationSettings';
import { useExternalArticles } from '@/hooks/useExternalStammdaten';

interface ExternalArticleMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Farb-Übersetzung für Anzeige
const translateColor = (colorKey: string): string => {
  const translations: Record<string, string> = {
    'white': 'Weiß',
    'grey': 'Grau',
    'white_striped': 'Weiß gestreift',
    'grey_striped': 'Grau gestreift',
    'colorful': 'Bunt',
  };
  return translations[colorKey] || colorKey;
};

const ExternalArticleMappingDialog = ({ open, onOpenChange }: ExternalArticleMappingDialogProps) => {
  const queryClient = useQueryClient();
  const { mappings, isLoading: isMappingsLoading, saveMappings, isSaving } = useExternalArticleMapping();
  const { settings: automationSettings } = useLinenAutomationSettings();
  const useTeuniProxy = !!(automationSettings as any)?.teuni_stammdaten_sync_enabled;
  
  // State: internal_item_key (mit Farbe) → external_artikelnummer
  // Format: { "bedding__grey_striped": "WA001", "small_towels__white": "WA008" }
  const [localMappings, setLocalMappings] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load linen definitions for internal article options
  const { data: linenDefs, isLoading: isDefsLoading, refetch: refetchDefs } = useQuery({
    queryKey: ['linen-set-definitions-for-mapping'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('id, house_id, custom_categories')
        .limit(1)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: open,
    staleTime: 0,
  });

  // Load external articles from external Supabase (legacy direct path)
  const { 
    data: externalArticlesLegacy, 
    isLoading: isLoadingExternalLegacy, 
    error: externalErrorLegacy,
    refetch: refetchExternalLegacy 
  } = useQuery({
    queryKey: ['external-waescheartikel'],
    queryFn: async () => {
      const { data, error } = await externalLaundryClient
        .from('waescheartikel')
        .select('id, artikelnummer, name, kategorie, groesse, farbe, preis, aktiv')
        .eq('aktiv', true)
        .order('artikelnummer');
      
      if (error) throw error;
      return data as ExternalWaescheArtikel[];
    },
    enabled: open && !useTeuniProxy,
    staleTime: 0,
  });

  // Load external articles via Teuni REST proxy (new path)
  const {
    data: externalArticlesProxy,
    isLoading: isLoadingExternalProxy,
    error: externalErrorProxy,
    refetch: refetchExternalProxy,
  } = useExternalArticles({ aktiv: true }, open && useTeuniProxy);

  const externalArticles = useTeuniProxy
    ? (externalArticlesProxy as unknown as ExternalWaescheArtikel[] | undefined)
    : externalArticlesLegacy;
  const isLoadingExternal = useTeuniProxy ? isLoadingExternalProxy : isLoadingExternalLegacy;
  const externalError = useTeuniProxy ? externalErrorProxy : externalErrorLegacy;
  const refetchExternal = useTeuniProxy ? refetchExternalProxy : refetchExternalLegacy;

  // Build internal article options from custom_categories
  const internalArticleOptions: { key: string; label: string; category: string; colors: string[] }[] = (() => {
    const options: { key: string; label: string; category: string; colors: string[] }[] = [];
    
    if (linenDefs?.custom_categories) {
      const customCats = linenDefs.custom_categories as Record<string, any>;
      
      Object.entries(customCats).forEach(([key, config]) => {
        if (!config || config.active === false) return;
        
        const category = config.category || 'Sonstige';
        const label = config.label || translateItemType(key);
        
        // Farben aus external_artikelnummer Keys lesen (aus Datenbank)
        let colors: string[] = [];
        if (config.external_artikelnummer && typeof config.external_artikelnummer === 'object') {
          colors = Object.keys(config.external_artikelnummer);
        }
        // Minimaler Fallback nur wenn external_artikelnummer fehlt
        if (colors.length === 0) {
          colors = [config.color || 'white'];
        }
        
        options.push({ key, label, category, colors });
      });
    }
    
    // Kein Fallback mit hardcodierten Farben - Daten müssen aus DB kommen
    // Falls keine custom_categories vorhanden, ist die Liste leer
    
    return options.sort((a, b) => {
      const categoryOrder = ['Schlafbereich', 'Badbereich', 'Wellness', 'Küchenbereich'];
      const catA = categoryOrder.indexOf(a.category);
      const catB = categoryOrder.indexOf(b.category);
      if (catA !== catB) return catA - catB;
      return a.label.localeCompare(b.label);
    });
  })();

  // Flatten to rows with colors
  const internalArticleRows: { key: string; colorKey: string; label: string; category: string; fullKey: string }[] = (() => {
    const rows: { key: string; colorKey: string; label: string; category: string; fullKey: string }[] = [];
    
    internalArticleOptions.forEach((item) => {
      item.colors.forEach((colorKey) => {
        rows.push({
          key: item.key,
          colorKey,
          label: item.label,
          category: item.category,
          fullKey: `${item.key}__${colorKey}`,
        });
      });
    });
    
    return rows;
  })();

  // Build external article options for dropdown
  const externalArticleOptions: { value: string; label: string }[] = (() => {
    if (!externalArticles) return [];
    
    return externalArticles.map((ext) => ({
      value: ext.artikelnummer,
      label: `${ext.artikelnummer} - ${ext.name}${ext.farbe ? ` (${ext.farbe})` : ''}`,
    }));
  })();

  // Initialize local state when dialog opens
  useEffect(() => {
    if (open && mappings) {
      const mappingsMap: Record<string, string> = {};
      for (const m of mappings) {
        // internal_item_key enthält bereits das Format "bedding__grey_striped"
        mappingsMap[m.internal_item_key] = m.external_artikelnummer;
      }
      setLocalMappings(mappingsMap);
      setHasChanges(false);
    }
  }, [open, mappings]);

  const handleMappingChange = (internalFullKey: string, externalArtikelnummer: string) => {
    setLocalMappings(prev => ({ 
      ...prev, 
      [internalFullKey]: externalArtikelnummer === 'none' ? '' : externalArtikelnummer 
    }));
    setHasChanges(true);
  };

  const handleRefresh = async () => {
    await Promise.all([refetchDefs(), refetchExternal()]);
    toast({
      title: "Daten aktualisiert",
      description: "Interne und externe Artikel wurden neu geladen.",
    });
  };

  const handleSave = async () => {
    try {
      // Convert to DB format
      const mappingsToSave: { internal_item_key: string; external_artikelnummer: string }[] = [];
      
      Object.entries(localMappings).forEach(([internalFullKey, externalArtikelnummer]) => {
        if (externalArtikelnummer?.trim()) {
          mappingsToSave.push({
            internal_item_key: internalFullKey, // z.B. "bedding__grey_striped"
            external_artikelnummer: externalArtikelnummer, // z.B. "WA001"
          });
        }
      });

      await saveMappings(mappingsToSave);

      await queryClient.invalidateQueries({ queryKey: ['external-article-mapping'] });
      
      toast({
        title: "Erfolgreich gespeichert",
        description: `${mappingsToSave.length} Zuordnungen wurden aktualisiert.`,
      });

      setHasChanges(false);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        variant: "destructive",
        title: "Fehler beim Speichern",
        description: error.message || "Die Daten konnten nicht gespeichert werden.",
      });
    }
  };

  const mappedCount = Object.values(localMappings).filter(v => v?.trim()).length;
  const totalCount = internalArticleRows.length;
  const unmappedCount = totalCount - mappedCount;

  const isLoading = isMappingsLoading || isDefsLoading;

  // Group by category for display
  const groupedRows = internalArticleRows.reduce((acc, row) => {
    if (!acc[row.category]) acc[row.category] = [];
    acc[row.category].push(row);
    return acc;
  }, {} as Record<string, typeof internalArticleRows>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Interne Artikel zu externen Artikeln zuordnen
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Connection Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {externalError ? (
                  <Badge variant="destructive" className="gap-1">
                    <WifiOff className="h-3 w-3" />
                    Verbindung fehlgeschlagen
                  </Badge>
                ) : isLoadingExternal ? (
                  <Badge variant="secondary" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Lade externe Artikel...
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-300">
                    <Wifi className="h-3 w-3" />
                    {externalArticles?.length || 0} externe Artikel
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1">
                  {totalCount} interne Artikel-Varianten
                </Badge>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isLoadingExternal || isDefsLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingExternal || isDefsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {/* Info */}
            <Alert className="border-blue-300 bg-blue-50 dark:bg-blue-950/30">
              <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                Ordne jede interne Artikel-Farbkombination der entsprechenden externen Artikelnummer zu.
                So können z.B. "Handtücher" und "WB-Handtücher" beide auf "WA008" gemappt werden.
              </AlertDescription>
            </Alert>

            {/* Mapping Status */}
            <Alert className={unmappedCount > 0 ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-green-500 bg-green-50 dark:bg-green-950/30'}>
              <AlertDescription className="flex items-center gap-2">
                {unmappedCount > 0 ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-amber-800 dark:text-amber-200">
                      {unmappedCount} von {totalCount} internen Artikel-Varianten sind noch nicht zugeordnet
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-green-800 dark:text-green-200">
                      Alle {mappedCount} Artikel-Varianten sind zugeordnet
                    </span>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {/* Mapping Table - Internal Articles as primary list */}
            <div className="space-y-4">
              {Object.entries(groupedRows).map(([category, rows]) => (
                <div key={category} className="border rounded-md">
                  <div className="bg-muted px-4 py-2 font-medium text-sm border-b">
                    {category}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Interner Artikel</TableHead>
                        <TableHead className="w-[120px]">Farbe</TableHead>
                        <TableHead className="w-[40px] text-center">→</TableHead>
                        <TableHead>Externe Artikelnummer</TableHead>
                        <TableHead className="w-[60px] text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => {
                        const currentMapping = localMappings[row.fullKey] || '';
                        const isMapped = !!currentMapping.trim();
                        
                        return (
                          <TableRow key={row.fullKey}>
                            <TableCell className="font-medium">
                              {row.label}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {translateColor(row.colorKey)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">→</TableCell>
                            <TableCell>
                              <Select
                                value={currentMapping || 'none'}
                                onValueChange={(value) => handleMappingChange(row.fullKey, value)}
                              >
                                <SelectTrigger className="bg-background h-8 text-sm">
                                  <SelectValue placeholder="Bitte wählen..." />
                                </SelectTrigger>
                                <SelectContent className="bg-background z-50 max-h-[300px]">
                                  <SelectItem value="none">
                                    <span className="text-muted-foreground">— Keine Zuordnung —</span>
                                  </SelectItem>
                                  {externalArticleOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-center">
                              {isMapped ? (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-xs">
                                  ✓
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-xs">
                                  ○
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading || !hasChanges}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Speichern...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Speichern
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExternalArticleMappingDialog;
