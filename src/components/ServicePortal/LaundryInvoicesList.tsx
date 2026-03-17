import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { RefreshCw, FileText, Check, AlertCircle, Eye, Plus, Pencil, Merge, ListChecks, Search, CalendarIcon, X, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useLaundryInvoices, useSyncLaundryInvoices, useMarkInvoicePaid, useDeleteLaundryInvoice, useInvoiceStats, LaundryInvoice } from '@/hooks/useLaundryInvoices';
import { InvoiceDetailsDialog } from './InvoiceDetailsDialog';
import { CreateInvoiceDialog } from './CreateInvoiceDialog';
import { EditInvoiceDialog } from './EditInvoiceDialog';
import { MergeInvoicesDialog } from './MergeInvoicesDialog';
import { AssignOrdersToInvoiceDialog } from './AssignOrdersToInvoiceDialog';

const isDraftInvoice = (invoice: LaundryInvoice) =>
  invoice.rechnungsnummer?.startsWith('ENTWURF') && invoice.bruttobetrag === 0;

export const LaundryInvoicesList = () => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<LaundryInvoice | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergePreselectedId, setMergePreselectedId] = useState<string | undefined>();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [amountFilter, setAmountFilter] = useState<string>('all');

  const { data: invoices, isLoading } = useLaundryInvoices({
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });
  const { stats, isLoading: statsLoading } = useInvoiceStats();
  const syncMutation = useSyncLaundryInvoices();
  const markPaidMutation = useMarkInvoicePaid();

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter(inv => {
      if (searchQuery && !inv.rechnungsnummer?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (dateFrom && new Date(inv.rechnungsdatum) < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (new Date(inv.rechnungsdatum) > end) return false;
      }
      if (amountFilter !== 'all') {
        const a = inv.bruttobetrag;
        if (amountFilter === '0-100' && (a < 0 || a > 100)) return false;
        if (amountFilter === '100-500' && (a < 100 || a > 500)) return false;
        if (amountFilter === '500-1000' && (a < 500 || a > 1000)) return false;
        if (amountFilter === '1000+' && a < 1000) return false;
      }
      return true;
    });
  }, [invoices, searchQuery, dateFrom, dateTo, amountFilter]);

  const getStatusBadge = (invoice: LaundryInvoice) => {
    const today = new Date();
    const isOverdue = invoice.status === 'offen' && 
      invoice.faelligkeitsdatum && 
      new Date(invoice.faelligkeitsdatum) < today;

    if (isOverdue) {
      return <Badge variant="destructive">🔴 Überfällig</Badge>;
    }

    switch (invoice.status) {
      case 'offen':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">🟡 Offen</Badge>;
      case 'bezahlt':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">🟢 Bezahlt</Badge>;
      case 'storniert':
        return <Badge variant="secondary">⚫ Storniert</Badge>;
      case 'mahnung':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200">🟣 Mahnung</Badge>;
      default:
        return <Badge variant="outline">{invoice.status}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const handleViewDetails = (invoice: LaundryInvoice) => {
    setSelectedInvoice(invoice);
    setDetailsOpen(true);
  };

  const handleEditInvoice = (invoice: LaundryInvoice) => {
    setSelectedInvoice(invoice);
    setEditDialogOpen(true);
  };

  const handleMarkPaid = (invoice: LaundryInvoice) => {
    markPaidMutation.mutate({ invoiceId: invoice.id });
  };

  return (
    <div className="space-y-4">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Offen</div>
            {statsLoading ? (
              <Skeleton className="h-7 w-24 mt-1" />
            ) : (
              <>
                <div className="text-2xl font-bold text-amber-600">{stats.openCount}</div>
                <div className="text-sm text-muted-foreground">{formatCurrency(stats.openAmount)}</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-destructive" />
              Überfällig
            </div>
            {statsLoading ? (
              <Skeleton className="h-7 w-24 mt-1" />
            ) : (
              <>
                <div className="text-2xl font-bold text-destructive">{stats.overdueCount}</div>
                <div className="text-sm text-muted-foreground">{formatCurrency(stats.overdueAmount)}</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Bezahlt (Monat)</div>
            {statsLoading ? (
              <Skeleton className="h-7 w-24 mt-1" />
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">{stats.paidThisMonth}</div>
                <div className="text-sm text-muted-foreground">{formatCurrency(stats.paidThisMonthAmount)}</div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Gesamt</div>
            {statsLoading ? (
              <Skeleton className="h-7 w-24 mt-1" />
            ) : (
              <div className="text-2xl font-bold">{stats.totalCount}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter and Sync Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Rechnungen (Teuni / Wäsche Oberpinzgau)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMergePreselectedId(undefined);
                  setMergeDialogOpen(true);
                }}
              >
                <Merge className="h-4 w-4 mr-1" />
                Zusammenführen
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAssignDialogOpen(true)}
              >
                <ListChecks className="h-4 w-4 mr-1" />
                Rechnung + Zuordnung
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Rechnung
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                Sync
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filter Row */}
          <div className="flex flex-wrap gap-3 items-end mb-4">
            {/* Rechnungsnummer Suche */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Rechnungsnr.</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-[160px]"
                />
              </div>
            </div>

            {/* Datum Von */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Datum von</label>
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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Datum bis</label>
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

            {/* Betrag Filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Betrag</label>
              <Select value={amountFilter} onValueChange={setAmountFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Alle Beträge" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Beträge</SelectItem>
                  <SelectItem value="0-100">0 – 100 €</SelectItem>
                  <SelectItem value="100-500">100 – 500 €</SelectItem>
                  <SelectItem value="500-1000">500 – 1.000 €</SelectItem>
                  <SelectItem value="1000+">über 1.000 €</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status Filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Alle Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="offen">Offen</SelectItem>
                  <SelectItem value="bezahlt">Bezahlt</SelectItem>
                  <SelectItem value="mahnung">Mahnung</SelectItem>
                  <SelectItem value="storniert">Storniert</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reset Filters */}
            {(searchQuery || dateFrom || dateTo || amountFilter !== 'all' || statusFilter !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => {
                setSearchQuery('');
                setDateFrom(undefined);
                setDateTo(undefined);
                setAmountFilter('all');
                setStatusFilter('all');
              }}>
                <X className="h-4 w-4 mr-1" />
                Zurücksetzen
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredInvoices && filteredInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rechnungsnr.</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Fällig</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {invoice.rechnungsnummer}
                          {isDraftInvoice(invoice) && (
                            <Badge variant="outline" className="text-xs border-dashed">📝 Entwurf</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(invoice.rechnungsdatum), 'dd.MM.yyyy', { locale: de })}
                      </TableCell>
                      <TableCell>
                        {invoice.faelligkeitsdatum
                          ? format(new Date(invoice.faelligkeitsdatum), 'dd.MM.yyyy', { locale: de })
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {isDraftInvoice(invoice) ? (
                          <span className="text-muted-foreground italic">ausstehend</span>
                        ) : formatCurrency(invoice.bruttobetrag)}
                      </TableCell>
                      <TableCell>{getStatusBadge(invoice)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isDraftInvoice(invoice) ? (
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setMergePreselectedId(invoice.id);
                                  setMergeDialogOpen(true);
                                }}
                                title="Mit anderen Entwürfen zusammenführen"
                              >
                                <Merge className="h-4 w-4 mr-1" />
                                Zusammenführen
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleEditInvoice(invoice)}
                                title="Rechnungsdaten ausfüllen"
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                Ausfüllen
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(invoice)}
                                title="Details anzeigen"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditInvoice(invoice)}
                                title="Bearbeiten"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {invoice.status === 'offen' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMarkPaid(invoice)}
                                  disabled={markPaidMutation.isPending}
                                  title="Als bezahlt markieren"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Keine Rechnungen gefunden</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                Rechnungen synchronisieren
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Details Dialog */}
      <InvoiceDetailsDialog
        invoice={selectedInvoice}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />

      {/* Create Invoice Dialog */}
      <CreateInvoiceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      {/* Edit Invoice Dialog */}
      <EditInvoiceDialog
        invoice={selectedInvoice}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
      {/* Merge Invoices Dialog */}
      <MergeInvoicesDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        preselectedInvoiceId={mergePreselectedId}
      />
      {/* Assign Orders to Invoice Dialog */}
      <AssignOrdersToInvoiceDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
      />
    </div>
  );
};
