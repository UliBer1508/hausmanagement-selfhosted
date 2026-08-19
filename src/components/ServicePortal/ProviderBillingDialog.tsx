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
import { Checkbox } from '@/components/ui/checkbox';
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
  const [recalcMode, setRecalcMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Beim Schliessen/Wechseln zuruecksetzen, damit keine alte Auswahl
  // auf einen anderen Dienstleister durchschlaegt.
  useEffect(() => {
    setRecalcMode(false);
    setSelectedIds([]);
  }, [provider?.id, open]);

  /**
   * Neuberechnung EINES Auftrags nach der aktuell hinterlegten Definition
   * des Dienstleisters (billing_mode + Satz + MwSt).
   * Es gibt bewusst KEINE freie Betragseingabe: sonst gaebe es neben der
   * Definition eine zweite Wahrheit.
   */
  const previewFor = (task: any) => calculateCleaningCost(provider, task.cleaning_hours);

  const recalcMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) throw new Error('Keine Aufträge ausgewählt.');

      const tasks = (billingData || []).filter((t: any) => ids.includes(t.id));
      let changed = 0;

      for (const task of tasks) {
        const result = previewFor(task);
        if (result.error) {
          throw new Error(`${format(new Date(task.scheduled_date), 'dd.MM.yyyy')}: ${result.error}`);
        }

        const { data, error } = await supabase
          .from('service_tasks')
          .update({
            cleaning_cost: result.net,
            cleaning_vat_percentage: result.vatPercentage,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', task.id)
          .select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(`Auftrag vom ${format(new Date(task.scheduled_date), 'dd.MM.yyyy')} wurde nicht geändert (keine Zeile betroffen).`);
        }
        changed++;
      }

      return changed;
    },
    onSuccess: (changed) => {
      queryClient.invalidateQueries({ queryKey: ['provider-billing', provider?.id] });
      queryClient.invalidateQueries({ queryKey: ['cleaning-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['service_tasks'] });
      setSelectedIds([]);
      setRecalcMode(false);
      toast({
        title: 'Kosten neu berechnet',
        description: `${changed} Auftrag/Aufträge wurden auf die aktuelle Definition gesetzt.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Neuberechnung fehlgeschlagen.',
        variant: 'destructive',
      });
    },
  });

  const toggleId = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /** Vorauswahl: alles ausser bereits bezahlten Auftraegen. */
  const selectUnpaid = () =>
    setSelectedIds(
      (billingData || [])
        .filter((t: any) => t.payment_status !== 'paid')
        .map((t: any) => t.id)
    );

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

        {/* Bedienleiste Neuberechnung */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {!recalcMode ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setRecalcMode(true)}>
                Kosten neu berechnen
              </Button>
              <span className="text-xs text-muted-foreground">
                Setzt ausgewählte Aufträge auf die aktuell hinterlegte Abrechnungsart von {provider?.name}.
              </span>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={selectUnpaid}>
                Alle unbezahlten auswählen
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedIds([])}>
                Auswahl leeren
              </Button>
              <Button
                size="sm"
                onClick={() => recalcMutation.mutate(selectedIds)}
                disabled={selectedIds.length === 0 || recalcMutation.isPending}
              >
                {recalcMutation.isPending
                  ? 'Wird gespeichert...'
                  : `${selectedIds.length} Auftrag/Aufträge überschreiben`}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRecalcMode(false);
                  setSelectedIds([]);
                }}
              >
                Abbrechen
              </Button>
              <p className="w-full text-xs text-amber-700">
                Bereits bezahlte Aufträge tragen den Betrag, der tatsächlich abgerechnet wurde.
                Wer sie neu berechnet, verändert die Vergangenheit — nur tun, wenn der alte Betrag nachweislich falsch war.
              </p>
            </>
          )}
        </div>

        {/* Excel-ähnliche Tabelle */}
        <ScrollArea className="flex-1 border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                {recalcMode && <TableHead className="w-10"></TableHead>}
                <TableHead>Datum</TableHead>
                <TableHead>Haus</TableHead>
                <TableHead>Gast</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Stunden</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">MwSt</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                {recalcMode && <TableHead className="text-right">Neu (netto)</TableHead>}
                <TableHead>Bezahlung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedData.map((group, groupIndex) => (
                <React.Fragment key={groupIndex}>
                  {/* Gruppen-Header */}
                  <TableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                    <TableCell colSpan={recalcMode ? 11 : 9}>
                      {group.label} ({group.count} Aufträge)
                    </TableCell>
                  </TableRow>
                  
                  {/* Daten-Zeilen */}
                  {group.tasks.map((task: any) => (
                    <TableRow key={task.id}>
                      {recalcMode && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(task.id)}
                            onCheckedChange={() => toggleId(task.id)}
                            aria-label="Auftrag zur Neuberechnung auswählen"
                          />
                        </TableCell>
                      )}
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
                      <TableCell className="text-right">{task.cleaning_hours || '-'}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {task.cleaning_cost != null ? formatEur(Number(task.cleaning_cost)) : '-'}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {task.cleaning_vat_percentage != null && task.cleaning_cost != null
                          ? `${task.cleaning_vat_percentage}%`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatEur(grossFromTask(task.cleaning_cost, task.cleaning_vat_percentage))}
                      </TableCell>
                      {recalcMode && (
                        <TableCell className="text-right">
                          {(() => {
                            const preview = previewFor(task);
                            if (preview.error) {
                              return <span className="text-destructive text-xs">nicht berechenbar</span>;
                            }
                            const unchanged =
                              task.cleaning_cost != null &&
                              Number(task.cleaning_cost) === preview.net &&
                              (task.cleaning_vat_percentage ?? null) === preview.vatPercentage;
                            return (
                              <span className={unchanged ? 'text-muted-foreground' : 'font-semibold text-green-700'}>
                                {formatEur(preview.net)}
                                {unchanged && ' (unverändert)'}
                              </span>
                            );
                          })()}
                        </TableCell>
                      )}
                      <TableCell>
                        <Badge variant={
                          task.payment_status === 'paid' ? 'default' :
                          task.payment_status === 'unpaid' ? 'destructive' : 'secondary'
                        }>
                          {task.payment_status === 'paid' ? '✅ Bezahlt' :
                           task.payment_status === 'unpaid' ? '💳 Offen' : '⏳ Ausstehend'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Summen-Zeile pro Gruppe */}
                  <TableRow className={`${group.bgColor} font-bold hover:${group.bgColor}`}>
                    <TableCell colSpan={recalcMode ? 6 : 5} className="text-right">
                      Summe {group.label}:
                    </TableCell>
                    <TableCell className="text-right">{formatEur(group.sum)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right">{formatEur(group.grossSum)}</TableCell>
                    {recalcMode && <TableCell></TableCell>}
                    <TableCell></TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
              
              {/* Gesamt-Summe */}
              {groupedData.length > 0 && (
                <TableRow className="bg-primary/10 font-bold text-lg hover:bg-primary/10">
                  <TableCell colSpan={recalcMode ? 6 : 5} className="text-right">
                    GESAMTSUMME:
                  </TableCell>
                  <TableCell className="text-right">{formatEur(totalAmount)}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">{formatEur(totalGross)}</TableCell>
                  {recalcMode && <TableCell></TableCell>}
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
