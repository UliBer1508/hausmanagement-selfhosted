import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { LaundryInvoice } from '@/hooks/useLaundryInvoices';

interface InvoiceDetailsDialogProps {
  invoice: LaundryInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const InvoiceDetailsDialog = ({ invoice, open, onOpenChange }: InvoiceDetailsDialogProps) => {
  if (!invoice) return null;

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const getStatusBadge = () => {
    const today = new Date();
    const isOverdue = invoice.status === 'offen' && 
      invoice.faelligkeitsdatum && 
      new Date(invoice.faelligkeitsdatum) < today;

    if (isOverdue) {
      return <Badge variant="destructive">🔴 Überfällig</Badge>;
    }

    switch (invoice.status) {
      case 'offen':
        return <Badge className="bg-amber-100 text-amber-800">🟡 Offen</Badge>;
      case 'bezahlt':
        return <Badge className="bg-green-100 text-green-800">🟢 Bezahlt</Badge>;
      case 'storniert':
        return <Badge variant="secondary">⚫ Storniert</Badge>;
      case 'mahnung':
        return <Badge className="bg-purple-100 text-purple-800">🟣 Mahnung</Badge>;
      default:
        return <Badge variant="outline">{invoice.status}</Badge>;
    }
  };

  const positions = invoice.positionen || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Rechnung {invoice.rechnungsnummer}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice Meta Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Rechnungsdatum:</span>
              <p className="font-medium">
                {format(new Date(invoice.rechnungsdatum), 'dd. MMMM yyyy', { locale: de })}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Fällig bis:</span>
              <p className="font-medium">
                {invoice.faelligkeitsdatum
                  ? format(new Date(invoice.faelligkeitsdatum), 'dd. MMMM yyyy', { locale: de })
                  : '-'}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>
              <p className="mt-1">{getStatusBadge()}</p>
            </div>
            {invoice.bezahlt_am && (
              <div>
                <span className="text-muted-foreground">Bezahlt am:</span>
                <p className="font-medium">
                  {format(new Date(invoice.bezahlt_am), 'dd. MMMM yyyy', { locale: de })}
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Positions Table */}
          <div>
            <h4 className="font-medium mb-2">Rechnungspositionen</h4>
            {positions.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Artikel-Nr.</TableHead>
                      <TableHead>Bezeichnung</TableHead>
                      <TableHead className="text-center">Menge</TableHead>
                      <TableHead className="text-right">EP</TableHead>
                      <TableHead className="text-right">Gesamt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positions.map((pos, index) => (
                      <TableRow key={pos.id || index}>
                        <TableCell className="font-mono text-sm">{pos.artikelnummer}</TableCell>
                        <TableCell>{pos.bezeichnung}</TableCell>
                        <TableCell className="text-center">{pos.menge}</TableCell>
                        <TableCell className="text-right">{formatCurrency(pos.einzelpreis)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(pos.gesamtpreis)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Keine Positionen vorhanden</p>
            )}
          </div>

          <Separator />

          {/* Totals */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Netto:</span>
              <span>{formatCurrency(invoice.nettobetrag)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">MwSt ({invoice.mwst_satz || 0}%):</span>
              <span>{formatCurrency(invoice.mwst_betrag)}</span>
            </div>
            {invoice.bearbeitungsgebuehr && invoice.bearbeitungsgebuehr > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bearbeitungsgebühr:</span>
                <span>{formatCurrency(invoice.bearbeitungsgebuehr)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Gesamtbetrag:</span>
              <span>{formatCurrency(invoice.bruttobetrag)}</span>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium mb-1">Notizen</h4>
                <p className="text-sm text-muted-foreground">{invoice.notes}</p>
              </div>
            </>
          )}

          {/* Sync Info */}
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Synchronisiert: {invoice.synced_at 
              ? format(new Date(invoice.synced_at), 'dd.MM.yyyy HH:mm', { locale: de })
              : '-'}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
