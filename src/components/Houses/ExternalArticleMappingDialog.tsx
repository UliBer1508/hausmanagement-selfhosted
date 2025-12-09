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

interface ExternalArticleMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ExternalArticleMappingDialog = ({ open, onOpenChange }: ExternalArticleMappingDialogProps) => {
  const queryClient = useQueryClient();
  const { mappings, isLoading: isMappingsLoading, saveMappings, isSaving } = useExternalArticleMapping();
  
  // State: external_artikelnummer → internal_item_key (ohne Farbvarianten)
  const [localMappings, setLocalMappings] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load linen definitions for internal article options - dynamisch aus DB
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
    staleTime: 0, // Immer neu laden
  });

  // Load external articles from external Supabase - dynamisch
  const { 
    data: externalArticles, 
    isLoading: isLoadingExternal, 
    error: externalError,
    refetch: refetchExternal 
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
    enabled: open,
    staleTime: 0, // Immer neu laden
  });

  // Mapping: Externer Artikelname → Interner Key (mehrere Varianten pro Artikel)
  const externalNameToInternalKey: Record<string, string> = {
    'bettücher': 'bedding',
    'betttücher': 'bedding',
    'bettuecher': 'bedding',
    'betttuecher': 'bedding',
    'kopfkissen': 'pillow_cases',
    'spannbetttücher': 'spannbetttuch',
    'spannbetttuecher': 'spannbetttuch',
    'spannbettlaken': 'spannbetttuch',
    'badetücher': 'large_towels',
    'badetuecher': 'large_towels',
    'handtücher': 'small_towels',
    'handtuecher': 'small_towels',
    'badvorleger': 'bath_mats',
    'saunatücher': 'sauna_towels',
    'saunatuecher': 'sauna_towels',
    'geschirrtuch': 'kitchen_towels',
    'geschirrtücher': 'kitchen_towels',
    'geschirrtuecher': 'kitchen_towels',
  };

  // Normalisiere Farbe zu Key (z.B. "grau gestreift" → "grey_striped")
  const normalizeColorToKey = (farbe: string | null): string => {
    if (!farbe) return 'white';
    const lower = farbe.toLowerCase();
    if (lower.includes('grau') && lower.includes('gestreift')) return 'grey_striped';
    if (lower.includes('weiß') && lower.includes('gestreift')) return 'white_striped';
    if (lower.includes('grau')) return 'grey';
    if (lower.includes('weiß')) return 'white';
    if (lower.includes('bunt')) return 'colorful';
    return 'white';
  };

  // Hole internes Label aus custom_categories oder Fallback
  const getInternalLabel = (key: string): string => {
    if (linenDefs?.custom_categories) {
      const customCats = linenDefs.custom_categories as Record<string, any>;
      if (customCats[key]?.label) return customCats[key].label;
    }
    return translateItemType(key);
  };

  // Hole Kategorie aus custom_categories
  const getInternalCategory = (key: string): string | undefined => {
    if (linenDefs?.custom_categories) {
      const customCats = linenDefs.custom_categories as Record<string, any>;
      if (customCats[key]?.category) return customCats[key].category;
    }
    return undefined;
  };

  // Build internal article options MIT Farbvarianten aus externem Katalog
  const internalArticleOptions: { value: string; label: string; category?: string; color?: string }[] = (() => {
    const options: { value: string; label: string; category?: string; color?: string }[] = [];
    const seen = new Set<string>();
    
    if (externalArticles && externalArticles.length > 0) {
      externalArticles.forEach((ext) => {
        const nameLower = ext.name?.toLowerCase() || '';
        
        // Finde internen Key basierend auf externem Namen
        let internalKey: string | undefined;
        for (const [extName, intKey] of Object.entries(externalNameToInternalKey)) {
          if (nameLower.includes(extName)) {
            internalKey = intKey;
            break;
          }
        }
        
        if (internalKey && ext.farbe) {
          const colorKey = normalizeColorToKey(ext.farbe);
          const value = `${internalKey}__${colorKey}`;
          
          // Verhindere Duplikate
          if (!seen.has(value)) {
            seen.add(value);
            options.push({
              value,
              label: `${getInternalLabel(internalKey)} (${ext.farbe})`,
              category: getInternalCategory(internalKey),
              color: ext.farbe,
            });
          }
        }
      });
    }
    
    // Fallback: Einfache Artikel ohne Farben falls keine externen Artikel
    if (options.length === 0) {
      const standardItems: Record<string, { label: string; category: string }> = {
        'bedding': { label: 'Bettwäsche', category: 'Schlafbereich' },
        'pillow_cases': { label: 'Kopfkissen', category: 'Schlafbereich' },
        'spannbetttuch': { label: 'Spannbetttücher', category: 'Schlafbereich' },
        'large_towels': { label: 'Badetücher', category: 'Badbereich' },
        'small_towels': { label: 'Handtücher', category: 'Badbereich' },
        'bath_mats': { label: 'Badvorleger', category: 'Badbereich' },
        'sink_towels': { label: 'WB-Handtücher', category: 'Badbereich' },
        'sauna_towels': { label: 'Saunatücher', category: 'Wellness' },
        'kitchen_towels': { label: 'Geschirrtücher', category: 'Küchenbereich' },
      };
      Object.entries(standardItems).forEach(([key, data]) => {
        options.push({ value: key, label: data.label, category: data.category });
      });
    }
    
    return options.sort((a, b) => a.label.localeCompare(b.label));
  })();

  // Initialize local state when dialog opens
  // Convert from DB format (internal_item_key → external_artikelnummer) 
  // to UI format (external_artikelnummer → internal_item_key)
  useEffect(() => {
    if (open && mappings) {
      const reversedMappings: Record<string, string> = {};
      for (const m of mappings) {
        reversedMappings[m.external_artikelnummer] = m.internal_item_key;
      }
      setLocalMappings(reversedMappings);
      setHasChanges(false);
    }
  }, [open, mappings]);

  const handleMappingChange = (externalArtikelnummer: string, internalKey: string) => {
    setLocalMappings(prev => ({ 
      ...prev, 
      [externalArtikelnummer]: internalKey === 'none' ? '' : internalKey 
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
      // Convert back to DB format: internal_item_key → external_artikelnummer
      const mappingsToSave: { internal_item_key: string; external_artikelnummer: string }[] = [];
      
      Object.entries(localMappings).forEach(([externalArtikelnummer, internalKey]) => {
        if (internalKey?.trim()) {
          mappingsToSave.push({
            internal_item_key: internalKey, // Jetzt nur noch z.B. "bedding" ohne "__grey_striped"
            external_artikelnummer: externalArtikelnummer,
          });
        }
      });

      await saveMappings(mappingsToSave);

      // Invalidate queries
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
  const unmappedCount = (externalArticles?.length || 0) - mappedCount;

  const isLoading = isMappingsLoading || isDefsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Externe Artikel zu internen Artikeln zuordnen
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
                  {internalArticleOptions.length} interne Artikel
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
                Ordne jeden externen Artikel dem passenden internen Artikeltyp mit Farbe zu. 
                Die verfügbaren Farbvarianten werden aus dem externen Katalog geladen.
              </AlertDescription>
            </Alert>

            {/* Mapping Status */}
            <Alert className={unmappedCount > 0 ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-green-500 bg-green-50 dark:bg-green-950/30'}>
              <AlertDescription className="flex items-center gap-2">
                {unmappedCount > 0 ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-amber-800 dark:text-amber-200">
                      {unmappedCount} von {externalArticles?.length || 0} externen Artikeln sind noch nicht zugeordnet
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-green-800 dark:text-green-200">
                      Alle {mappedCount} externen Artikel sind zugeordnet
                    </span>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {/* Mapping Table - External Articles as primary list */}
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Art.-Nr.</TableHead>
                    <TableHead className="w-[180px]">Externer Artikel</TableHead>
                    <TableHead className="w-[120px]">Farbe</TableHead>
                    <TableHead className="w-[40px] text-center">→</TableHead>
                    <TableHead>Interner Artikeltyp</TableHead>
                    <TableHead className="w-[60px] text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {externalArticles?.map((extArticle) => {
                    const currentMapping = localMappings[extArticle.artikelnummer] || '';
                    const isMapped = !!currentMapping.trim();
                    
                    return (
                      <TableRow key={extArticle.artikelnummer}>
                        <TableCell>
                          <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                            {extArticle.artikelnummer}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          {extArticle.name || 'Unbenannt'}
                        </TableCell>
                        <TableCell>
                          {extArticle.farbe ? (
                            <Badge variant="outline" className="text-xs">
                              {extArticle.farbe}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">→</TableCell>
                        <TableCell>
                          <Select
                            value={currentMapping || 'none'}
                            onValueChange={(value) => handleMappingChange(extArticle.artikelnummer, value)}
                          >
                            <SelectTrigger className="bg-background h-8 text-sm">
                              <SelectValue placeholder="Bitte wählen..." />
                            </SelectTrigger>
                            <SelectContent className="bg-background z-50 max-h-[300px]">
                              <SelectItem value="none">
                                <span className="text-muted-foreground">— Keine Zuordnung —</span>
                              </SelectItem>
                              {internalArticleOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  <div className="flex items-center gap-2">
                                    <span>{option.label}</span>
                                    {option.category && (
                                      <span className="text-muted-foreground text-xs">
                                        ({option.category})
                                      </span>
                                    )}
                                  </div>
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
                Speichere...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Änderungen speichern
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExternalArticleMappingDialog;
