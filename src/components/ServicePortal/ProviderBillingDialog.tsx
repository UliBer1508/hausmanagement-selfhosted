import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getGuestName } from '@/lib/guestHelpers';
import { calculateCleaningCost, grossFromTask, formatEur } from '@/lib/cleaningCost';
import { LaundryInvoicesList } from './LaundryInvoicesList';
import { LaundryOrdersOverview } from './LaundryOrdersOverview';
import { TeuniOrdersOverview } from './TeuniOrdersOverview';

interface ProviderBillingDialogProps {
  provider: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProviderBillingDialog({ provider, open, onOpenChange }: ProviderBillingDialogProps) {
  const { data: billingData, isLoading } = useQuery<any[]>({
    queryKey: ['provider-billing', provider?.id],
    queryFn: async () => {
      if (!provider?.id) return [];
      
      // Direkte Abfrage über provider_id - nur abgeschlossene Aufträge
      const { data: tasks, error } = await supabase
        .from('service_tasks')
        .select(`
          id,
          scheduled_date,
          cleaning_cost,
          cleaning_hours,
          cleaning_vat_percentage,
          payment_status,
          status,
          houses:house_id (name),
          bookings:booking_id (guest_name, guests!bookings_guest_id_fkey(name))
        `)
        .eq('provider_id', provider.id)
        .eq('status', 'completed')
        .order('scheduled_date', { ascending: false });
      
      if (error) {
        console.error('Provider billing query error:', error);
        return [];
      }
      return tasks || [];
    },
    enabled: !!provider?.id && open
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  // Entwuerfe je Auftrag; Strings, damit das Feld beim Tippen leer sein darf.
  const [drafts, setDrafts] = useState<Record<string, { hours: string; net: string; vat: string }>>({});

  useEffect(() => {
    setEditMode(false);
    setDrafts({});
  }, [provider?.id, open]);

  const toStr = (v: any) => (v == null ? '' : String(v));

  const buildDrafts = (tasks: any[]) => {
    const next: Record<string, { hours: string; net: string; vat: string }> = {};
    for (const t of tasks) {
      next[t.id] = {
        hours: toStr(t.cleaning_hours),
        net: toStr(t.cleaning_cost),
        vat: toStr(t.cleaning_vat_percentage),
      };
    }
    return next;
  };

  const startEdit = () => {
    setDrafts(buildDrafts(billingData || []));
    setEditMode(true);
  };

  const setDraft = (id: string, field: 'hours' | 'net' | 'vat', value: string) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  /** Fuellt eine Zeile mit dem Ergebnis der hinterlegten Abrechnungsart. */
  const applyDefinition = (task: any) => {
    const hours = Number(drafts[task.id]?.hours) || task.cleaning_hours;
    const result = calculateCleaningCost(provider, hours);
    if (result.error) {
      toast({ title: 'Nicht berechenbar', description: result.error, variant: 'destructive' });
      return;
    }
    setDrafts((prev) => ({
      ...prev,
      [task.id]: {
        hours: toStr(hours),
        net: toStr(result.net),
        vat: toStr(result.vatPercentage),
      },
    }));
  };

  const applyDefinitionToAll = () => {
    const next = { ...drafts };
    let failed = 0;
    for (const t of billingData || []) {
      const hours = Number(next[t.id]?.hours) || t.cleaning_hours;
      const result = calculateCleaningCost(provider, hours);
      if (result.error) { failed++; continue; }
      next[t.id] = { hours: toStr(hours), net: toStr(result.net), vat: toStr(result.vatPercentage) };
    }
    setDrafts(next);
    if (failed > 0) {
      toast({
        title: 'Teilweise übernommen',
        description: `${failed} Auftrag/Aufträge konnten nicht berechnet werden.`,
        variant: 'destructive',
      });
    }
  };

  const numOrNull = (v: string) => {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  };

  /** Zeilen, die sich gegenueber der Datenbank unterscheiden. */
  const changedTasks = useMemo(() => {
    if (!editMode) return [];
    return (billingData || []).filter((t: any) => {
      const d = drafts[t.id];
      if (!d) return false;
      return (
        numOrNull(d.hours) !== (t.cleaning_hours == null ? null : Number(t.cleaning_hours)) ||
        numOrNull(d.net) !== (t.cleaning_cost == null ? null : Number(t.cleaning_cost)) ||
        numOrNull(d.vat) !== (t.cleaning_vat_percentage == null ? null : Number(t.cleaning_vat_percentage))
      );
    });
  }, [editMode, drafts, billingData]);

  /**
   * Bezahlstatus eines Auftrags per Klick umschalten.
   * 'paid' -> 'unpaid', alles andere ('unpaid', 'pending', null) -> 'paid'.
   * Ein zweiter Klick nimmt es zurueck; deshalb ohne Rueckfrage.
   */
  const paymentMutation = useMutation({
    mutationFn: async (task: any) => {
      const next = task.payment_status === 'paid' ? 'unpaid' : 'paid';

      const { data, error } = await supabase
        .from('service_tasks')
        .update({ payment_status: next, updated_at: new Date().toISOString() } as any)
        .eq('id', task.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          `Auftrag vom ${format(new Date(task.scheduled_date), 'dd.MM.yyyy')} wurde nicht geändert (keine Zeile betroffen).`
        );
      }
      return next;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ['provider-billing', provider?.id] });
      queryClient.invalidateQueries({ queryKey: ['cleaning-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['service_tasks'] });
      toast({
        title: next === 'paid' ? 'Als bezahlt markiert' : 'Als offen markiert',
        description: 'Der Bezahlstatus wurde gespeichert.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Bezahlstatus konnte nicht geändert werden.',
        variant: 'destructive',
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (changedTasks.length === 0) throw new Error('Keine Änderungen vorhanden.');
      let saved = 0;
      for (const task of changedTasks) {
        const d = drafts[task.id];
        const { data, error } = await supabase
          .from('service_tasks')
          .update({
            cleaning_hours: numOrNull(d.hours),
            cleaning_cost: numOrNull(d.net),
            cleaning_vat_percentage: numOrNull(d.vat),
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', task.id)
          .select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            `Auftrag vom ${format(new Date(task.scheduled_date), 'dd.MM.yyyy')} wurde nicht gespeichert (keine Zeile betroffen).`
          );
        }
        saved++;
      }
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['provider-billing', provider?.id] });
      queryClient.invalidateQueries({ queryKey: ['cleaning-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['service_tasks'] });
      setEditMode(false);
      setDrafts({});
      toast({ title: 'Gespeichert', description: `${saved} Auftrag/Aufträge geändert.` });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Speichern fehlgeschlagen.',
        variant: 'destructive',
      });
    },
  });

  // Gruppierung nach Payment Status
  const groupedData = useMemo(() => {
    if (!billingData) return [];
    
    const groups: {
      paid: { label: string; tasks: any[]; sum: number; grossSum: number; count: number; bgColor: string; textColor: string; borderColor: string };
      unpaid: { label: string; tasks: any[]; sum: number; grossSum: number; count: number; bgColor: string; textColor: string; borderColor: string };
      pending: { label: string; tasks: any[]; sum: number; grossSum: number; count: number; bgColor: string; textColor: string; borderColor: string };
    } = {
      paid: { label: '✅ Bezahlt', tasks: [], sum: 0, grossSum: 0, count: 0, bgColor: 'bg-green-50', textColor: 'text-green-700', borderColor: 'border-green-200' },
      unpaid: { label: '💳 Offen', tasks: [], sum: 0, grossSum: 0, count: 0, bgColor: 'bg-red-50', textColor: 'text-red-700', borderColor: 'border-red-200' },
      pending: { label: '⏳ Ausstehend', tasks: [], sum: 0, grossSum: 0, count: 0, bgColor: 'bg-orange-50', textColor: 'text-orange-700', borderColor: 'border-orange-200' }
    };
    
    billingData.forEach((task: any) => {
      const status = task.payment_status || 'unpaid';
      if (groups[status as keyof typeof groups]) {
        groups[status as keyof typeof groups].tasks.push(task);
        groups[status as keyof typeof groups].sum += Number(task.cleaning_cost) || 0;
        groups[status as keyof typeof groups].grossSum +=
          grossFromTask(task.cleaning_cost, task.cleaning_vat_percentage) || 0;
        groups[status as keyof typeof groups].count++;
      }
    });
    
    // Jede Gruppe nach scheduled_date sortieren (neueste zuerst)
    Object.values(groups).forEach(group => {
      group.tasks.sort((a, b) => {
        const dateA = new Date(a.scheduled_date).getTime();
        const dateB = new Date(b.scheduled_date).getTime();
        return dateB - dateA; // Absteigende Sortierung
      });
    });
    
    return Object.values(groups).filter(g => g.count > 0);
  }, [billingData]);

  // Summen berechnen
  const totalAmount = Math.round(groupedData.reduce((sum, g) => sum + g.sum, 0) * 100) / 100;
  const totalGross = Math.round(groupedData.reduce((sum, g) => sum + g.grossSum, 0) * 100) / 100;
  const totalCount = groupedData.reduce((sum, g) => sum + g.count, 0);
  const paidAmount = groupedData.find(g => g.label.includes('Bezahlt'))?.sum || 0;
  const paidCount = groupedData.find(g => g.label.includes('Bezahlt'))?.count || 0;
  const unpaidAmount = groupedData.find(g => g.label.includes('Offen'))?.sum || 0;
  const unpaidCount = groupedData.find(g => g.label.includes('Offen'))?.count || 0;
  const pendingAmount = groupedData.find(g => g.label.includes('Ausstehend'))?.sum || 0;
  const pendingCount = groupedData.find(g => g.label.includes('Ausstehend'))?.count || 0;

  // Check if this is Teuni (laundry service) - show invoices tab
  const isLaundryProvider = provider?.service_type === 'laundry';
  const isTeuniProvider = provider?.id === 'd8110105-8ac9-45e3-ad32-aaf42393744c';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>📊 Abrechnung - {provider?.name}</DialogTitle>
          <DialogDescription>
            {isLaundryProvider 
              ? 'Rechnungen und Aufträge verwalten'
              : 'Alle Reinigungsaufträge mit Bezahlstatus'}
          </DialogDescription>
        </DialogHeader>

        {isLaundryProvider ? (
          <Tabs defaultValue="orders" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="orders">📦 Bestellungen</TabsTrigger>
              <TabsTrigger value="invoices">📄 Rechnungen</TabsTrigger>
            </TabsList>
            
            <TabsContent value="orders" className="flex-1 overflow-auto mt-4">
              {isTeuniProvider ? <TeuniOrdersOverview /> : <LaundryOrdersOverview />}
            </TabsContent>
            
            <TabsContent value="invoices" className="flex-1 overflow-auto mt-4">
              <LaundryInvoicesList />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 overflow-auto">
            {renderTasksContent()}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function renderTasksContent() {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">Lade Abrechnungsdaten...</div>
        </div>
      );
    }

    return (
      <>
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAmount.toFixed(2)} EUR</div>
              <p className="text-xs text-muted-foreground">{totalCount} Aufträge</p>
            </CardContent>
          </Card>
          
          <Card className="border-green-200 bg-green-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700">✅ Bezahlt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">{paidAmount.toFixed(2)} EUR</div>
              <p className="text-xs text-muted-foreground">{paidCount} Aufträge</p>
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-red-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-700">💳 Offen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-700">{unpaidAmount.toFixed(2)} EUR</div>
              <p className="text-xs text-muted-foreground">{unpaidCount} Aufträge</p>
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-orange-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-orange-700">⏳ Ausstehend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-700">{pendingAmount.toFixed(2)} EUR</div>
              <p className="text-xs text-muted-foreground">{pendingCount} Aufträge</p>
            </CardContent>
          </Card>
        </div>

        {/* Bedienleiste Bearbeiten */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {!editMode ? (
            <>
              <Button size="sm" onClick={startEdit} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Pencil className="w-4 h-4 mr-2" />
                Einträge bearbeiten
              </Button>
              <span className="text-xs text-muted-foreground">
                Stunden, Netto und MwSt-Satz je Auftrag ändern.
              </span>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={applyDefinitionToAll}>
                Alle aus Abrechnungsart füllen
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={changedTasks.length === 0 || saveMutation.isPending}
              >
                {saveMutation.isPending
                  ? 'Wird gespeichert...'
                  : `${changedTasks.length} Änderung(en) speichern`}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditMode(false);
                  setDrafts({});
                }}
              >
                Abbrechen
              </Button>
              <p className="w-full text-xs text-amber-700">
                Bereits bezahlte Aufträge tragen den Betrag, der tatsächlich abgerechnet wurde —
                Änderungen daran verändern die Vergangenheit.
              </p>
            </>
          )}
        </div>

        {/* Excel-ähnliche Tabelle */}
        <ScrollArea className="flex-1 border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Haus</TableHead>
                <TableHead>Gast</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Stunden</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">MwSt</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                {editMode && <TableHead className="w-28"></TableHead>}
                <TableHead>Bezahlung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedData.map((group, groupIndex) => (
                <React.Fragment key={groupIndex}>
                  {/* Gruppen-Header */}
                  <TableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                    <TableCell colSpan={editMode ? 10 : 9}>
                      {group.label} ({group.count} Aufträge)
                    </TableCell>
                  </TableRow>
                  
                  {/* Daten-Zeilen */}
                  {group.tasks.map((task: any) => (
                    <TableRow key={task.id}>
                      <TableCell>{format(new Date(task.scheduled_date), 'dd.MM.yyyy')}</TableCell>
                      <TableCell>{task.houses?.name || '-'}</TableCell>
                      <TableCell>{task.bookings ? getGuestName(task.bookings) : '-'}</TableCell>
                      <TableCell>
                        <Badge variant={
                          task.status === 'completed' ? 'default' :
                          task.status === 'scheduled' ? 'secondary' :
                          task.status === 'cancelled' ? 'destructive' : 'outline'
                        }>
                          {task.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {editMode ? (
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            className="h-8 w-20 text-right"
                            value={drafts[task.id]?.hours ?? ''}
                            onChange={(e) => setDraft(task.id, 'hours', e.target.value)}
                          />
                        ) : (
                          task.cleaning_hours || '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {editMode ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            className="h-8 w-28 text-right"
                            value={drafts[task.id]?.net ?? ''}
                            onChange={(e) => setDraft(task.id, 'net', e.target.value)}
                          />
                        ) : task.cleaning_cost != null ? (
                          formatEur(Number(task.cleaning_cost))
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {editMode ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            onWheel={(e) => (e.target as HTMLElement).blur()}
                            className="h-8 w-20 text-right"
                            value={drafts[task.id]?.vat ?? ''}
                            onChange={(e) => setDraft(task.id, 'vat', e.target.value)}
                          />
                        ) : task.cleaning_vat_percentage != null && task.cleaning_cost != null ? (
                          `${task.cleaning_vat_percentage}%`
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editMode
                          ? formatEur(grossFromTask(numOrNull(drafts[task.id]?.net ?? ''), numOrNull(drafts[task.id]?.vat ?? '')))
                          : formatEur(grossFromTask(task.cleaning_cost, task.cleaning_vat_percentage))}
                      </TableCell>
                      {editMode && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => applyDefinition(task)}>
                            aus Satz
                          </Button>
                        </TableCell>
                      )}
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => paymentMutation.mutate(task)}
                          disabled={paymentMutation.isPending}
                          title={
                            task.payment_status === 'paid'
                              ? 'Klicken, um wieder auf offen zu setzen'
                              : 'Klicken, um als bezahlt zu markieren'
                          }
                          className="cursor-pointer disabled:opacity-50"
                        >
                          <Badge
                            className="hover:opacity-80"
                            variant={
                              task.payment_status === 'paid' ? 'default' :
                              task.payment_status === 'unpaid' ? 'destructive' : 'secondary'
                            }
                          >
                            {task.payment_status === 'paid' ? '✅ Bezahlt' :
                             task.payment_status === 'unpaid' ? '💳 Offen' : '⏳ Ausstehend'}
                          </Badge>
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Summen-Zeile pro Gruppe */}
                  <TableRow className={`${group.bgColor} font-bold hover:${group.bgColor}`}>
                    <TableCell colSpan={5} className="text-right">
                      Summe {group.label}:
                    </TableCell>
                    <TableCell className="text-right">{formatEur(group.sum)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right">{formatEur(group.grossSum)}</TableCell>
                    {editMode && <TableCell></TableCell>}
                    <TableCell></TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
              
              {/* Gesamt-Summe */}
              {groupedData.length > 0 && (
                <TableRow className="bg-primary/10 font-bold text-lg hover:bg-primary/10">
                  <TableCell colSpan={5} className="text-right">
                    GESAMTSUMME:
                  </TableCell>
                  <TableCell className="text-right">{formatEur(totalAmount)}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">{formatEur(totalGross)}</TableCell>
                  {editMode && <TableCell></TableCell>}
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </>
    );
  }
}
