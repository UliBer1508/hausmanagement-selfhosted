import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, User, Calendar, Clock, Phone, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface TaskDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  task: {
    id: string;
    house: {
      name: string;
      address: string;
    } | null;
    booking: {
      guest_name: string;
      number_of_guests: number;
      check_in: string;
      check_out: string;
    } | null;
    scheduled_date: string;
    scheduled_time?: string;
    status: string;
    assigned_staff?: {
      name: string;
    } | null;
  } | null;
}

export const TaskDetailsDialog: React.FC<TaskDetailsDialogProps> = ({ 
  isOpen, 
  onClose, 
  task 
}) => {
  if (!task || !task.house || !task.booking) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'Geplant';
      case 'in_progress':
        return 'In Bearbeitung';
      case 'completed':
        return 'Abgeschlossen';
      default:
        return status;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Reinigungsauftrag Details
            <Badge className={`${getStatusColor(task.status)} border-0`}>
              {getStatusText(task.status)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* House Information */}
          <div className="space-y-2">
            <h4 className="font-semibold text-gray-900">Objekt</h4>
            <div className="space-y-1">
              <p className="font-medium">{task.house.name}</p>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="h-4 w-4" />
                <span>{task.house.address}</span>
              </div>
            </div>
          </div>

          {/* Guest Information */}
          <div className="space-y-2">
            <h4 className="font-semibold text-gray-900">Gast</h4>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-gray-400" />
                <span>{task.booking.guest_name}</span>
              </div>
              <p className="text-sm text-gray-600">
                {task.booking.number_of_guests} Gäste
              </p>
            </div>
          </div>

          {/* Booking Dates */}
          <div className="space-y-2">
            <h4 className="font-semibold text-gray-900">Buchungszeitraum</h4>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span>
                  Check-in: {format(new Date(task.booking.check_in), 'dd.MM.yyyy', { locale: de })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span>
                  Check-out: {format(new Date(task.booking.check_out), 'dd.MM.yyyy', { locale: de })}
                </span>
              </div>
            </div>
          </div>

          {/* Cleaning Schedule */}
          <div className="space-y-2">
            <h4 className="font-semibold text-gray-900">Reinigungstermin</h4>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400" />
              <span>
                {format(new Date(task.scheduled_date), 'dd.MM.yyyy', { locale: de })}
                {task.scheduled_time && ` um ${task.scheduled_time}`}
              </span>
            </div>
          </div>

          {/* Assigned Staff */}
          {task.assigned_staff && (
            <div className="space-y-2">
              <h4 className="font-semibold text-gray-900">Zugewiesene Putzkraft</h4>
              <p className="text-sm">{task.assigned_staff.name}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" size="sm" className="flex-1">
              <Phone className="h-4 w-4 mr-2" />
              Anrufen
            </Button>
            <Button variant="outline" size="sm" className="flex-1">
              <Mail className="h-4 w-4 mr-2" />
              Nachricht
            </Button>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1"
            >
              Schließen
            </Button>
            <Button 
              className="flex-1"
              onClick={() => {
                // TODO: Implement status update
                console.log('Update status for task:', task.id);
              }}
            >
              Status ändern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};