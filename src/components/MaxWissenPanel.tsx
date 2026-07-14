import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw,
  Loader2,
  Brain,
  Pencil,
  Save,
  X,
  Plus,
  Trash2,
} from 'lucide-react';

interface MaxWissenPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Wissen {
  id: string;
  term: string;
  meaning: string;
  category: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * Pflegefenster für Max' gelerntes Wissen (Tabelle assistant_knowledge).
 *
 * WARUM (14.07.2026):
 * Max konnte über das Tool save_knowledge selbst dazulernen — aber es gab KEINE
 * Möglichkeit, das Gelernte zu korrigieren, zu deaktivieren oder zu löschen.
 * Ein falsch verstandener Begriff blieb dauerhaft im System-Prompt und
 * beeinflusste jede Antwort.
 *
 * Dieses Panel schließt die Lücke: anlegen, bearbeiten, ein-/ausschalten, löschen.
 *
 * Aufbau bewusst analog zu MaxAblaeufePanel.tsx (gleiche Bedienlogik).
 */

// Kategorien, die Max beim Lernen vergibt. Freitext bleibt möglich.
const KATEGORIEN = ['begriff', 'regel', 'dienstleister', 'haus', 'sonstiges'];

const KATEGORIE_FARBE: Record<string, string> = {
  regel: 'bg-amber-100 text-amber-800 border-amber-200',
  begriff: 'bg-blue-100 text-blue-800 border-blue-200',
  dienstleister: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  haus: 'bg-violet-100 text-violet-800 border-violet-200',
};

const MaxWissenPanel = ({ open, onOpenChange }: MaxWissenPanelProps) => {
  const { toast } = useToast();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTerm, setEditTerm] = useState('');
  const [editMeaning, setEditMeaning] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [loeschId, setLoeschId] = useState<string | null>(null);

  // Neuer Eintrag
  const [neuOffen, setNeuOffen] = useState(false);
  const [neuTerm, setNeuTerm] = useState('');
  const [neuMeaning, setNeuMeaning] = useState('');
  const [neuCategory, setNeuCategory] = useState('begriff');

  const { data: eintraege, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['assistant-knowledge'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assistant_knowledge')
        .select('*')
        .order('category')
        .order('term');
      if (error) throw error;
      return (data || []) as Wissen[];
    },
    enabled: open,
  });

  const anlegen = async () => {
    if (!neuTerm.trim() || !neuMeaning.trim()) {
      toast({
        title: 'Bitte ausfüllen',
        description: 'Begriff und Bedeutung dürfen nicht leer sein.',
        variant: 'destructive',
      });
      return;
    }
    setSavingId('neu');
    const { error } = await supabase.from('assistant_knowledge').insert({
      term: neuTerm.trim(),
      meaning: neuMeaning.trim(),
      category: neuCategory.trim() || null,
      is_active: true,
    });
    setSavingId(null);

    if (error) {
      console.error('[MaxWissenPanel] Anlegen fehlgeschlagen', error);
      toast({
        title: 'Konnte nicht gespeichert werden',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setNeuTerm('');
    setNeuMeaning('');
    setNeuCategory('begriff');
    setNeuOffen(false);
    toast({ title: 'Gespeichert', description: 'Max kennt den Begriff ab sofort.' });
    refetch();
  };

  const speichern = async (id: string) => {
    if (!editTerm.trim() || !editMeaning.trim()) {
      toast({
        title: 'Bitte ausfüllen',
        description: 'Begriff und Bedeutung dürfen nicht leer sein.',
        variant: 'destructive',
      });
      return;
    }
    setSavingId(id);
    const { error } = await supabase
      .from('assistant_knowledge')
      .update({
        term: editTerm.trim(),
        meaning: editMeaning.trim(),
        category: editCategory.trim() || null,
      })
      .eq('id', id);
    setSavingId(null);

    if (error) {
      console.error('[MaxWissenPanel] Speichern fehlgeschlagen', error);
      toast({
        title: 'Konnte nicht gespeichert werden',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    setEditId(null);
    toast({ title: 'Gespeichert' });
    refetch();
  };

  const umschalten = async (id: string, aktiv: boolean) => {
    setSavingId(id);
    const { error } = await supabase
      .from('assistant_knowledge')
      .update({ is_active: aktiv })
      .eq('id', id);
    setSavingId(null);

    if (error) {
      console.error('[MaxWissenPanel] Umschalten fehlgeschlagen', error);
      toast({
        title: 'Konnte nicht geändert werden',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: aktiv ? 'Aktiv' : 'Deaktiviert',
      description: aktiv
        ? 'Max beachtet diesen Eintrag wieder.'
        : 'Max beachtet diesen Eintrag nicht mehr.',
    });
    refetch();
  };

  const loeschen = async (id: string) => {
    setSavingId(id);
    const { error } = await supabase.from('assistant_knowledge').delete().eq('id', id);
    setSavingId(null);
    setLoeschId(null);

    if (error) {
      console.error('[MaxWissenPanel] Löschen fehlgeschlagen', error);
      toast({
        title: 'Konnte nicht gelöscht werden',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Gelöscht' });
    refetch();
  };

  const editStarten = (e: Wissen) => {
    setEditId(e.id);
    setEditTerm(e.term);
    setEditMeaning(e.meaning);
    setEditCategory(e.category || '');
  };

  const zuLoeschen = eintraege?.find((e) => e.id === loeschId);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col z-[200]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Max: Gelerntes Wissen
              {eintraege && <Badge variant="secondary">{eintraege.length}</Badge>}
            </DialogTitle>
            <DialogDescription>
              Begriffe und Regeln, die Max bei jeder Antwort beachtet. Was hier steht,
              fließt direkt in seinen System-Prompt ein — ein falscher Eintrag
              beeinflusst jede Antwort. Deaktivierte Einträge werden ignoriert.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              onClick={() => setNeuOffen((v) => !v)}
              variant={neuOffen ? 'secondary' : 'default'}
            >
              {neuOffen ? (
                <>
                  <X className="mr-1 h-4 w-4" /> Abbrechen
                </>
              ) : (
                <>
                  <Plus className="mr-1 h-4 w-4" /> Neuer Eintrag
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Neuer Eintrag */}
          {neuOffen && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <Input
                placeholder='Begriff, z. B. "Teuni" oder "Wäsche anpassen"'
                value={neuTerm}
                onChange={(e) => setNeuTerm(e.target.value)}
              />
              <Textarea
                placeholder="Bedeutung / Regel — so, wie Max es verstehen soll"
                value={neuMeaning}
                onChange={(e) => setNeuMeaning(e.target.value)}
                rows={2}
              />
              <div className="flex items-center gap-2">
                <Input
                  className="max-w-[200px]"
                  placeholder="Kategorie"
                  list="wissen-kategorien"
                  value={neuCategory}
                  onChange={(e) => setNeuCategory(e.target.value)}
                />
                <datalist id="wissen-kategorien">
                  {KATEGORIEN.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
                <Button size="sm" onClick={anlegen} disabled={savingId === 'neu'}>
                  {savingId === 'neu' ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-4 w-4" />
                  )}
                  Speichern
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {isLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Wird geladen…
              </div>
            )}

            {!isLoading && (!eintraege || eintraege.length === 0) && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Max hat noch nichts gelernt. Du kannst ihm hier etwas beibringen —
                oder es ihm im Chat sagen, dann fragt er, ob er es sich merken soll.
              </p>
            )}

            {eintraege?.map((e) => (
              <div
                key={e.id}
                className={`rounded-lg border p-3 ${
                  e.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
                }`}
              >
                {editId === e.id ? (
                  <div className="space-y-2">
                    <Input
                      value={editTerm}
                      onChange={(ev) => setEditTerm(ev.target.value)}
                      placeholder="Begriff"
                    />
                    <Textarea
                      value={editMeaning}
                      onChange={(ev) => setEditMeaning(ev.target.value)}
                      rows={2}
                      placeholder="Bedeutung"
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        className="max-w-[200px]"
                        value={editCategory}
                        onChange={(ev) => setEditCategory(ev.target.value)}
                        placeholder="Kategorie"
                        list="wissen-kategorien"
                      />
                      <Button
                        size="sm"
                        onClick={() => speichern(e.id)}
                        disabled={savingId === e.id}
                      >
                        {savingId === e.id ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-1 h-4 w-4" />
                        )}
                        Speichern
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{e.term}</span>
                        {e.category && (
                          <Badge
                            variant="outline"
                            className={KATEGORIE_FARBE[e.category] || ''}
                          >
                            {e.category}
                          </Badge>
                        )}
                        {!e.is_active && (
                          <Badge variant="outline" className="text-muted-foreground">
                            inaktiv
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {e.meaning}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Switch
                        checked={e.is_active}
                        onCheckedChange={(v) => umschalten(e.id, v)}
                        disabled={savingId === e.id}
                        aria-label="Aktiv"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => editStarten(e)}
                        aria-label="Bearbeiten"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setLoeschId(e.id)}
                        aria-label="Löschen"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Löschen ist endgültig — deshalb nachfragen. */}
      <AlertDialog open={!!loeschId} onOpenChange={(o) => !o && setLoeschId(null)}>
        <AlertDialogContent className="z-[230]">
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {zuLoeschen && (
                <>
                  „<strong>{zuLoeschen.term}</strong>" wird endgültig entfernt. Max
                  beachtet es dann nicht mehr.
                  <br />
                  <br />
                  Falls du es nur vorübergehend abschalten willst, nutze stattdessen den
                  Schalter — dann bleibt der Eintrag erhalten.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => loeschId && loeschen(loeschId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MaxWissenPanel;
