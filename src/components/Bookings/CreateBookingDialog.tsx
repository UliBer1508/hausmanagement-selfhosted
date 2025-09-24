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

interface CreateBookingDialogProps {
  onBookingCreated?: () => void;
}

const CreateBookingDialog = ({ onBookingCreated }: CreateBookingDialogProps) => {
  const [open, setOpen] = useState(false);

  const handleBookingCreated = () => {
    setOpen(false);
    onBookingCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Buchung erstellen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-xl font-semibold">
              Neue Buchung erstellen
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Erstellen Sie eine neue Buchung für ein Ferienhaus
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
        
        <CreateBookingForm onSuccess={handleBookingCreated} />
      </DialogContent>
    </Dialog>
  );
};

export default CreateBookingDialog;