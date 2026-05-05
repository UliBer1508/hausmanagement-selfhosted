import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Merge, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDraftInvoices, useMergeDraftInvoices } from '@/hooks/useLaundryInvoices';
import { todayISO } from '@/lib/dateHelpers';

interface MergeInvoicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedInvoiceId?: string;
}

export const MergeInvoicesDialog = ({ open, onOpenChange, preselectedInvoiceId }: MergeInvoicesDialogProps) => {
  const { data: drafts, isLoading } = useDraftInvoices();
  const mergeMutation = useMergeDraftInvoices();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    rechnungsnummer: '',
    rechnungsdatum: '',
    faelligkeitsdatum: '',
    nettobetrag: '',
    mwst_satz: '20',
    mwst_betrag: '',
    bruttobetrag: '',
    notes: '',
  });

  useEffect(() => {
    if (open && preselectedInvoiceId) {
      setSelectedIds(new Set([preselectedInvoiceId]));
    }
  }, [open, preselectedInvoiceId]);

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setForm({
        rechnungsnummer: '', rechnungsdatum: '', faelligkeitsdatum: '',
        nettobetrag: '', mwst_satz: '20', mwst_betrag: '', bruttobetrag: '', notes: '',
      });
    }
  }, [open]);

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNettoChange = (value: string) => {
    const netto = parseFloat(value) || 0;
    const satz = parseFloat(form.mwst_satz) || 0;
    const mwst = Math.round(netto * satz / 100 * 100) / 100;
    setForm(prev => ({
      ...prev,
      nettobetrag: value,
      mwst_betrag: mwst.toString(),
      bruttobetrag: (netto + mwst).toFixed(2),
    }));
  };

  const handleMwstSatzChange = (value: string) => {
    const netto = parseFloat(form.nettobetrag) || 0;
    const satz = parseFloat(value) || 0;
    const mwst = Math.round(netto * satz / 100 * 100) / 100;
    setForm(prev => ({
      ...prev,
      mwst_satz: value,
      mwst_betrag: mwst.toString(),
      bruttobetrag: (netto + mwst).toFixed(2),
    }));
  };

  const handleMerge = () => {
    if (selectedIds.size < 1 || !form.rechnungsnummer) return;
    mergeMutation.mutate({
      draftInvoiceIds: Array.from(selectedIds),
      invoiceData: {
        rechnungsnummer: form.rechnungsnummer,
        rechnungsdatum: form.rechnungsdatum || todayISO(),
        faelligkeitsdatum: form.faelligkeitsdatum || undefined,
        nettobetrag: parseFloat(form.nettobetrag) || 0,
        mwst_satz: parseFloat(form.mwst_satz) || undefined,
        mwst_betrag: parseFloat(form.mwst_betrag) || undefined,
        bruttobetrag: parseFloat(form.bruttobetrag) || 0,
        notes: form.notes || undefined,
      },
    }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Entwürfe zu einer Rechnung zusammenführen
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Draft selection */}
          <div>
            <Label className="text-sm font-medium">Bestellungen auswählen ({selectedIds.size} gewählt)</Label>
            <ScrollArea className="h-48 border rounded-md mt-2">
              {isLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Lade Entwürfe...</div>
              ) : drafts && drafts.length > 0 ? (
                <div className="p-2 space-y-1">
                  {drafts.map(draft => (
                    <label
                      key={draft.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedIds.has(draft.id)}
                        onCheckedChange={() => toggleSelected(draft.id)}
                      />
                      <div className="flex-1 flex items-center gap-2 text-sm">
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">
                          {draft.linkedOrder?.houses?.name || 'Unbekannt'}
                        </span>
                        <span className="text-muted-foreground">
                          {format(new Date(draft.rechnungsdatum), 'dd.MM.yyyy', { locale: de })}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs border-dashed">
                        {draft.rechnungsnummer}
                      </Badge>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-sm text-muted-foreground">Keine Entwürfe vorhanden</div>
              )}
            </ScrollArea>
          </div>

          <Separator />

          {/* Invoice data form */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Rechnungsdaten</Label>
            
            <div className="space-y-2">
              <Label className="text-xs">Rechnungsnummer *</Label>
              <Input
                value={form.rechnungsnummer}
                onChange={(e) => setForm(prev => ({ ...prev, rechnungsnummer: e.target.value }))}
                placeholder="z.B. RE-2026-001"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Rechnungsdatum</Label>
                <Input
                  type="date"
                  value={form.rechnungsdatum}
                  onChange={(e) => setForm(prev => ({ ...prev, rechnungsdatum: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Fälligkeitsdatum</Label>
                <Input
                  type="date"
                  value={form.faelligkeitsdatum}
                  onChange={(e) => setForm(prev => ({ ...prev, faelligkeitsdatum: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Nettobetrag (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.nettobetrag}
                  onChange={(e) => handleNettoChange(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">MwSt-Satz (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.mwst_satz}
                  onChange={(e) => handleMwstSatzChange(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">MwSt-Betrag (€)</Label>
                <Input type="number" value={form.mwst_betrag} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Bruttobetrag (€)</Label>
                <Input type="number" value={form.bruttobetrag} disabled className="bg-muted font-bold" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Notizen</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button
            onClick={handleMerge}
            disabled={selectedIds.size < 1 || !form.rechnungsnummer || mergeMutation.isPending}
          >
            <Merge className="h-4 w-4 mr-1" />
            {mergeMutation.isPending ? 'Zusammenführen...' : `${selectedIds.size} Entwürfe zusammenführen`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};