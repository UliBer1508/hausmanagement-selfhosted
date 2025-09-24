import { useState } from 'react';
import { Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import CreateBookingForm from './CreateBookingForm';
import { Booking } from '@/types';

interface EditBookingDialogProps {
  booking: Booking;
  onBookingUpdated?: () => void;
  trigger?: React.ReactNode;
}

const EditBookingDialog = ({ booking, onBookingUpdated, trigger }: EditBookingDialogProps) => {
  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    setOpen(false);
    onBookingUpdated?.();
  };

  const defaultTrigger = (
    <Button variant="ghost" size="sm">
      <Edit className="w-4 h-4" />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buchung bearbeiten</DialogTitle>
          <DialogDescription>
            Bearbeiten Sie die Buchungsdetails für {booking.guest_name}
          </DialogDescription>
        </DialogHeader>
        <CreateBookingForm 
          mode="edit"
          initialData={booking}
          onSuccess={handleSuccess}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
};

export default EditBookingDialog;