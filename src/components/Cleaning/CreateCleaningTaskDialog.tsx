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
import { Card, CardContent } from '@/components/ui/card';
import { Plus, CalendarIcon, User } from 'lucide-react';

const createTaskSchema = z.object({
  house_id: z.string().min(1, 'Haus auswählen'),
  booking_id: z.string().min(1, 'Buchung auswählen'),
  provider_id: z.string().min(1, 'Provider auswählen'),
  assigned_staff_id: z.string().optional(),
  scheduled_date: z.string().min(1, 'Datum erforderlich'),
  scheduled_time: z.string().optional(),
  notes: z.string().optional(),
});

type CreateTaskForm = z.infer<typeof createTaskSchema>;

interface CreateCleaningTaskDialogProps {
  onTaskCreated?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  preselectedBooking?: any;
}

const CreateCleaningTaskDialog = ({ onTaskCreated, open: externalOpen, onOpenChange, preselectedBooking }: CreateCleaningTaskDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [step, setStep] = useState<'house' | 'booking' | 'details'>('house');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use external open state if provided, otherwise use internal
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const form = useForm<CreateTaskForm>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      house_id: '',
      booking_id: '',
      provider_id: '',
      assigned_staff_id: 'none',
      scheduled_date: '',
      scheduled_time: '10:00',
      notes: '',
    },
  });

  // Reset form and step when dialog opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setStep('house');
      form.reset();
    }
  };

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

  // Fetch cleaning staff for selected provider
  const selectedProviderId = form.watch('provider_id');
  const { data: cleaningStaff } = useQuery({
    queryKey: ['cleaning-staff', selectedProviderId],
    queryFn: async () => {
      if (!selectedProviderId) return [];
      const { data } = await supabase
        .from('cleaning_staff')
        .select('id, name, email, phone, hourly_rate, availability_days, quality_rating')
        .eq('service_provider_id', selectedProviderId)
        .eq('is_active', true);
      return data || [];
    },
    enabled: !!selectedProviderId,
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
        booking_id: data.booking_id,
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

      // Handle cleaning staff assignment if provided
      if (data.assigned_staff_id && data.assigned_staff_id !== 'none') {
        const { error: assignmentError } = await supabase
          .from('cleaning_assignments')
          .insert({
            service_task_id: result.id,
            cleaning_staff_id: data.assigned_staff_id,
            status: 'assigned',
          });

        if (assignmentError) throw assignmentError;
      }

      return result;
    },
    onSuccess: () => {
      toast({
        title: 'Erfolg',
        description: 'Reinigungsauftrag wurde erstellt',
      });
      queryClient.invalidateQueries({ queryKey: ['cleaning-tasks'] });
      form.reset();
      setStep('house');
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

  const handleHouseSelection = (houseId: string) => {
    form.setValue('house_id', houseId);
    setStep('booking');
  };

  const handleBookingSelection = (bookingId: string) => {
    form.setValue('booking_id', bookingId);
    const booking = bookings?.find(b => b.id === bookingId);
    if (booking) {
      const suggestedDate = suggestCleaningDate(booking);
      form.setValue('scheduled_date', suggestedDate);
    }
    setStep('details');
  };

  const handleBackToBookings = () => {
    form.setValue('booking_id', '');
    setStep('booking');
  };

  const handleBackToHouses = () => {
    form.setValue('house_id', '');
    form.setValue('booking_id', '');
    setStep('house');
  };

  const onSubmit = (data: CreateTaskForm) => {
    createTaskMutation.mutate(data);
  };

  const getStepTitle = () => {
    switch (step) {
      case 'house':
        return 'Schritt 1: Haus auswählen';
      case 'booking':
        return 'Schritt 2: Buchung auswählen';
      case 'details':
        return 'Schritt 3: Reinigungsdetails';
      default:
        return 'Neuen Reinigungsauftrag erstellen';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Neuen Reinigungsauftrag erstellen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {getStepTitle()}
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className={`w-2 h-2 rounded-full ${step === 'house' ? 'bg-primary' : 'bg-muted'}`} />
            <span>Haus</span>
            <div className={`w-2 h-2 rounded-full ${step === 'booking' ? 'bg-primary' : 'bg-muted'}`} />
            <span>Buchung</span>
            <div className={`w-2 h-2 rounded-full ${step === 'details' ? 'bg-primary' : 'bg-muted'}`} />
            <span>Details</span>
          </div>
        </DialogHeader>

        {/* Step 1: House Selection */}
        {step === 'house' && (
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">Wählen Sie ein Haus aus:</Label>
              <p className="text-sm text-muted-foreground">Für welches Haus soll der Reinigungsauftrag erstellt werden?</p>
            </div>
            <div className="grid gap-3">
              {houses?.map((house) => (
                <Card
                  key={house.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleHouseSelection(house.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">{house.name}</h4>
                        <p className="text-sm text-muted-foreground">{house.address}</p>
                      </div>
                      <Button variant="ghost" size="sm">
                        Auswählen →
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Booking Selection */}
        {step === 'booking' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">
                  Buchung für {houses?.find(h => h.id === form.watch('house_id'))?.name}
                </Label>
                <p className="text-sm text-muted-foreground">Wählen Sie die Buchung für die Reinigung aus:</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleBackToHouses}>
                ← Haus ändern
              </Button>
            </div>
            
            <div className="grid gap-3">
              {bookings && bookings.length > 0 ? (
                bookings.map((booking) => (
                  <Card
                    key={booking.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleBookingSelection(booking.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            <h4 className="font-semibold">{booking.guest_name}</h4>
                            <span className="text-sm text-muted-foreground">({booking.number_of_guests} Gäste)</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="text-green-600">
                              📅 {new Date(booking.check_in).toLocaleDateString('de-DE')}
                            </span>
                            <span>→</span>
                            <span className="text-red-600">
                              📅 {new Date(booking.check_out).toLocaleDateString('de-DE')}
                            </span>
                          </div>
                          {booking.booking_amount && (
                            <div className="text-sm text-muted-foreground">
                              💰 {booking.booking_amount} {booking.currency || 'EUR'}
                            </div>
                          )}
                        </div>
                        <Button variant="ghost" size="sm">
                          Auswählen →
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Keine aktuellen Buchungen für dieses Haus gefunden.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Cleaning Details */}
        {step === 'details' && selectedBooking && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              {/* Booking Summary */}
              <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Buchungsübersicht</h4>
                  <Button variant="outline" size="sm" onClick={handleBackToBookings}>
                    ← Buchung ändern
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div><strong>Haus:</strong> {houses?.find(h => h.id === form.watch('house_id'))?.name}</div>
                    <div><strong>Gast:</strong> {selectedBooking.guest_name}</div>
                    <div><strong>Gäste:</strong> {selectedBooking.number_of_guests}</div>
                    {selectedBooking.guest_email && (
                      <div><strong>E-Mail:</strong> {selectedBooking.guest_email}</div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div><strong>Check-in:</strong> {new Date(selectedBooking.check_in).toLocaleDateString('de-DE')}</div>
                    <div><strong>Check-out:</strong> {new Date(selectedBooking.check_out).toLocaleDateString('de-DE')}</div>
                    {selectedBooking.booking_amount && (
                      <div><strong>Betrag:</strong> {selectedBooking.booking_amount} {selectedBooking.currency || 'EUR'}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Cleaning Details Form */}
              <div className="space-y-4">
                <h4 className="font-semibold">Reinigungsdetails definieren</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                  {/* Putzkraft auswählen */}
                  <FormField
                    control={form.control}
                    name="assigned_staff_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Putzkraft zuweisen (optional)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Putzkraft auswählen..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Keine Zuordnung</SelectItem>
                            {cleaningStaff?.map((staff) => (
                              <SelectItem key={staff.id} value={staff.id}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{staff.name}</span>
                                  {staff.hourly_rate && (
                                    <span className="text-xs text-muted-foreground">€{staff.hourly_rate}/h</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                </div>

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
                          className="w-40"
                        />
                      </FormControl>
                      <FormDescription>
                        Geplante Startzeit (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
              </div>

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
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CreateCleaningTaskDialog;