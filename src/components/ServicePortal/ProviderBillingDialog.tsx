import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
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
          payment_status,
          status,
          houses:house_id (name),
          bookings:booking_id (guest_name)
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

  // Gruppierung nach Payment Status
  const groupedData = useMemo(() => {
    if (!billingData) return [];
    
    const groups: {
      paid: { label: string; tasks: any[]; sum: number; count: number; bgColor: string; textColor: string; borderColor: string };
      unpaid: { label: string; tasks: any[]; sum: number; count: number; bgColor: string; textColor: string; borderColor: string };
      pending: { label: string; tasks: any[]; sum: number; count: number; bgColor: string; textColor: string; borderColor: string };
    } = {
      paid: { label: '✅ Bezahlt', tasks: [], sum: 0, count: 0, bgColor: 'bg-green-50', textColor: 'text-green-700', borderColor: 'border-green-200' },
      unpaid: { label: '💳 Offen', tasks: [], sum: 0, count: 0, bgColor: 'bg-red-50', textColor: 'text-red-700', borderColor: 'border-red-200' },
      pending: { label: '⏳ Ausstehend', tasks: [], sum: 0, count: 0, bgColor: 'bg-orange-50', textColor: 'text-orange-700', borderColor: 'border-orange-200' }
    };
    
    billingData.forEach((task: any) => {
      const status = task.payment_status || 'unpaid';
      if (groups[status as keyof typeof groups]) {
        groups[status as keyof typeof groups].tasks.push(task);
        groups[status as keyof typeof groups].sum += Number(task.cleaning_cost) || 0;
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
  const totalAmount = groupedData.reduce((sum, g) => sum + g.sum, 0);
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
              <LaundryOrdersOverview />
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
                <TableHead className="text-right">Kosten</TableHead>
                <TableHead>Bezahlung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedData.map((group, groupIndex) => (
                <React.Fragment key={groupIndex}>
                  {/* Gruppen-Header */}
                  <TableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
                    <TableCell colSpan={7}>
                      {group.label} ({group.count} Aufträge)
                    </TableCell>
                  </TableRow>
                  
                  {/* Daten-Zeilen */}
                  {group.tasks.map((task: any) => (
                    <TableRow key={task.id}>
                      <TableCell>{format(new Date(task.scheduled_date), 'dd.MM.yyyy')}</TableCell>
                      <TableCell>{task.houses?.name || '-'}</TableCell>
                      <TableCell>{task.bookings?.guest_name || '-'}</TableCell>
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
                        {task.cleaning_cost ? `${Number(task.cleaning_cost).toFixed(2)} EUR` : '-'}
                      </TableCell>
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
                    <TableCell colSpan={5} className="text-right">
                      Summe {group.label}:
                    </TableCell>
                    <TableCell className="text-right">
                      {group.sum.toFixed(2)} EUR
                    </TableCell>
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
                  <TableCell className="text-right">
                    {totalAmount.toFixed(2)} EUR
                  </TableCell>
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
