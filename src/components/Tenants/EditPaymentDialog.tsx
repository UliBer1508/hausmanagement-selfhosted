import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useUpdatePayment, useUploadReceipt } from "@/hooks/useTenantPayments";
import { useTenantRentChanges, getActiveRent, getActiveAdditionalCosts } from "@/hooks/useTenantRentChanges";
import { TenantPayment } from "@/types";
import { todayISO } from "@/lib/dateHelpers";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";

interface EditPaymentDialogProps {
  payment: TenantPayment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Leerer Text aus einem Formularfeld → null.
// Grund: payment_date ist eine DATE-Spalte (lehnt '' ab) und payment_method hat
// einen CHECK-Constraint (nur bank_transfer/cash/direct_debit, '' fällt durch).
// Ohne diese Umwandlung ließ sich eine offene Zahlung ohne Bezahlt-Datum nicht speichern.
const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const EditPaymentDialog = ({ payment, open, onOpenChange }: EditPaymentDialogProps) => {
  const { register, handleSubmit, setValue, watch } = useForm();
  const updatePayment = useUpdatePayment();
  const uploadReceipt = useUploadReceipt();
  const { data: rentChanges = [] } = useTenantRentChanges(payment.house_id);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>(payment.status);
  const [paymentMethod, setPaymentMethod] = useState<string>(payment.payment_method || '');

  useEffect(() => {
    setStatus(payment.status);
    setPaymentMethod(payment.payment_method || '');
    setValue('due_date', payment.due_date || '');
    setValue('amount', payment.amount);
    setValue('payment_date', payment.payment_date || '');
    setValue('reference_number', payment.reference_number || '');
    setValue('notes', payment.notes || '');
  }, [payment, setValue]);

  const dueDate: string = watch('due_date') || payment.due_date;
  const currentAmount = Number(watch('amount'));

  // Soll-Warmmiete zum Fälligkeitsdatum — gleiche Rechnung wie in TenantPayments.tsx
  // (Kaltmiete + Nebenkosten, jeweils mit den Mietänderungen aus tenant_rent_changes).
  const sollAmount = useMemo(() => {
    const tenantInfo = payment.houses?.tenant_info;
    if (!tenantInfo?.monthly_rent || !dueDate) return null;
    // parseISO statt new Date(): 'yyyy-MM-dd' wird so als lokaler Tag gelesen,
    // nicht als UTC-Mitternacht (wie in RentHistoryDialog.tsx).
    const date = parseISO(dueDate);
    if (isNaN(date.getTime())) return null;
    const rent = getActiveRent(rentChanges, tenantInfo.monthly_rent, date);
    const additional = getActiveAdditionalCosts(rentChanges, tenantInfo.additional_costs || 0, date);
    return rent + additional;
  }, [payment.houses, rentChanges, dueDate]);

  // Nur offene Zahlungen werden an die Mieterhöhung angepasst — bezahlte bleiben, wie sie sind.
  const isOpen = status === 'pending' || status === 'overdue';
  const showSollHint = isOpen && sollAmount !== null && sollAmount !== currentAmount;

  const onSubmit = async (data: any) => {
    const updates = {
      ...data,
      status,
      payment_date: emptyToNull(data.payment_date),
      payment_method: emptyToNull(paymentMethod),
      reference_number: emptyToNull(data.reference_number),
      notes: emptyToNull(data.notes),
    };

    // Auf "Bezahlt" gesetzt, aber kein Datum eingetragen → heute.
    if (status === 'paid' && !updates.payment_date) {
      updates.payment_date = todayISO();
    }

    await updatePayment.mutateAsync({ id: payment.id, ...updates });

    if (file) {
      await uploadReceipt.mutateAsync({ paymentId: payment.id, file });
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zahlung bearbeiten</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="paid">Bezahlt</SelectItem>
                <SelectItem value="overdue">Überfällig</SelectItem>
                <SelectItem value="cancelled">Storniert</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Fälligkeitsdatum</Label>
            <Input type="date" {...register('due_date', { required: true })} />
          </div>

          <div>
            <Label>Betrag (€)</Label>
            <Input type="number" step="0.01" {...register('amount', { valueAsNumber: true, required: true })} />
            {showSollHint && (
              <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span>
                  Soll laut Mietvertrag zum{' '}
                  {format(parseISO(dueDate), 'dd.MM.yyyy', { locale: de })}:{' '}
                  <strong>{sollAmount!.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setValue('amount', sollAmount!, { shouldDirty: true })}
                >
                  Übernehmen
                </Button>
              </div>
            )}
          </div>

          <div>
            <Label>Gezahlt am</Label>
            <Input type="date" {...register('payment_date')} />
            {isOpen && (
              <p className="mt-1 text-xs text-muted-foreground">
                Bei offenen Zahlungen leer lassen.
              </p>
            )}
          </div>

          <div>
            <Label>Zahlungsart</Label>
            {/* kontrolliert statt defaultValue: der Dialog bleibt gemountet, wenn nacheinander
                verschiedene Zahlungen bearbeitet werden — defaultValue zeigte dann die alte Zahlungsart */}
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Keine Angabe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Überweisung</SelectItem>
                <SelectItem value="cash">Bar</SelectItem>
                <SelectItem value="direct_debit">Lastschrift</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Referenznummer</Label>
            <Input {...register('reference_number')} />
          </div>

          <div>
            <Label>Beleg hochladen</Label>
            <Input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>

          <div>
            <Label>Notizen</Label>
            <Textarea {...register('notes')} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit">Speichern</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditPaymentDialog;
