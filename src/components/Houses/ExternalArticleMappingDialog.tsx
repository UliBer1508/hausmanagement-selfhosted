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
  
  // State: external_artikelnummer → internal_item_key
  const [localMappings, setLocalMappings] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load linen definitions for internal article options
  const { data: linenDefs, isLoading: isDefsLoading } = useQuery({
    queryKey: ['linen-set-definitions-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('id, house_id, custom_categories')
        .limit(1)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  // Load external articles from external Supabase
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
    staleTime: 0,
  });

  // Helper: Farblabels für Anzeige
  const getColorLabel = (colorKey: string): string => {
    const colorLabels: Record<string, string> = {
      'grey_striped': 'Grau gestreift',
      'white_striped': 'Weiß gestreift',
      'colorful': 'Bunt',
      'white': 'Weiß',
      'grey': 'Grau'
    };
    return colorLabels[colorKey] || colorKey;
  };

  // Build internal article options with color variants from external_artikelnummer
  const internalArticleOptions: { value: string; label: string; category?: string }[] = (() => {
    const options: { value: string; label: string; category?: string }[] = [];
    
    if (linenDefs?.custom_categories) {
      const customCats = linenDefs.custom_categories as Record<string, any>;
      Object.entries(customCats).forEach(([key, config]) => {
        const externalMappings = config?.external_artikelnummer || {};
        const articleLabel = config?.label || translateItemType(key);
        const category = config?.category;
        
        // Für jeden Farbschlüssel eine Option erstellen
        const colorKeys = Object.keys(externalMappings);
        if (colorKeys.length > 0) {
          colorKeys.forEach((colorKey) => {
            options.push({
              value: `${key}__${colorKey}`, // z.B. "bedding__grey_striped"
              label: `${articleLabel} - ${getColorLabel(colorKey)}`,
              category,
            });
          });
        } else {
          // Falls keine Farbmappings, Artikel ohne Farbe anzeigen
          options.push({
            value: key,
            label: articleLabel,
            category,
          });
        }
      });
    } else {
      // Fallback standard items
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

  const handleSave = async () => {
    try {
      // Convert back to DB format: internal_item_key → external_artikelnummer
      const mappingsToSave: { internal_item_key: string; external_artikelnummer: string }[] = [];
      
      Object.entries(localMappings).forEach(([externalArtikelnummer, internalKey]) => {
        if (internalKey?.trim()) {
          mappingsToSave.push({
            internal_item_key: internalKey,
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
                    {externalArticles?.length || 0} externe Artikel geladen
                  </Badge>
                )}
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => refetchExternal()}
                disabled={isLoadingExternal}
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingExternal ? 'animate-spin' : ''}`} />
              </Button>
            </div>

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
                    <TableHead>Interner Artikel</TableHead>
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
