import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, User, Calendar, Clock, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface TaskCardProps {
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
  };
  onTaskClick: (taskId: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onTaskClick }) => {
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

  if (!task.house || !task.booking) {
    return null;
  }

  return (
    <Card className="p-4 shadow-sm border-l-4 border-l-blue-500">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{task.house.name}</h3>
          <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
            <MapPin className="h-4 w-4" />
            <span>{task.house.address}</span>
          </div>
        </div>
        <Badge className={`${getStatusColor(task.status)} border-0`}>
          {getStatusText(task.status)}
        </Badge>
      </div>

      {/* Guest Info */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-gray-400" />
          <span className="text-gray-700">
            {task.booking.guest_name} • {task.booking.number_of_guests} Gäste
          </span>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-gray-400" />
          <span className="text-gray-700">
            Check-out: {format(new Date(task.booking.check_out), 'dd.MM.yyyy', { locale: de })}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-gray-400" />
          <span className="text-gray-700">
            Geplant: {format(new Date(task.scheduled_date), 'dd.MM.yyyy', { locale: de })}
            {task.scheduled_time && ` um ${task.scheduled_time}`}
          </span>
        </div>
      </div>

      {/* Assigned Staff */}
      {task.assigned_staff && (
        <div className="mb-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Putzkraft:</span>
            <span className="font-medium text-gray-900">
              {task.assigned_staff.name}
            </span>
          </div>
        </div>
      )}

      {/* Action Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="text-blue-600 border-blue-200 hover:bg-blue-50"
          onClick={() => onTaskClick(task.id)}
        >
          Details
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </Card>
  );
};