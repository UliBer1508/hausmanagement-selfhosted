import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Home, MapPin } from 'lucide-react';
import SmartLinenInventoryDashboard from './SmartLinenInventoryDashboard';

interface LinenInventoryDialogProps {
  house: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LinenInventoryDialog = ({ house, open, onOpenChange }: LinenInventoryDialogProps) => {
  if (!house) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 gap-0">
        <DialogHeader className="px-4 py-3 md:px-6 md:py-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg md:text-xl">
            <Home className="w-5 h-5 text-primary" />
            {house.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs md:text-sm">
            <MapPin className="w-3 h-3 md:w-4 md:h-4" />
            {house.address}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
          <SmartLinenInventoryDashboard house={house} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LinenInventoryDialog;
