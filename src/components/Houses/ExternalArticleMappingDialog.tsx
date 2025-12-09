import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Save, AlertTriangle, CheckCircle2, Link2, RefreshCw, Wifi, WifiOff, Pencil } from 'lucide-react';
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

// Fixed categories
const LINEN_CATEGORIES = [
  { value: 'Schlafbereich', label: '🛏️ Schlafbereich' },
  { value: 'Badbereich', label: '🛁 Badbereich' },
  { value: 'Wellness', label: '🧖 Wellness' },
  { value: 'Küchenbereich', label: '🍳 Küchenbereich' },
];

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
  const queryClient = useQueryClient();
  const { mappings, isLoading: isMappingsLoading, saveMappings, isSaving } = useExternalArticleMapping();
  const [localMappings, setLocalMappings] = useState<Record<string, string>>({});
  const [localLabels, setLocalLabels] = useState<Record<string, string>>({});
  const [localCategories, setLocalCategories] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load all linen items from linen_set_definitions
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
    enabled: open,
    staleTime: 0,
  });

  // Extract all unique item keys with category info
  const allItems = (() => {
    const items: { key: string; label: string; category: string }[] = [];
    
    // Add from custom_categories if available
    if (linenDefs?.custom_categories) {
      const customCats = linenDefs.custom_categories as Record<string, any>;
      Object.entries(customCats).forEach(([key, value]) => {
        items.push({
          key,
          label: value?.label || translateItemType(key),
          category: value?.category || 'Sonstiges'
        });
      });
    } else {
      // Fallback to standard items
      const standardItems: Record<string, { label: string; category: string }> = {
        'bedding': { label: 'Bettwäsche', category: 'Schlafbereich' },
        'pillow_cases': { label: 'Kopfkissen', category: 'Schlafbereich' },
        'spannbetttuch': { label: 'Spannbetttücher', category: 'Schlafbereich' },
        'large_towels': { label: 'Badetücher', category: 'Badbereich' },
        'small_towels': { label: 'Handtücher', category: 'Badbereich' },
        'bath_mats': { label: 'Badvorleger', category: 'Badbereich' },
        'sink_towels': { label: 'WB-Handtücher', category: 'Badbereich' },
        'sauna_towels': { label: 'Saunahandtücher', category: 'Wellness' },
        'kitchen_towels': { label: 'Geschirrtücher', category: 'Küchenbereich' },
      };
      Object.entries(standardItems).forEach(([key, data]) => {
        items.push({ key, ...data });
      });
    }

    // Sort by category then key
    return items.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.key.localeCompare(b.key);
    });
  })();

  // Initialize local state when dialog opens
  useEffect(() => {
    if (open && mappings) {
      const initialMappings: Record<string, string> = {};
      for (const m of mappings) {
        initialMappings[m.internal_item_key] = m.external_artikelnummer;
      }
      setLocalMappings(initialMappings);
      
      // Initialize labels and categories from linenDefs
      const initialLabels: Record<string, string> = {};
      const initialCategories: Record<string, string> = {};
      
      if (linenDefs?.custom_categories) {
        const customCats = linenDefs.custom_categories as Record<string, any>;
        Object.entries(customCats).forEach(([key, value]) => {
          initialLabels[key] = value?.label || '';
          initialCategories[key] = value?.category || '';
        });
      }
      
      setLocalLabels(initialLabels);
      setLocalCategories(initialCategories);
      setHasChanges(false);
    }
  }, [open, mappings, linenDefs]);

  const handleLabelChange = (key: string, value: string) => {
    setLocalLabels(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleCategoryChange = (key: string, value: string) => {
    setLocalCategories(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleMappingChange = (key: string, value: string) => {
    setLocalMappings(prev => ({ ...prev, [key]: value === 'none' ? '' : value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      // 1. Save external article mappings
      const mappingsToSave = allItems
        .filter(item => localMappings[item.key]?.trim())
        .map(item => ({
          internal_item_key: item.key,
          external_artikelnummer: localMappings[item.key].trim()
        }));

      await saveMappings(mappingsToSave);

      // 2. Update custom_categories in linen_set_definitions
      if (linenDefs?.id) {
        const currentCustomCategories = (linenDefs.custom_categories || {}) as Record<string, any>;
        const updatedCustomCategories = { ...currentCustomCategories };

        // Update labels and categories
        for (const item of allItems) {
          if (updatedCustomCategories[item.key]) {
            if (localLabels[item.key]) {
              updatedCustomCategories[item.key].label = localLabels[item.key];
            }
            if (localCategories[item.key]) {
              updatedCustomCategories[item.key].category = localCategories[item.key];
            }
          }
        }

        const { error: updateError } = await supabase
          .from('linen_set_definitions')
          .update({ custom_categories: updatedCustomCategories })
          .eq('id', linenDefs.id);

        if (updateError) {
          console.error('Error updating custom_categories:', updateError);
          toast({
            variant: "destructive",
            title: "Fehler beim Speichern",
            description: "Artikelbezeichnungen konnten nicht gespeichert werden.",
          });
          return;
        }

        // Invalidate all related queries to refresh UI everywhere
        await queryClient.invalidateQueries({ queryKey: ['linen-set-definitions'] });
        await queryClient.invalidateQueries({ queryKey: ['linen-set-definitions-all'] });
        await queryClient.invalidateQueries({ queryKey: ['linen-set-definition'] });
        
        toast({
          title: "Erfolgreich gespeichert",
          description: "Artikelbezeichnungen und Mappings wurden aktualisiert.",
        });
      }

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

  const unmappedCount = allItems.filter(item => !localMappings[item.key]?.trim()).length;
  const mappedCount = allItems.length - unmappedCount;

  const isLoading = isMappingsLoading || isDefsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Artikelbezeichnungen & Zuordnung
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

            {/* Info about editable fields */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                <strong>Tipp:</strong> Sie können die internen Artikelbezeichnungen und Kategorien direkt bearbeiten. 
                Änderungen werden systemweit übernommen.
              </p>
            </div>

            {/* Mapping Table */}
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Interne Bezeichnung</TableHead>
                    <TableHead className="w-[150px]">Kategorie</TableHead>
                    <TableHead className="w-[40px] text-center">→</TableHead>
                    <TableHead>Externer Artikel</TableHead>
                    <TableHead className="w-[60px] text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allItems.map((item) => {
                    const isMapped = !!localMappings[item.key]?.trim();
                    const currentMapping = localMappings[item.key] || '';
                    const currentLabel = localLabels[item.key] || item.label;
                    const currentCategory = localCategories[item.key] || item.category;
                    const labelChanged = localLabels[item.key] && localLabels[item.key] !== item.label;
                    const categoryChanged = localCategories[item.key] && localCategories[item.key] !== item.category;
                    
                    return (
                      <TableRow key={item.key} className={labelChanged || categoryChanged ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}>
                        <TableCell>
                          <Input
                            value={currentLabel}
                            onChange={(e) => handleLabelChange(item.key, e.target.value)}
                            className={`h-8 text-sm ${labelChanged ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30' : ''}`}
                            placeholder={translateItemType(item.key)}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={currentCategory}
                            onValueChange={(value) => handleCategoryChange(item.key, value)}
                          >
                            <SelectTrigger className={`h-8 text-sm ${categoryChanged ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30' : ''}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-background z-50">
                              {LINEN_CATEGORIES.map((cat) => (
                                <SelectItem key={cat.value} value={cat.value}>
                                  {cat.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">→</TableCell>
                        <TableCell>
                          <Select
                            value={currentMapping}
                            onValueChange={(value) => handleMappingChange(item.key, value)}
                          >
                            <SelectTrigger className="bg-background h-8 text-sm">
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
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
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