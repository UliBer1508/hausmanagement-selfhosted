import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Pencil } from 'lucide-react';
import { LaundryInvoice, useUpdateLaundryInvoice } from '@/hooks/useLaundryInvoices';

interface EditInvoiceDialogProps {
  invoice: LaundryInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EditInvoiceDialog = ({ invoice, open, onOpenChange }: EditInvoiceDialogProps) => {
  const updateMutation = useUpdateLaundryInvoice();

  const [form, setForm] = useState({
    rechnungsnummer: '',
    rechnungsdatum: '',
    faelligkeitsdatum: '',
    nettobetrag: '',
    mwst_satz: '',
    mwst_betrag: '',
    bruttobetrag: '',
    notes: '',
  });

  useEffect(() => {
    if (invoice) {
      setForm({
        rechnungsnummer: invoice.rechnungsnummer || '',
        rechnungsdatum: invoice.rechnungsdatum || '',
        faelligkeitsdatum: invoice.faelligkeitsdatum || '',
        nettobetrag: invoice.nettobetrag?.toString() || '',
        mwst_satz: invoice.mwst_satz?.toString() || '',
        mwst_betrag: invoice.mwst_betrag?.toString() || '',
        bruttobetrag: invoice.bruttobetrag?.toString() || '0',
        notes: invoice.notes || '',
      });
    }
  }, [invoice]);

  if (!invoice) return null;

  const isDraft = invoice.rechnungsnummer?.startsWith('ENTWURF');

  const handleSave = () => {
    updateMutation.mutate({
      invoiceId: invoice.id,
      data: {
        rechnungsnummer: form.rechnungsnummer,
        rechnungsdatum: form.rechnungsdatum,
        faelligkeitsdatum: form.faelligkeitsdatum || null,
        nettobetrag: form.nettobetrag ? parseFloat(form.nettobetrag) : null,
        mwst_satz: form.mwst_satz ? parseFloat(form.mwst_satz) : null,
        mwst_betrag: form.mwst_betrag ? parseFloat(form.mwst_betrag) : null,
        bruttobetrag: form.bruttobetrag ? parseFloat(form.bruttobetrag) : 0,
        notes: form.notes || null,
      },
    }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  // Auto-calculate brutto from netto + mwst
  const handleNettoChange = (value: string) => {
    setForm(prev => {
      const netto = parseFloat(value) || 0;
      const satz = parseFloat(prev.mwst_satz) || 0;
      const mwst = Math.round(netto * satz / 100 * 100) / 100;
      return {
        ...prev,
        nettobetrag: value,
        mwst_betrag: mwst.toString(),
        bruttobetrag: (netto + mwst).toFixed(2),
      };
    });
  };

  const handleMwstSatzChange = (value: string) => {
    setForm(prev => {
      const netto = parseFloat(prev.nettobetrag) || 0;
      const satz = parseFloat(value) || 0;
      const mwst = Math.round(netto * satz / 100 * 100) / 100;
      return {
        ...prev,
        mwst_satz: value,
        mwst_betrag: mwst.toString(),
        bruttobetrag: (netto + mwst).toFixed(2),
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            {isDraft ? 'Entwurf mit Rechnungsdaten ausfüllen' : 'Rechnung bearbeiten'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Rechnungsnummer</Label>
            <Input
              value={form.rechnungsnummer}
              onChange={(e) => setForm(prev => ({ ...prev, rechnungsnummer: e.target.value }))}
              placeholder="z.B. RE-2026-001"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Rechnungsdatum</Label>
              <Input
                type="date"
                value={form.rechnungsdatum}
                onChange={(e) => setForm(prev => ({ ...prev, rechnungsdatum: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Fälligkeitsdatum</Label>
              <Input
                type="date"
                value={form.faelligkeitsdatum}
                onChange={(e) => setForm(prev => ({ ...prev, faelligkeitsdatum: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nettobetrag (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.nettobetrag}
                onChange={(e) => handleNettoChange(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>MwSt-Satz (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={form.mwst_satz}
                onChange={(e) => handleMwstSatzChange(e.target.value)}
                placeholder="20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>MwSt-Betrag (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.mwst_betrag}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Bruttobetrag (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.bruttobetrag}
                disabled
                className="bg-muted font-bold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notizen</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Speichert...' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
