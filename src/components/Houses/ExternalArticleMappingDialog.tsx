import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, AlertTriangle, CheckCircle2, Link2 } from 'lucide-react';
import { useExternalArticleMapping } from '@/hooks/useExternalArticleMapping';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { translateItemType } from '@/lib/linenOrderHelpers';

interface ExternalArticleMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

  // Extract all unique item keys from linen set definitions
  const allItemKeys = (() => {
    const keys = new Set<string>();
    
    // Add standard items
    const standardItems = [
      'bedding', 'large_towels', 'small_towels', 'bath_mats', 
      'sink_towels', 'sauna_towels', 'kitchen_towels',
      'pillow_cases', 'spannbetttuch', 'blankets'
    ];
    standardItems.forEach(k => keys.add(k));

    // Add custom items from definitions
    if (linenDefs?.custom_categories) {
      const customCats = linenDefs.custom_categories as Record<string, any>;
      Object.keys(customCats).forEach(k => keys.add(k));
    }

    return Array.from(keys).sort();
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
    const mappingsToSave = allItemKeys
      .filter(key => localMappings[key]?.trim())
      .map(key => ({
        internal_item_key: key,
        external_artikelnummer: localMappings[key].trim()
      }));

    await saveMappings(mappingsToSave);
    onOpenChange(false);
  };

  const unmappedCount = allItemKeys.filter(k => !localMappings[k]?.trim()).length;
  const mappedCount = allItemKeys.length - unmappedCount;

  const isLoading = isMappingsLoading || isDefsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
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
            <Alert className={unmappedCount > 0 ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-green-500 bg-green-50 dark:bg-green-950/30'}>
              <AlertDescription className="flex items-center gap-2">
                {unmappedCount > 0 ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-amber-800 dark:text-amber-200">
                      {unmappedCount} von {allItemKeys.length} Artikeln sind noch nicht zugeordnet
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

            <div className="space-y-3 mt-4">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-sm font-medium text-muted-foreground px-1">
                <span>Interner Artikel</span>
                <span>→</span>
                <span>Externe Artikelnummer</span>
              </div>

              {allItemKeys.map((itemKey) => {
                const isMapped = !!localMappings[itemKey]?.trim();
                return (
                  <div 
                    key={itemKey} 
                    className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{translateItemType(itemKey)}</span>
                      {isMapped ? (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                          ✓
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                          fehlt
                        </Badge>
                      )}
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <Input
                      value={localMappings[itemKey] || ''}
                      onChange={(e) => setLocalMappings(prev => ({
                        ...prev,
                        [itemKey]: e.target.value
                      }))}
                      placeholder="z.B. WA001"
                      className="bg-background"
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Hinweis:</strong> Die externen Artikelnummern müssen mit den 
                Artikelnummern im Wäscheportal übereinstimmen (z.B. WA001, WA002, ...).
                Nicht zugeordnete Artikel werden bei der Synchronisation übersprungen.
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
