import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import CreateBookingForm from './CreateBookingForm';

// Prefill data from booking inquiry
export interface BookingPrefillData {
  house_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone?: string;
  check_in: Date;
  check_out: Date;
  number_of_guests: number;
  notes?: string;
  inquiry_id?: string; // To update inquiry status after booking
}

interface CreateBookingDialogProps {
  onBookingCreated?: () => void;
  // For controlled dialog (e.g., from inquiry banner)
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  prefillData?: BookingPrefillData;
}

const CreateBookingDialog = ({ 
  onBookingCreated, 
  open: controlledOpen, 
  onOpenChange: controlledOnOpenChange,
  prefillData 
}: CreateBookingDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  
  // Use controlled state if provided, otherwise use internal state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? controlledOnOpenChange! : setInternalOpen;

  const handleBookingCreated = () => {
    setOpen(false);
    onBookingCreated?.();
  };

  const dialogTitle = prefillData?.inquiry_id 
    ? 'Buchung aus Anfrage erstellen' 
    : 'Neue Buchung erstellen';

  const dialogDescription = prefillData?.inquiry_id
    ? 'Prüfen Sie die Daten und ergänzen Sie fehlende Informationen'
    : 'Erstellen Sie eine neue Buchung für ein Ferienhaus';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Only show trigger when not controlled */}
      {!isControlled && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Buchung erstellen
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-xl font-semibold">
              {dialogTitle}
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {dialogDescription}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        
        <CreateBookingForm 
          onSuccess={handleBookingCreated} 
          prefillData={prefillData}
        />
      </DialogContent>
    </Dialog>
  );
};

export default CreateBookingDialog;
