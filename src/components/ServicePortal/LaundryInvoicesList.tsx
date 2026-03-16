import { useState } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { RefreshCw, FileText, Check, AlertCircle, Eye, Plus, Pencil, Merge, ListChecks } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useLaundryInvoices, useSyncLaundryInvoices, useMarkInvoicePaid, useInvoiceStats, LaundryInvoice } from '@/hooks/useLaundryInvoices';
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

  const { data: invoices, isLoading } = useLaundryInvoices({
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });
  const { stats, isLoading: statsLoading } = useInvoiceStats();
  const syncMutation = useSyncLaundryInvoices();
  const markPaidMutation = useMarkInvoicePaid();

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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  <SelectItem value="offen">Offen</SelectItem>
                  <SelectItem value="bezahlt">Bezahlt</SelectItem>
                  <SelectItem value="mahnung">Mahnung</SelectItem>
                  <SelectItem value="storniert">Storniert</SelectItem>
                </SelectContent>
              </Select>
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
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : invoices && invoices.length > 0 ? (
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
                  {invoices.map((invoice) => (
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
    </div>
  );
};
