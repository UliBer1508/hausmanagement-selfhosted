import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  const { data: houses } = useHouses();
  
  const longTermRentals = houses?.filter(h => h.rental_type === 'long_term') || [];
  const selectedHouseId = watch('house_id');
  const selectedHouse = longTermRentals.find(h => h.id === selectedHouseId);

  const onSubmit = (data: any) => {
    // Validiere das Jahr des Fälligkeitsdatums
    const dueDate = new Date(data.due_date);
    const year = dueDate.getFullYear();
    if (year < 2020 || year > 2100) {
      return; // HTML5-Validierung sollte das abfangen, aber sicher ist sicher
    }
    
    createPayment.mutate(data, {
      onSuccess: () => {
        reset();
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
            <Label>Objekt</Label>
            <Select onValueChange={(value) => {
              setValue('house_id', value);
              const house = longTermRentals.find(h => h.id === value);
              if (house?.tenant_info) {
                const kaltmiete = (house.tenant_info as any).monthly_rent || 0;
                const nebenkosten = (house.tenant_info as any).additional_costs || 0;
                setValue('amount', kaltmiete + nebenkosten); // Warmmiete
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
            <Label>Fälligkeitsdatum</Label>
            <Input 
              type="date" 
              min="2020-01-01"
              max="2100-12-31"
              {...register('due_date', { required: true })} 
            />
          </div>

          <div>
            <Label>Warmmiete (€)</Label>
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
            <Label>Notizen</Label>
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
