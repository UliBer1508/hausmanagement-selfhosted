import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { useUpdatePayment, useUploadReceipt } from "@/hooks/useTenantPayments";
import { TenantPayment } from "@/types";
import { useEffect, useState } from "react";

interface EditPaymentDialogProps {
  payment: TenantPayment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EditPaymentDialog = ({ payment, open, onOpenChange }: EditPaymentDialogProps) => {
  const { register, handleSubmit, setValue } = useForm();
  const updatePayment = useUpdatePayment();
  const uploadReceipt = useUploadReceipt();
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    setValue('status', payment.status);
    setValue('amount', payment.amount);
    setValue('payment_date', payment.payment_date || '');
    setValue('payment_method', payment.payment_method || '');
    setValue('reference_number', payment.reference_number || '');
    setValue('notes', payment.notes || '');
  }, [payment, setValue]);

  const onSubmit = async (data: any) => {
    await updatePayment.mutateAsync({ id: payment.id, ...data });
    
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
            <Select onValueChange={(value) => setValue('status', value)} defaultValue={payment.status}>
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
            <Label>Betrag (€)</Label>
            <Input type="number" step="0.01" {...register('amount', { valueAsNumber: true })} />
          </div>

          <div>
            <Label>Gezahlt am</Label>
            <Input type="date" {...register('payment_date')} />
          </div>

          <div>
            <Label>Zahlungsart</Label>
            <Select onValueChange={(value) => setValue('payment_method', value)} defaultValue={payment.payment_method || ''}>
              <SelectTrigger>
                <SelectValue />
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
