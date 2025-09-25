import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, Trash2, User, Phone, Mail, MapPin, Euro } from 'lucide-react';
import { cn } from '@/lib/utils';

const editTaskSchema = z.object({
  provider_id: z.string().min(1, 'Provider auswählen'),
  assigned_staff_id: z.string().optional(),
  scheduled_date: z.date({
    required_error: 'Datum erforderlich',
  }),
  scheduled_time: z.string().optional(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
  notes: z.string().optional(),
});

type EditTaskForm = z.infer<typeof editTaskSchema>;

interface EditCleaningTaskDialogProps {
  taskId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated?: () => void;
}

const EditCleaningTaskDialog = ({ taskId, open, onOpenChange, onTaskUpdated }: EditCleaningTaskDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch task details
  const { data: task, isLoading: loadingTask } = useQuery({
    queryKey: ['cleaning-task', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_tasks')
        .select(`
          *,
          houses(id, name, address),
          bookings(id, guest_name, guest_email, guest_phone, check_in, check_out, number_of_guests, booking_amount),
          service_providers(id, name),
          cleaning_assignments(id, cleaning_staff_id, cleaning_staff(id, name, email, phone, hourly_rate))
        `)
        .eq('id', taskId)
        .eq('service_type', 'cleaning')
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: open && !!taskId,
  });

  // Fetch available providers
  const { data: providers } = useQuery({
    queryKey: ['service-providers-cleaning'],
    queryFn: async () => {
      const { data } = await supabase
        .from('service_providers')
        .select('id, name')
        .eq('service_type', 'cleaning')
        .eq('is_active', true);
      return data || [];
    },
    enabled: open,
  });

  // Fetch cleaning staff for selected provider
  const { data: cleaningStaff } = useQuery({
    queryKey: ['cleaning-staff', task?.provider_id],
    queryFn: async () => {
      if (!task?.provider_id) return [];
      const { data } = await supabase
        .from('cleaning_staff')
        .select('id, name, email, phone, hourly_rate, availability_days, quality_rating')
        .eq('service_provider_id', task.provider_id)
        .eq('is_active', true);
      return data || [];
    },
    enabled: open && !!task?.provider_id,
  });

  const form = useForm<EditTaskForm>({
    resolver: zodResolver(editTaskSchema),
    defaultValues: {
      provider_id: '',
      assigned_staff_id: 'none',
      scheduled_date: new Date(),
      scheduled_time: '',
      status: 'scheduled',
      notes: '',
    },
  });

  // Update form when task data loads
  useEffect(() => {
    if (task) {
      form.reset({
        provider_id: task.provider_id || '',
        assigned_staff_id: task.cleaning_assignments?.[0]?.cleaning_staff_id || 'none',
        scheduled_date: new Date(task.scheduled_date),
        scheduled_time: task.scheduled_time || '',
        status: task.status as any,
        notes: task.notes || '',
      });
    }
  }, [task, form]);

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: async (data: EditTaskForm) => {
      // Update service task
      const { error: taskError } = await supabase
        .from('service_tasks')
        .update({
          provider_id: data.provider_id,
          scheduled_date: format(data.scheduled_date, 'yyyy-MM-dd'),
          scheduled_time: data.scheduled_time || null,
          status: data.status,
          notes: data.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      if (taskError) throw taskError;

      // Handle cleaning staff assignment
      if (data.assigned_staff_id && data.assigned_staff_id !== 'none') {
        // Check if assignment exists
        const { data: existingAssignment } = await supabase
          .from('cleaning_assignments')
          .select('id')
          .eq('service_task_id', taskId)
          .maybeSingle();

        if (existingAssignment) {
          // Update existing assignment
          const { error: assignmentError } = await supabase
            .from('cleaning_assignments')
            .update({
              cleaning_staff_id: data.assigned_staff_id,
              updated_at: new Date().toISOString(),
            })
            .eq('service_task_id', taskId);

          if (assignmentError) throw assignmentError;
        } else {
          // Create new assignment
          const { error: assignmentError } = await supabase
            .from('cleaning_assignments')
            .insert({
              service_task_id: taskId,
              cleaning_staff_id: data.assigned_staff_id,
              status: 'assigned',
            });

          if (assignmentError) throw assignmentError;
        }
      } else {
        // Remove assignment if no staff selected
        const { error: deleteError } = await supabase
          .from('cleaning_assignments')
          .delete()
          .eq('service_task_id', taskId);

        if (deleteError) throw deleteError;
      }
    },
    onSuccess: () => {
      toast({
        title: 'Erfolg',
        description: 'Reinigungsauftrag wurde aktualisiert.',
      });
      queryClient.invalidateQueries({ queryKey: ['cleaning-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['cleaning-task', taskId] });
      onTaskUpdated?.();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Aktualisieren des Auftrags.',
        variant: 'destructive',
      });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async () => {
      // First delete assignments
      await supabase
        .from('cleaning_assignments')
        .delete()
        .eq('service_task_id', taskId);

      // Then delete the task
      const { error } = await supabase
        .from('service_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Erfolg',
        description: 'Reinigungsauftrag wurde gelöscht.',
      });
      queryClient.invalidateQueries({ queryKey: ['cleaning-tasks'] });
      onTaskUpdated?.();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Löschen des Auftrags.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (data: EditTaskForm) => {
    updateTaskMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'scheduled':
        return <Badge variant="outline">Geplant</Badge>;
      case 'in_progress':
        return <Badge variant="secondary">In Bearbeitung</Badge>;
      case 'completed':
        return <Badge variant="default">Abgeschlossen</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Storniert</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const selectedStaff = cleaningStaff?.find(staff => staff.id === form.watch('assigned_staff_id'));

  if (loadingTask) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-8">
            Lädt...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!task) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Reinigungsauftrag nicht gefunden.
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">
              Reinigungsauftrag bearbeiten
            </DialogTitle>
            <div className="flex items-center gap-2">
              {getStatusBadge(task.status)}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="w-4 h-4 mr-1" />
                    Löschen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Auftrag löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Diese Aktion kann nicht rückgängig gemacht werden. Der Reinigungsauftrag wird permanent gelöscht.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => deleteTaskMutation.mutate()}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Booking Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Buchungsinformationen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{task.bookings?.guest_name}</span>
              </div>
              {task.bookings?.guest_email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{task.bookings.guest_email}</span>
                </div>
              )}
              {task.bookings?.guest_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{task.bookings.guest_phone}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">{task.houses?.name}</div>
                  <div className="text-sm text-muted-foreground">{task.houses?.address}</div>
                </div>
              </div>
              {task.bookings && (
                <>
                  <div className="text-sm">
                    <strong>Check-in:</strong> {format(new Date(task.bookings.check_in), 'dd.MM.yyyy', { locale: de })}
                  </div>
                  <div className="text-sm">
                    <strong>Check-out:</strong> {format(new Date(task.bookings.check_out), 'dd.MM.yyyy', { locale: de })}
                  </div>
                  <div className="text-sm">
                    <strong>Gäste:</strong> {task.bookings.number_of_guests}
                  </div>
                  {task.bookings.booking_amount && (
                    <div className="flex items-center gap-1 text-sm">
                      <Euro className="w-4 h-4" />
                      <strong>Betrag:</strong> {task.bookings.booking_amount}€
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Task Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Auftragsdetails</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="provider_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Provider</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Provider auswählen" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {providers?.map((provider) => (
                              <SelectItem key={provider.id} value={provider.id}>
                                {provider.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="assigned_staff_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Putzkraft zuweisen</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Putzkraft auswählen (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Keine Zuordnung</SelectItem>
                            {cleaningStaff?.map((staff) => (
                              <SelectItem key={staff.id} value={staff.id}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{staff.name}</span>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {staff.hourly_rate && <span>€{staff.hourly_rate}/h</span>}
                                    <Badge variant="outline" className="text-xs">
                                      ⭐ {staff.quality_rating?.toFixed(1) || '0.0'}
                                    </Badge>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="scheduled_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reinigungsdatum</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "dd.MM.yyyy", { locale: de })
                                ) : (
                                  <span>Datum auswählen</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="scheduled_time"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Uhrzeit (optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="time"
                              {...field}
                              value={field.value || ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="scheduled">Geplant</SelectItem>
                              <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                              <SelectItem value="completed">Abgeschlossen</SelectItem>
                              <SelectItem value="cancelled">Storniert</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notizen</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Zusätzliche Anweisungen oder Notizen..."
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      className="flex-1"
                    >
                      Abbrechen
                    </Button>
                    <Button
                      type="submit"
                      disabled={updateTaskMutation.isPending}
                      className="flex-1"
                    >
                      {updateTaskMutation.isPending ? 'Wird gespeichert...' : 'Speichern'}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {/* Selected Staff Info */}
        {selectedStaff && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Zugewiesene Putzkraft</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{selectedStaff.name}</div>
                    <div className="text-sm text-muted-foreground">
                      ⭐ {selectedStaff.quality_rating?.toFixed(1) || '0.0'} Bewertung
                    </div>
                  </div>
                </div>
                {selectedStaff.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{selectedStaff.email}</span>
                  </div>
                )}
                {selectedStaff.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{selectedStaff.phone}</span>
                  </div>
                )}
                {selectedStaff.hourly_rate && (
                  <div className="flex items-center gap-2">
                    <Euro className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">€{selectedStaff.hourly_rate}/Stunde</span>
                  </div>
                )}
                {selectedStaff.availability_days && selectedStaff.availability_days.length > 0 && (
                  <div className="col-span-full">
                    <div className="text-sm text-muted-foreground mb-2">Verfügbarkeit:</div>
                    <div className="flex gap-1 flex-wrap">
                      {selectedStaff.availability_days.map((day) => (
                        <Badge key={day} variant="outline" className="text-xs">
                          {day === 'monday' ? 'Mo' :
                           day === 'tuesday' ? 'Di' :
                           day === 'wednesday' ? 'Mi' :
                           day === 'thursday' ? 'Do' :
                           day === 'friday' ? 'Fr' :
                           day === 'saturday' ? 'Sa' :
                           day === 'sunday' ? 'So' : day}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditCleaningTaskDialog;