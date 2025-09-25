import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MapPin, User, Calendar as CalendarIcon, Clock, Phone, Mail, Edit2, Save, X } from 'lucide-react';
import { format, parse } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

interface TaskDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
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
  onUpdate,
  task 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    scheduled_date: new Date(),
    scheduled_time: '',
    status: 'scheduled',
    assigned_staff_id: ''
  });

  // Fetch cleaning staff for dropdown
  const { data: cleaningStaff } = useQuery({
    queryKey: ['cleaning-staff-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleaning_staff')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Initialize form data when task changes
  React.useEffect(() => {
    if (task) {
      setFormData({
        scheduled_date: new Date(task.scheduled_date),
        scheduled_time: task.scheduled_time || '',
        status: task.status,
        assigned_staff_id: ''
      });
    }
  }, [task]);

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

  const handleSave = async () => {
    if (!formData.scheduled_date) {
      toast.error('Datum ist erforderlich');
      return;
    }

    setIsLoading(true);
    try {
      const updateData: any = {
        scheduled_date: formData.scheduled_date.toISOString().split('T')[0],
        status: formData.status
      };

      if (formData.scheduled_time) {
        updateData.scheduled_time = formData.scheduled_time;
      }

      if (formData.assigned_staff_id) {
        updateData.assigned_staff_id = formData.assigned_staff_id;
      }

      const { error } = await supabase
        .from('service_tasks')
        .update(updateData)
        .eq('id', task.id);

      if (error) throw error;

      toast.success('Auftrag erfolgreich aktualisiert');
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error: any) {
      toast.error('Fehler beim Aktualisieren: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    if (task) {
      setFormData({
        scheduled_date: new Date(task.scheduled_date),
        scheduled_time: task.scheduled_time || '',
        status: task.status,
        assigned_staff_id: ''
      });
    }
    setIsEditing(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Reinigungsauftrag Details
            <div className="flex items-center gap-2">
              <Badge className={`${getStatusColor(isEditing ? formData.status : task.status)} border-0`}>
                {getStatusText(isEditing ? formData.status : task.status)}
              </Badge>
              {!isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
            </div>
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
                <CalendarIcon className="h-4 w-4 text-gray-400" />
                <span>
                  Check-in: {format(new Date(task.booking.check_in), 'dd.MM.yyyy', { locale: de })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CalendarIcon className="h-4 w-4 text-gray-400" />
                <span>
                  Check-out: {format(new Date(task.booking.check_out), 'dd.MM.yyyy', { locale: de })}
                </span>
              </div>
            </div>
          </div>

          {/* Cleaning Schedule - Editable */}
          <div className="space-y-2">
            <h4 className="font-semibold text-gray-900">Reinigungstermin</h4>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <Label>Datum</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.scheduled_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.scheduled_date ? (
                          format(formData.scheduled_date, 'dd.MM.yyyy', { locale: de })
                        ) : (
                          <span>Datum wählen</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.scheduled_date}
                        onSelect={(date) => date && setFormData({...formData, scheduled_date: date})}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="time">Zeit</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.scheduled_time}
                    onChange={(e) => setFormData({...formData, scheduled_time: e.target.value})}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-gray-400" />
                <span>
                  {format(new Date(task.scheduled_date), 'dd.MM.yyyy', { locale: de })}
                  {task.scheduled_time && ` um ${task.scheduled_time}`}
                </span>
              </div>
            )}
          </div>

          {/* Status - Editable */}
          {isEditing && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Status wählen" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border shadow-lg z-50">
                  <SelectItem value="scheduled">Geplant</SelectItem>
                  <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                  <SelectItem value="completed">Abgeschlossen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Assigned Staff - Editable */}
          <div className="space-y-2">
            <h4 className="font-semibold text-gray-900">Zugewiesene Putzkraft</h4>
            {isEditing ? (
              <Select value={formData.assigned_staff_id} onValueChange={(value) => setFormData({...formData, assigned_staff_id: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Putzkraft wählen" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border shadow-lg z-50">
                  <SelectItem value="">Keine Zuweisung</SelectItem>
                  {cleaningStaff?.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm">{task.assigned_staff?.name || 'Nicht zugewiesen'}</p>
            )}
          </div>

          {/* Action Buttons */}
          {!isEditing && (
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
          )}

          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleCancel}
                  className="flex-1"
                  disabled={isLoading}
                >
                  <X className="h-4 w-4 mr-2" />
                  Abbrechen
                </Button>
                <Button 
                  onClick={handleSave}
                  className="flex-1"
                  disabled={isLoading}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Speichern
                </Button>
              </>
            ) : (
              <Button 
                variant="outline" 
                onClick={onClose}
                className="flex-1"
              >
                Schließen
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};