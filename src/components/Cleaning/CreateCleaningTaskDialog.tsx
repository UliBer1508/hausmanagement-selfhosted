import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Plus, CalendarIcon, User } from 'lucide-react';

const createTaskSchema = z.object({
  house_id: z.string().min(1, 'Haus auswählen'),
  booking_id: z.string().optional(),
  provider_id: z.string().min(1, 'Provider auswählen'),
  scheduled_date: z.string().min(1, 'Datum erforderlich'),
  scheduled_time: z.string().optional(),
  notes: z.string().optional(),
});

type CreateTaskForm = z.infer<typeof createTaskSchema>;

interface CreateCleaningTaskDialogProps {
  onTaskCreated?: () => void;
}

const CreateCleaningTaskDialog = ({ onTaskCreated }: CreateCleaningTaskDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CreateTaskForm>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      house_id: '',
      booking_id: '',
      provider_id: '',
      scheduled_date: '',
      scheduled_time: '10:00',
      notes: '',
    },
  });

  // Fetch houses for dropdown
  const { data: houses } = useQuery({
    queryKey: ['houses'],
    queryFn: async () => {
      const { data } = await supabase.from('houses').select('id, name, address');
      return data || [];
    },
  });

  // Fetch cleaning service providers
  const { data: providers } = useQuery({
    queryKey: ['cleaning-providers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('service_providers')
        .select('id, name')
        .eq('service_type', 'cleaning')
        .eq('is_active', true);
      return data || [];
    },
  });

  // Fetch bookings for selected house
  const selectedHouseId = form.watch('house_id');
  const selectedBookingId = form.watch('booking_id');
  const { data: bookings } = useQuery({
    queryKey: ['house-bookings', selectedHouseId],
    queryFn: async () => {
      if (!selectedHouseId) return [];
      const { data } = await supabase
        .from('bookings')
        .select('id, guest_name, guest_email, guest_phone, check_in, check_out, number_of_guests, booking_amount, currency')
        .eq('house_id', selectedHouseId)
        .neq('status', 'completed')
        .gte('check_out', new Date().toISOString())
        .order('check_in', { ascending: true });
      return data || [];
    },
    enabled: !!selectedHouseId,
  });

  // Get selected booking details
  const selectedBooking = bookings?.find(b => b.id === selectedBookingId);

  // Auto-suggest cleaning date based on booking
  const suggestCleaningDate = (booking: any) => {
    const checkOut = new Date(booking.check_out);
    // Suggest cleaning on checkout day
    return checkOut.toISOString().split('T')[0];
  };

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: CreateTaskForm) => {
      const taskData = {
        house_id: data.house_id,
        booking_id: data.booking_id || null,
        provider_id: data.provider_id,
        service_type: 'cleaning' as const,
        scheduled_date: data.scheduled_date,
        scheduled_time: data.scheduled_time || null,
        status: 'scheduled' as const,
        notes: data.notes || null,
      };

      const { data: result, error } = await supabase
        .from('service_tasks')
        .insert(taskData)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast({
        title: 'Erfolg',
        description: 'Reinigungsauftrag wurde erstellt',
      });
      queryClient.invalidateQueries({ queryKey: ['cleaning-tasks'] });
      form.reset();
      setOpen(false);
      onTaskCreated?.();
    },
    onError: (error) => {
      console.error('Error creating task:', error);
      toast({
        title: 'Fehler',
        description: 'Fehler beim Erstellen des Auftrags',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: CreateTaskForm) => {
    createTaskMutation.mutate(data);
  };

  const formatBookingDisplay = (booking: any) => {
    const checkIn = new Date(booking.check_in).toLocaleDateString('de-DE');
    const checkOut = new Date(booking.check_out).toLocaleDateString('de-DE');
    return `${booking.guest_name} (${checkIn} - ${checkOut})`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Neuen Auftrag erstellen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Neuen Reinigungsauftrag erstellen
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Haus auswählen */}
              <FormField
                control={form.control}
                name="house_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Haus *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Haus auswählen..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {houses?.map((house) => (
                          <SelectItem key={house.id} value={house.id}>
                            {house.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Provider auswählen */}
              <FormField
                control={form.control}
                name="provider_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Provider *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Provider auswählen..." />
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
            </div>

            {/* Buchungsvorschau */}
            {selectedBooking && (
              <div className="border rounded-lg p-4 bg-muted/50 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Ausgewählte Buchung</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const suggestedDate = suggestCleaningDate(selectedBooking);
                      form.setValue('scheduled_date', suggestedDate);
                    }}
                  >
                    Datum vorschlagen
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{selectedBooking.guest_name}</span>
                    </div>
                    {selectedBooking.guest_email && (
                      <div className="text-muted-foreground">
                        📧 {selectedBooking.guest_email}
                      </div>
                    )}
                    {selectedBooking.guest_phone && (
                      <div className="text-muted-foreground">
                        📞 {selectedBooking.guest_phone}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span>{selectedBooking.number_of_guests} Gäste</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-green-600 font-medium">
                        Check-in: {new Date(selectedBooking.check_in).toLocaleDateString('de-DE')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-red-600 font-medium">
                        Check-out: {new Date(selectedBooking.check_out).toLocaleDateString('de-DE')}
                      </span>
                    </div>
                    {selectedBooking.booking_amount && (
                      <div className="text-muted-foreground">
                        💰 {selectedBooking.booking_amount} {selectedBooking.currency || 'EUR'}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-border/50">
                  <div className="text-xs text-muted-foreground">
                    <strong>Empfehlung:</strong> Reinigung nach Check-out am{' '}
                    <span className="font-medium">
                      {new Date(selectedBooking.check_out).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {/* Buchung auswählen (optional) */}
            {selectedHouseId && bookings && bookings.length > 0 && (
              <FormField
                control={form.control}
                name="booking_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Buchung (optional)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Buchung zuordnen..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Keine Buchung zuordnen</SelectItem>
                        {bookings.map((booking) => (
                          <SelectItem key={booking.id} value={booking.id}>
                            {formatBookingDisplay(booking)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Auftrag einer bestimmten Buchung zuordnen
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Datum */}
              <FormField
                control={form.control}
                name="scheduled_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Datum *</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Uhrzeit */}
              <FormField
                control={form.control}
                name="scheduled_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Uhrzeit</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Geplante Startzeit (optional)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Notizen */}
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
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Abbrechen
              </Button>
              <Button
                type="submit"
                disabled={createTaskMutation.isPending}
              >
                {createTaskMutation.isPending ? 'Erstelle...' : 'Auftrag erstellen'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateCleaningTaskDialog;