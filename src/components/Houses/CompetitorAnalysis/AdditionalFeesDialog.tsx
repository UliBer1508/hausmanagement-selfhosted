import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Euro } from 'lucide-react';
import AdditionalFeesTab from '../AdditionalFeesTab';

interface AdditionalFeesDialogProps {
  house_id: string;
}

const AdditionalFeesDialog = ({ house_id }: AdditionalFeesDialogProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Euro className="w-4 h-4 mr-2" />
          Nebenkosten
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nebenkosten-Konfiguration</DialogTitle>
        </DialogHeader>
        <AdditionalFeesTab houseId={house_id} />
      </DialogContent>
    </Dialog>
  );
};

export default AdditionalFeesDialog;
