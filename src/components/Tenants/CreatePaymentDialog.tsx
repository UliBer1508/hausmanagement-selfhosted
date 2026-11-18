import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useCreatePayment } from "@/hooks/useTenantPayments";
import { useHouses } from "@/hooks/useHouses";

interface CreatePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreatePaymentDialog = ({ open, onOpenChange }: CreatePaymentDialogProps) => {
  const { register, handleSubmit, reset, watch, setValue } = useForm();
  const createPayment = useCreatePayment();
  // 'rent' = Monatsmiete (wie bisher), 'special' = Sonderzahlung (Pauschalbetrag,
  // z. B. Nachzahlung mehrerer Monate). Sonderzahlungen werden sofort als bezahlt
  // gebucht; die Zuordnung zu Monaten kommt später (tenant_payment_allocations).
  const [paymentType, setPaymentType] = useState<'rent' | 'special'>('rent');
  const isSpecial = paymentType === 'special';
  const { data: houses } = useHouses();
  
  const longTermRentals = houses?.filter(h => h.rental_type === 'long_term') || [];
  const selectedHouseId = watch('house_id');

  const warmRentOf = (houseId: string) => {
    const tenantInfo = longTermRentals.find(h => h.id === houseId)?.tenant_info as any;
    if (!tenantInfo) return undefined;
    return (tenantInfo.monthly_rent || 0) + (tenantInfo.additional_costs || 0);
  };

  const handleTypeChange = (value: 'rent' | 'special') => {
    setPaymentType(value);
    // Bei Sonderzahlung keine Warmmiete vorbelegen — der Betrag kommt vom Kontoauszug.
    if (value === 'special') {
      setValue('amount', undefined);
    } else if (selectedHouseId) {
      setValue('amount', warmRentOf(selectedHouseId));
    }
  };

  const onSubmit = (data: any) => {
    // Validiere das Jahr des Fälligkeitsdatums
    const dueDate = new Date(data.due_date);
    const year = dueDate.getFullYear();
    if (year < 2020 || year > 2100) {
      return; // HTML5-Validierung sollte das abfangen, aber sicher ist sicher
    }
    
    const payload = isSpecial
      ? {
          ...data,
          payment_type: 'special',
          status: 'paid',
          // Eine Sonderzahlung hat keine Fälligkeit; due_date ist aber NOT NULL und
          // steuert Jahres-/Monatsfilter → Eingangsdatum in beide Felder.
          payment_date: data.due_date,
        }
      : { ...data, payment_type: 'rent' };

    createPayment.mutate(payload, {
      onSuccess: () => {
        reset();
        setPaymentType('rent');
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zahlung erfassen</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Art der Zahlung</Label>
            <Select value={paymentType} onValueChange={(v) => handleTypeChange(v as 'rent' | 'special')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rent">Monatsmiete</SelectItem>
                <SelectItem value="special">Sonderzahlung (Pauschalbetrag)</SelectItem>
              </SelectContent>
            </Select>
            {isSpecial && (
              <p className="mt-1 text-xs text-muted-foreground">
                Wird sofort als bezahlt gebucht und zählt bei „Erhalten". Den Monaten
                zugeordnet wird sie später. Verwendungszweck der Überweisung bitte unter
                Notizen eintragen.
              </p>
            )}
          </div>

          <div>
            <Label>Objekt</Label>
            <Select onValueChange={(value) => {
              setValue('house_id', value);
              if (!isSpecial) {
                setValue('amount', warmRentOf(value)); // Warmmiete = Kaltmiete + Nebenkosten
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Objekt wählen" />
              </SelectTrigger>
              <SelectContent>
                {longTermRentals.map(house => (
                  <SelectItem key={house.id} value={house.id}>{house.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{isSpecial ? 'Eingangsdatum (laut Kontoauszug)' : 'Fälligkeitsdatum'}</Label>
            <Input 
              type="date" 
              min="2020-01-01"
              max="2100-12-31"
              {...register('due_date', { required: true })} 
            />
          </div>

          <div>
            <Label>{isSpecial ? 'Betrag (€)' : 'Warmmiete (€)'}</Label>
            <Input type="number" step="0.01" {...register('amount', { required: true, valueAsNumber: true })} />
          </div>

          <div>
            <Label>Zahlungsart</Label>
            <Select onValueChange={(value) => setValue('payment_method', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Überweisung</SelectItem>
                <SelectItem value="cash">Bar</SelectItem>
                <SelectItem value="direct_debit">Lastschrift</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{isSpecial ? 'Notizen / Verwendungszweck' : 'Notizen'}</Label>
            <Textarea {...register('notes')} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit">Erstellen</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePaymentDialog;
