import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, AlertTriangle, Download, Trash2, Package } from 'lucide-react';
import {
  useExternalArticles,
  useExternalTeuniSets,
  ExternalArticle,
  ExternalTeuniSet,
} from '@/hooks/useExternalStammdaten';
import { supabase } from '@/integrations/supabase/client';
import { LinenItemConfig } from '@/types/linen';
import { generateKeyFromLabel } from '@/lib/linenMigration';
import { toast } from '@/hooks/use-toast';

interface Props {
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

const loadExisting = async (houseId: string) => {
  const { data } = await supabase
    .from('linen_set_definitions')
    .select('id, custom_categories')
    .eq('house_id', houseId)
    .maybeSingle();
  return data;
};

const persistCustomCategories = async (
  houseId: string,
  custom: Record<string, LinenItemConfig>,
) => {
  const existing = await loadExisting(houseId);
  if (existing) {
    const { error } = await supabase
      .from('linen_set_definitions')
      .update({ custom_categories: custom as any })
      .eq('house_id', houseId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('linen_set_definitions')
      .insert({ house_id: houseId, custom_categories: custom as any });
    if (error) throw error;
  }
};

const TeuniArticlesTab = ({ house }: Props) => {
  const qc = useQueryClient();
  const { data: articles, isLoading, error } = useExternalArticles({});
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [rowState, setRowState] = useState<Record<string, { qty: number; calc: 'per_guest' | 'per_booking' }>>({});
  const [adding, setAdding] = useState<string | null>(null);

  // Existing items in the house, indexed by external_artikelnummer.default
  const [existingByArt, setExistingByArt] = useState<Record<string, string>>({});

  // Load current custom_categories once
  useMemo(() => {
    (async () => {
      const ex = await loadExisting(house.id);
      const cats = ((ex?.custom_categories ?? {}) as unknown) as Record<string, LinenItemConfig>;
      const map: Record<string, string> = {};
      Object.entries(cats).forEach(([k, v]) => {
        const art = v?.external_artikelnummer?.default;
        if (art) map[art] = k;
      });
      setExistingByArt(map);
    })();
  }, [house.id]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    (articles || []).forEach(a => a.kategorie && set.add(a.kategorie));
    return Array.from(set).sort();
  }, [articles]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (articles || []).filter(a => {
      if (categoryFilter !== 'all' && a.kategorie !== categoryFilter) return false;
      if (!term) return true;
      return [a.artikelnummer, a.name, a.bezeichnung, a.farbe, a.groesse]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(term));
    });
  }, [articles, search, categoryFilter]);

  const handleAdd = async (a: ExternalArticle) => {
    setAdding(a.artikelnummer);
    try {
      const ex = await loadExisting(house.id);
      const current = ((ex?.custom_categories ?? {}) as unknown) as Record<string, LinenItemConfig>;
      const usedKeys = Object.keys(current);
      const key = generateKeyFromLabel(a.name || a.artikelnummer, usedKeys);
      const state = rowState[a.artikelnummer] || { qty: 1, calc: 'per_guest' };
      const newItem: LinenItemConfig = {
        key,
        label: a.name,
        category: guessCategory(a.kategorie),
        quantity: state.qty || 1,
        calculation_type: state.calc,
        availability: 'year_round',
        season: null,
        active: true,
        external_artikelnummer: { default: a.artikelnummer },
      };
      const next = { ...current, [key]: newItem };
      await persistCustomCategories(house.id, next);
      setExistingByArt(prev => ({ ...prev, [a.artikelnummer]: key }));
      qc.invalidateQueries({ queryKey: ['linen-definitions'] });
      toast({ title: 'Artikel hinzugefügt', description: `${a.name} wurde übernommen.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e?.message || 'Unbekannter Fehler' });
    } finally {
      setAdding(null);
    }
  };

  const handleRemove = async (artikelnummer: string) => {
    const key = existingByArt[artikelnummer];
    if (!key) return;
    setAdding(artikelnummer);
    try {
      const ex = await loadExisting(house.id);
      const current = ((ex?.custom_categories ?? {}) as unknown) as Record<string, LinenItemConfig>;
      const { [key]: _removed, ...rest } = current;
      await persistCustomCategories(house.id, rest);
      setExistingByArt(prev => {
        const n = { ...prev };
        delete n[artikelnummer];
        return n;
      });
      qc.invalidateQueries({ queryKey: ['linen-definitions'] });
      toast({ title: 'Artikel entfernt' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e?.message || 'Unbekannter Fehler' });
    } finally {
      setAdding(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Teuni-Artikel konnten nicht geladen werden: {(error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="Suche nach Artikelnr., Name, Farbe..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="sm:max-w-sm"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kategorien</SelectItem>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground self-center ml-auto">
          {filtered.length} von {articles?.length ?? 0} Artikeln
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">ArtikelNr</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[120px]">Kategorie</TableHead>
              <TableHead className="w-[90px]">Farbe</TableHead>
              <TableHead className="w-[80px]">Größe</TableHead>
              <TableHead className="w-[80px] text-right">Preis</TableHead>
              <TableHead className="w-[80px]">Menge</TableHead>
              <TableHead className="w-[140px]">Berechnung</TableHead>
              <TableHead className="w-[120px] text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(a => {
              const isAdded = !!existingByArt[a.artikelnummer];
              const state = rowState[a.artikelnummer] || { qty: 1, calc: 'per_guest' as const };
              return (
                <TableRow key={a.artikelnummer}>
                  <TableCell className="font-mono text-xs">{a.artikelnummer}</TableCell>
                  <TableCell>
                    <div className="font-medium">{a.name}</div>
                    {a.bezeichnung && (
                      <div className="text-xs text-muted-foreground">{a.bezeichnung}</div>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{a.kategorie || '–'}</Badge></TableCell>
                  <TableCell className="text-xs">{a.farbe || '–'}</TableCell>
                  <TableCell className="text-xs">{a.groesse || '–'}</TableCell>
                  <TableCell className="text-right text-xs">
                    {a.preis != null ? `${Number(a.preis).toFixed(2)} €` : '–'}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={state.qty}
                      disabled={isAdded}
                      onChange={e => setRowState(prev => ({
                        ...prev,
                        [a.artikelnummer]: { ...state, qty: parseInt(e.target.value) || 1 },
                      }))}
                      className="w-16"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={state.calc}
                      disabled={isAdded}
                      onValueChange={(v) => setRowState(prev => ({
                        ...prev,
                        [a.artikelnummer]: { ...state, calc: v as 'per_guest' | 'per_booking' },
                      }))}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_guest">pro Gast</SelectItem>
                        <SelectItem value="per_booking">pro Buchung</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdded ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={adding === a.artikelnummer}
                        onClick={() => handleRemove(a.artikelnummer)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={adding === a.artikelnummer}
                        onClick={() => handleAdd(a)}
                      >
                        {adding === a.artikelnummer
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <><Plus className="w-4 h-4 mr-1" />Hinzufügen</>}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                  Keine Artikel gefunden.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

const TeuniSetsTab = ({ house }: Props) => {
  const qc = useQueryClient();
  const { data: sets, isLoading, error } = useExternalTeuniSets(true);
  const [selectedSet, setSelectedSet] = useState<ExternalTeuniSet | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const applySet = async (mode: 'replace' | 'merge') => {
    if (!selectedSet) return;
    setIsApplying(true);
    try {
      const newCats = setToCustomCategories(selectedSet);
      const ex = await loadExisting(house.id);
      const current = ((ex?.custom_categories ?? {}) as unknown) as Record<string, LinenItemConfig>;
      const merged = mode === 'merge' ? { ...current, ...newCats } : newCats;
      await persistCustomCategories(house.id, merged);
      qc.invalidateQueries({ queryKey: ['linen-definitions'] });
      toast({
        title: 'Set übernommen',
        description: `"${selectedSet.name}" wurde ${mode === 'merge' ? 'zusammengeführt' : 'übernommen'}.`,
      });
      setSelectedSet(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Fehler', description: e?.message || 'Unbekannter Fehler' });
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Teuni-Sets konnten nicht geladen werden: {(error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }
  if (!sets || sets.length === 0) {
    return <Alert><AlertDescription>Es sind keine Teuni-Vorlagen verfügbar.</AlertDescription></Alert>;
  }

  return (
    <>
      <div className="space-y-3">
        {sets.map(set => (
          <Card key={set.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    {set.name}
                  </CardTitle>
                  {set.beschreibung && (
                    <p className="text-xs text-muted-foreground mt-1">{set.beschreibung}</p>
                  )}
                  {set.kategorie && (
                    <Badge variant="outline" className="mt-2 text-xs">{set.kategorie}</Badge>
                  )}
                </div>
                <Button size="sm" onClick={() => setSelectedSet(set)} className="shrink-0">
                  <Download className="h-4 w-4 mr-1" />Übernehmen
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
              {isApplying && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Zusammenführen
            </Button>
            <AlertDialogAction disabled={isApplying} onClick={() => applySet('replace')}>
              {isApplying && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Ersetzen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const TeuniSourcePanel = ({ house }: Props) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Teuni Wäscheartikel & -sets</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="articles">
          <TabsList>
            <TabsTrigger value="articles">Artikel</TabsTrigger>
            <TabsTrigger value="sets">Sets</TabsTrigger>
          </TabsList>
          <TabsContent value="articles" className="mt-4">
            <TeuniArticlesTab house={house} />
          </TabsContent>
          <TabsContent value="sets" className="mt-4">
            <TeuniSetsTab house={house} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default TeuniSourcePanel;
