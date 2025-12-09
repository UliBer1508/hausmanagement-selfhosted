import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, AlertTriangle, CheckCircle2, Link2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useExternalArticleMapping } from '@/hooks/useExternalArticleMapping';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { translateItemType } from '@/lib/linenOrderHelpers';
import { externalLaundryClient, ExternalWaescheArtikel } from '@/integrations/externalLaundry/client';

interface ExternalArticleMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Category icons
const getCategoryIcon = (category?: string) => {
  switch (category) {
    case 'Schlafbereich': return '🛏️';
    case 'Badbereich': return '🛁';
    case 'Wellness': return '🧖';
    case 'Küchenbereich': return '🍳';
    default: return '📦';
  }
};

const ExternalArticleMappingDialog = ({ open, onOpenChange }: ExternalArticleMappingDialogProps) => {
  const { mappings, isLoading: isMappingsLoading, saveMappings, isSaving } = useExternalArticleMapping();
  const [localMappings, setLocalMappings] = useState<Record<string, string>>({});

  // Load all linen items from linen_set_definitions
  const { data: linenDefs, isLoading: isDefsLoading } = useQuery({
    queryKey: ['linen-set-definitions-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('custom_categories')
        .limit(1)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  // Load external articles directly from external Supabase
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
    enabled: open, // Only load when dialog is open
    staleTime: 0,  // Always fresh
  });

  // Extract all unique item keys with category info
  const allItems = (() => {
    const items: { key: string; category: string }[] = [];
    
    // Add standard items with default categories
    const standardItems: Record<string, string> = {
      'bedding': 'Schlafbereich',
      'pillow_cases': 'Schlafbereich',
      'spannbetttuch': 'Schlafbereich',
      'blankets': 'Schlafbereich',
      'large_towels': 'Badbereich',
      'small_towels': 'Badbereich',
      'bath_mats': 'Badbereich',
      'sink_towels': 'Badbereich',
      'sauna_towels': 'Wellness',
      'kitchen_towels': 'Küchenbereich',
    };

    // Add from custom_categories if available
    if (linenDefs?.custom_categories) {
      const customCats = linenDefs.custom_categories as Record<string, any>;
      Object.entries(customCats).forEach(([key, value]) => {
        items.push({
          key,
          category: value?.category || 'Sonstiges'
        });
      });
    } else {
      // Fallback to standard items
      Object.entries(standardItems).forEach(([key, category]) => {
        items.push({ key, category });
      });
    }

    // Sort by category then key
    return items.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.key.localeCompare(b.key);
    });
  })();

  // Initialize local mappings when dialog opens
  useEffect(() => {
    if (open && mappings) {
      const initial: Record<string, string> = {};
      for (const m of mappings) {
        initial[m.internal_item_key] = m.external_artikelnummer;
      }
      setLocalMappings(initial);
    }
  }, [open, mappings]);

  const handleSave = async () => {
    const mappingsToSave = allItems
      .filter(item => localMappings[item.key]?.trim())
      .map(item => ({
        internal_item_key: item.key,
        external_artikelnummer: localMappings[item.key].trim()
      }));

    await saveMappings(mappingsToSave);
    onOpenChange(false);
  };

  const unmappedCount = allItems.filter(item => !localMappings[item.key]?.trim()).length;
  const mappedCount = allItems.length - unmappedCount;

  const isLoading = isMappingsLoading || isDefsLoading;

  // Format external article for dropdown display
  const formatExternalArticle = (article: ExternalWaescheArtikel) => {
    const parts = [article.artikelnummer];
    if (article.name) parts.push(article.name);
    if (article.farbe) parts.push(`(${article.farbe})`);
    return parts.join(' - ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Externe Artikel-Zuordnung
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
                      {unmappedCount} von {allItems.length} Artikeln sind noch nicht zugeordnet
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-green-800 dark:text-green-200">
                      Alle {mappedCount} Artikel sind zugeordnet
                    </span>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {/* Mapping Table */}
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Interner Artikel</TableHead>
                    <TableHead className="w-[120px]">Kategorie</TableHead>
                    <TableHead className="w-[40px] text-center">→</TableHead>
                    <TableHead>Externer Artikel</TableHead>
                    <TableHead className="w-[80px] text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allItems.map((item) => {
                    const isMapped = !!localMappings[item.key]?.trim();
                    const currentMapping = localMappings[item.key] || '';
                    
                    return (
                      <TableRow key={item.key}>
                        <TableCell className="font-medium">
                          {translateItemType(item.key)}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {getCategoryIcon(item.category)} {item.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">→</TableCell>
                        <TableCell>
                          <Select
                            value={currentMapping}
                            onValueChange={(value) => setLocalMappings(prev => ({
                              ...prev,
                              [item.key]: value === 'none' ? '' : value
                            }))}
                          >
                            <SelectTrigger className="bg-background">
                              <SelectValue placeholder="Bitte wählen..." />
                            </SelectTrigger>
                            <SelectContent className="bg-background z-50 max-h-[300px]">
                              <SelectItem value="none">
                                <span className="text-muted-foreground">— Keine Zuordnung —</span>
                              </SelectItem>
                              {externalArticles?.map((article) => (
                                <SelectItem key={article.artikelnummer} value={article.artikelnummer}>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs bg-muted px-1 rounded">
                                      {article.artikelnummer}
                                    </span>
                                    <span>{article.name || 'Unbenannt'}</span>
                                    {article.farbe && (
                                      <span className="text-muted-foreground text-xs">
                                        ({article.farbe})
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
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                              ✓
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                              fehlt
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Info Box */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Hinweis:</strong> Wählen Sie für jeden internen Artikel den entsprechenden 
                Artikel aus dem externen Wäscheportal. Nicht zugeordnete Artikel werden bei der 
                Synchronisation übersprungen.
              </p>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Speichere...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Mapping speichern
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExternalArticleMappingDialog;
