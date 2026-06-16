/**
 * TeuniOrdersOverview - Zeigt alle Wäschebestellungen für das Teuni Portal
 * Mit Filter (Haus, Datum, Status) und Checkbox-Auswahl
 */
import React, { useMemo, useState } from 'react';
import { AssignOrdersToInvoiceDialog } from './AssignOrdersToInvoiceDialog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { RefreshCw, Package, CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TEUNI_PROVIDER_ID = 'd8110105-8ac9-45e3-ad32-aaf42393744c';

const STATUS_OPTIONS = ['offen', 'ausstehend', 'bestellt', 'delivered', 'cancelled'] as const;

const getStatusBadgeInfo = (status: string | null) => {
  switch (status?.toLowerCase()) {
    case 'offen':
      return { label: 'Offen', className: 'bg-amber-500 hover:bg-amber-600 text-white' };
    case 'ausstehend':
      return { label: 'Ausstehend', className: 'bg-purple-500 hover:bg-purple-600 text-white' };
    case 'bestellt':
      return { label: 'Bestellt', className: 'bg-blue-500 hover:bg-blue-600 text-white' };
    case 'delivered':
      return { label: 'Geliefert', className: 'bg-green-500 hover:bg-green-600 text-white' };
    case 'cancelled':
      return { label: 'Storniert', className: 'bg-red-500 hover:bg-red-600 text-white' };
    default:
      return { label: status || 'Unbekannt', className: 'bg-gray-500 hover:bg-gray-600 text-white' };
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'offen': return 'Offen';
    case 'ausstehend': return 'Ausstehend';
    case 'bestellt': return 'Bestellt';
    case 'delivered': return 'Geliefert';
    case 'cancelled': return 'Storniert';
    default: return status;
  }
};

export function TeuniOrdersOverview() {
  const [houseFilter, setHouseFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  const { data: linenOrders, isLoading, refetch } = useQuery({
    queryKey: ['teuni-linen-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          id,
          delivery_date,
          status,
          total_items,
          total_cost,
          laundry_invoice_id,
          created_at,
          houses:house_id (name),
          bookings:booking_id (guest_name, check_in, number_of_guests)
        `)
        .eq('provider_id', TEUNI_PROVIDER_ID)
        .order('delivery_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const houseNames = useMemo(() => {
    if (!linenOrders) return [];
    const names = new Set(linenOrders.map((o: any) => o.houses?.name).filter(Boolean));
    return Array.from(names).sort() as string[];
  }, [linenOrders]);

  const filteredOrders = useMemo(() => {
    if (!linenOrders) return [];
    return linenOrders.filter((order: any) => {
      if (houseFilter !== 'all' && order.houses?.name !== houseFilter) return false;
      if (statusFilter !== 'all' && order.status?.toLowerCase() !== statusFilter) return false;
      if (dateFrom && order.delivery_date && new Date(order.delivery_date) < dateFrom) return false;
      if (dateTo && order.delivery_date && new Date(order.delivery_date) > dateTo) return false;
      return true;
    });
  }, [linenOrders, houseFilter, statusFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    if (!linenOrders) return { total: 0, offen: 0, ausstehend: 0, bestellt: 0, geliefert: 0, gesamtKosten: 0 };
    let offen = 0, ausstehend = 0, bestellt = 0, geliefert = 0;
    let gesamtKosten = 0;
    linenOrders.forEach((order: any) => {
      const s = order.status?.toLowerCase();
      if (s === 'offen') offen++;
      if (s === 'ausstehend') ausstehend++;
      if (s === 'bestellt') bestellt++;
      if (s === 'delivered') geliefert++;
      if (typeof order.total_cost === 'number' && order.total_cost > 0) {
        gesamtKosten += order.total_cost;
      }
    });
    return { total: linenOrders.length, offen, ausstehend, bestellt, geliefert, gesamtKosten: Math.round(gesamtKosten * 100) / 100 };
  }, [linenOrders]);

  const toggleSelect = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map((o: any) => o.id)));
    }
  };

  const allSelected = filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-8 w-24 mb-2" /><Skeleton className="h-4 w-16" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">Alle Wäschebestellungen für Teuni (interne Datenbank)</p>
          <p className="text-xs text-muted-foreground mt-1">
            <Package className="h-3 w-3 inline mr-1" />
            Diese Daten werden direkt vom Teuni Portal gelesen
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />Aktualisieren
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Gesamt</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.total}</div><p className="text-xs text-muted-foreground">Bestellungen</p></CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">🟡 Offen</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.offen}</div><p className="text-xs text-muted-foreground">Bestellungen</p></CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-400">🟣 Ausstehend</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{stats.ausstehend}</div><p className="text-xs text-muted-foreground">Bestellungen</p></CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">🔵 Bestellt</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.bestellt}</div><p className="text-xs text-muted-foreground">Bestellungen</p></CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">✅ Geliefert</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.geliefert}</div><p className="text-xs text-muted-foreground">Bestellungen</p></CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">💰 Kosten gesamt (geschätzt)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{stats.gesamtKosten.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR</div><p className="text-xs text-muted-foreground">Geschätzte Wäschekosten</p></CardContent>
        </Card>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Haus Filter */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Haus</label>
          <Select value={houseFilter} onValueChange={setHouseFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Alle Häuser" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Häuser</SelectItem>
              {houseNames.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Datum Von */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Von</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, 'dd.MM.yyyy', { locale: de }) : 'Von'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={de} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>

        {/* Datum Bis */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Bis</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, 'dd.MM.yyyy', { locale: de }) : 'Bis'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={de} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>

        {/* Status Filter */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Alle Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>{getStatusLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Reset Filters */}
        {(houseFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setHouseFilter('all'); setStatusFilter('all'); setDateFrom(undefined); setDateTo(undefined); }}>
            <X className="h-4 w-4 mr-1" />Filter zurücksetzen
          </Button>
        )}
      </div>

      {/* Orders Table */}
      <ScrollArea className="border rounded-lg h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
              </TableHead>
              <TableHead>Lieferdatum</TableHead>
              <TableHead>Haus</TableHead>
              <TableHead>Gast</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Personen</TableHead>
              <TableHead>Artikel</TableHead>
              <TableHead>Kosten (geschätzt)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Erstellt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Keine Bestellungen gefunden
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders.map((order: any) => {
                const badgeInfo = getStatusBadgeInfo(order.status);
                return (
                  <TableRow key={order.id} data-state={selectedOrderIds.has(order.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox checked={selectedOrderIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} />
                    </TableCell>
                    <TableCell>{order.delivery_date ? format(new Date(order.delivery_date), 'dd.MM.yyyy', { locale: de }) : '-'}</TableCell>
                    <TableCell>{order.houses?.name || '-'}</TableCell>
                    <TableCell>{order.bookings?.guest_name || '-'}</TableCell>
                    <TableCell>{order.bookings?.check_in ? format(new Date(order.bookings.check_in), 'dd.MM.yyyy', { locale: de }) : '-'}</TableCell>
                    <TableCell>{order.bookings?.number_of_guests || '-'}</TableCell>
                    <TableCell>{order.total_items || '-'}</TableCell>
                    <TableCell><Badge className={badgeInfo.className}>{badgeInfo.label}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{order.created_at ? format(new Date(order.created_at), 'dd.MM.yy HH:mm', { locale: de }) : '-'}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Selection Action Bar */}
      {selectedOrderIds.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg border">
          <span className="text-sm font-medium">{selectedOrderIds.size} Bestellung(en) ausgewählt</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedOrderIds(new Set())}>Auswahl aufheben</Button>
            <Button size="sm" onClick={() => setAssignDialogOpen(true)}>Rechnung erstellen</Button>
          </div>
        </div>
      )}

      <AssignOrdersToInvoiceDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        preselectedOrderIds={Array.from(selectedOrderIds)}
        onSuccess={() => setSelectedOrderIds(new Set())}
      />
    </div>
  );
}
