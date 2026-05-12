import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Download, AlertTriangle, Package } from 'lucide-react';
import { useExternalTeuniSets, ExternalTeuniSet } from '@/hooks/useExternalStammdaten';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LinenItemConfig } from '@/types/linen';
import { generateKeyFromLabel } from '@/lib/linenMigration';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  house: { id: string; name: string };
}

const guessCategory = (kategorie?: string | null): LinenItemConfig['category'] => {
  const k = (kategorie || '').toLowerCase();
  if (k.includes('bett') || k.includes('schlaf') || k.includes('kissen')) return 'Schlafbereich';
  if (k.includes('sauna') || k.includes('wellness')) return 'Wellness';
  if (k.includes('küche') || k.includes('kuec') || k.includes('geschirr')) return 'Küchenbereich';
  return 'Badbereich';
};

const setToCustomCategories = (set: ExternalTeuniSet): Record<string, LinenItemConfig> => {
  const result: Record<string, LinenItemConfig> = {};
  const usedKeys: string[] = [];

  for (const pos of set.positionen || []) {
    const key = generateKeyFromLabel(pos.name || pos.artikelnummer, usedKeys);
    usedKeys.push(key);
    result[key] = {
      key,
      label: pos.name,
      category: guessCategory(set.kategorie),
      quantity: Number(pos.menge) || 0,
      calculation_type:
        pos.berechnungsart === 'pro_person' || pos.berechnungsart === 'pro_gast'
          ? 'per_guest'
          : 'per_booking',
      availability: 'year_round',
      season: null,
      active: true,
      external_artikelnummer: { default: pos.artikelnummer },
    };
  }

  return result;
};

const TeuniSetTemplatesDialog = ({ open, onOpenChange, house }: Props) => {
  const queryClient = useQueryClient();
  const { data: sets, isLoading, error } = useExternalTeuniSets(open);
  const [selectedSet, setSelectedSet] = useState<ExternalTeuniSet | null>(null);
  const [confirmMode, setConfirmMode] = useState<'replace' | 'merge' | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const applySet = async (mode: 'replace' | 'merge') => {
    if (!selectedSet) return;
    setIsApplying(true);
    try {
      const newCats = setToCustomCategories(selectedSet);

      const { data: existing } = await supabase
        .from('linen_set_definitions')
        .select('id, custom_categories')
        .eq('house_id', house.id)
        .maybeSingle();

      const merged: Record<string, LinenItemConfig> =
        mode === 'merge' && existing?.custom_categories
          ? { ...(existing.custom_categories as unknown as Record<string, LinenItemConfig>), ...newCats }
          : newCats;

      const payload = {
        house_id: house.id,
        custom_categories: merged as any,
      };

      if (existing) {
        const { error: upErr } = await supabase
          .from('linen_set_definitions')
          .update({ custom_categories: merged as any })
          .eq('house_id', house.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await supabase
          .from('linen_set_definitions')
          .insert(payload);
        if (insErr) throw insErr;
      }

      await queryClient.invalidateQueries({ queryKey: ['linen-definitions'] });
      toast({
        title: 'Set übernommen',
        description: `"${selectedSet.name}" wurde für ${house.name} ${mode === 'merge' ? 'zusammengeführt' : 'übernommen'}.`,
      });
      setSelectedSet(null);
      setConfirmMode(null);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler beim Übernehmen',
        description: e?.message || 'Unbekannter Fehler',
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[800px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Teuni Wäschesets übernehmen für {house.name}
            </DialogTitle>
          </DialogHeader>

          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Vorlagen konnten nicht geladen werden: {(error as Error).message}
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && !error && (sets?.length ?? 0) === 0 && (
            <Alert>
              <AlertDescription>Es sind keine Teuni-Vorlagen verfügbar.</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            {sets?.map((set) => (
              <Card key={set.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{set.name}</CardTitle>
                      {set.beschreibung && (
                        <p className="text-xs text-muted-foreground mt-1">{set.beschreibung}</p>
                      )}
                      {set.kategorie && (
                        <Badge variant="outline" className="mt-2 text-xs">{set.kategorie}</Badge>
                      )}
                    </div>
                    <Button size="sm" onClick={() => setSelectedSet(set)} className="shrink-0">
                      <Download className="h-4 w-4 mr-1" />
                      Übernehmen
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xs text-muted-foreground mb-1">
                    {set.positionen?.length ?? 0} Positionen
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                    {set.positionen?.map((p, i) => (
                      <div key={i} className="flex justify-between gap-2 border-b py-1">
                        <span className="truncate">{p.name}</span>
                        <span className="text-muted-foreground shrink-0">
                          {p.menge}× {p.berechnungsart === 'pro_person' || p.berechnungsart === 'pro_gast' ? '/Gast' : '/Buchung'}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!selectedSet} onOpenChange={(o) => !o && setSelectedSet(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set übernehmen: {selectedSet?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Wie sollen die {selectedSet?.positionen?.length ?? 0} Positionen für{' '}
              <strong>{house.name}</strong> übernommen werden?
              <br /><br />
              <strong>Ersetzen:</strong> bestehende Wäscheset-Regeln werden komplett ersetzt.<br />
              <strong>Zusammenführen:</strong> bestehende Regeln bleiben, neue werden ergänzt/überschrieben.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap gap-2">
            <AlertDialogCancel disabled={isApplying}>Abbrechen</AlertDialogCancel>
            <Button variant="outline" disabled={isApplying} onClick={() => applySet('merge')}>
              {isApplying && confirmMode === 'merge' && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Zusammenführen
            </Button>
            <AlertDialogAction disabled={isApplying} onClick={() => applySet('replace')}>
              {isApplying && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Ersetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TeuniSetTemplatesDialog;
