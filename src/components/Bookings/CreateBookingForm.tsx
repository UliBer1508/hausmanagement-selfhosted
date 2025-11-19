import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarIcon, Loader2, ShoppingCart } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCreateBooking, useUpdateBooking } from '@/hooks/useBookings';
import { useUpdateServiceTask } from '@/hooks/useServiceTasks';
import { Booking, BookingWithHouse } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const bookingSchema = z.object({
  house_id: z.string().min(1, 'Ferienhaus ist erforderlich'),
  number_of_guests: z.number().min(1, 'Mindestens 1 Gast erforderlich').max(20, 'Maximum 20 Gäste'),
  check_in: z.date({
    required_error: 'Check-in Datum ist erforderlich',
  }),
  check_out: z.date({
    required_error: 'Check-out Datum ist erforderlich',
  }),
  guest_name: z.string().min(1, 'Gastname ist erforderlich').max(100, 'Name zu lang'),
  guest_email: z.string().email('Ungültige E-Mail Adresse').optional().or(z.literal('')),
  guest_phone: z.string().optional(),
  nationality: z.string().refine((val) => val === '' || val === 'none' || val.length === 2, {
    message: 'Nationalität muss ein 2-stelliges Länderkürzel sein oder leer bleiben'
  }).optional(),
  booking_amount: z.number().optional(),
  currency: z.string().default('EUR'),
  status: z.enum(['confirmed', 'checked_in', 'completed', 'cancelled']).default('confirmed'),
  platform: z.string().optional(),
  notes: z.string().optional(),
  cancellation_date: z.string().optional(),
  cancellation_reason: z.string().optional(),
  cancelled_by: z.string().optional(),
}).refine((data) => data.check_out > data.check_in, {
  message: 'Check-out muss nach Check-in liegen',
  path: ['check_out'],
});

// Länderliste für Nationalität
const countries = [
  { code: 'DE', name: 'Deutschland' },
  { code: 'AT', name: 'Österreich' },
  { code: 'CH', name: 'Schweiz' },
  { code: 'NL', name: 'Niederlande' },
  { code: 'BE', name: 'Belgien' },
  { code: 'FR', name: 'Frankreich' },
  { code: 'IT', name: 'Italien' },
  { code: 'ES', name: 'Spanien' },
  { code: 'PT', name: 'Portugal' },
  { code: 'UK', name: 'Vereinigtes Königreich' },
  { code: 'IE', name: 'Irland' },
  { code: 'DK', name: 'Dänemark' },
  { code: 'SE', name: 'Schweden' },
  { code: 'NO', name: 'Norwegen' },
  { code: 'FI', name: 'Finnland' },
  { code: 'PL', name: 'Polen' },
  { code: 'CZ', name: 'Tschechien' },
  { code: 'SK', name: 'Slowakei' },
  { code: 'HU', name: 'Ungarn' },
  { code: 'SI', name: 'Slowenien' },
  { code: 'HR', name: 'Kroatien' },
  { code: 'RO', name: 'Rumänien' },
  { code: 'BG', name: 'Bulgarien' },
  { code: 'GR', name: 'Griechenland' },
  { code: 'CY', name: 'Zypern' },
  { code: 'MT', name: 'Malta' },
  { code: 'LU', name: 'Luxemburg' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'MC', name: 'Monaco' },
  { code: 'US', name: 'USA' },
  { code: 'CA', name: 'Kanada' },
  { code: 'AU', name: 'Australien' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'Indien' },
  { code: 'BR', name: 'Brasilien' },
  { code: 'AR', name: 'Argentinien' },
  { code: 'MX', name: 'Mexiko' },
  { code: 'RU', name: 'Russland' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'TR', name: 'Türkei' },
  { code: 'ZA', name: 'Südafrika' },
];

type BookingFormData = z.infer<typeof bookingSchema>;

interface CreateBookingFormProps {
  mode?: 'create' | 'edit';
  initialData?: BookingWithHouse;
  onSuccess: () => void;
  onCancel?: () => void;
}

const CreateBookingForm = ({ mode = 'create', initialData, onSuccess, onCancel }: CreateBookingFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper function to set standard time on date
  const setTimeOnDate = (date: Date, hours: number, minutes: number = 0): Date => {
    const newDate = new Date(date);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
  };
  const [showCancelCleaningDialog, setShowCancelCleaningDialog] = useState(false);
  const [relatedCleaningTasks, setRelatedCleaningTasks] = useState<any[]>([]);
  const [pendingBookingData, setPendingBookingData] = useState<any>(null);
  const [linenOrderDialogOpen, setLinenOrderDialogOpen] = useState(false);
  const [prefilledOrderData, setPrefilledOrderData] = useState<any>(null);
  
  const { toast } = useToast();

  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();
  const updateServiceTask = useUpdateServiceTask();

  // Set default values based on mode and initial data
  const getDefaultValues = () => {
    if (mode === 'edit' && initialData) {
      return {
        house_id: initialData.houses?.id || initialData.house_id,
        number_of_guests: initialData.number_of_guests,
        check_in: new Date(initialData.check_in),
        check_out: new Date(initialData.check_out),
        guest_name: initialData.guest_name,
        guest_email: initialData.guest_email || '',
        guest_phone: initialData.guest_phone || '',
        nationality: initialData.nationality && initialData.nationality !== 'none' ? initialData.nationality : '',
        booking_amount: initialData.booking_amount || undefined,
        currency: initialData.currency || 'EUR',
        status: initialData.status || 'confirmed',
        platform: initialData.platform || 'none',
        notes: initialData.notes || '',
      };
    }
    return {
      number_of_guests: 1,
      currency: 'EUR',
      status: 'confirmed' as const,
      guest_email: '',
      guest_phone: '',
      nationality: '',
      platform: 'none',
      notes: '',
    };
  };

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: getDefaultValues(),
  });

  // Reset form when initial data changes (for edit mode)
  useEffect(() => {
    if (mode === 'edit' && initialData) {
      console.log('Edit mode - initialData:', JSON.stringify(initialData, null, 2));
      console.log('booking_amount from initialData:', initialData.booking_amount);
      const values = getDefaultValues();
      console.log('Form values being set:', JSON.stringify(values, null, 2));
      form.reset(values);
    }
  }, [initialData, mode, form]);

  // Fetch houses for dropdown
  const { data: houses, isLoading: housesLoading } = useQuery({
    queryKey: ['houses-for-booking'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name, max_guests')
        .eq('rental_type', 'tourist')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const onSubmit = async (data: BookingFormData) => {
    console.log('🔵 FORM SUBMIT CALLED');
    console.log('Form submit - mode:', mode);
    console.log('Check-in:', data.check_in.toISOString());
    console.log('Check-out:', data.check_out.toISOString());
    console.log('House ID:', data.house_id);
    console.log('Guest name:', data.guest_name);
    
    try {
      setIsSubmitting(true);
      
      // Prüfen ob Status zu "cancelled" wechselt (nur im Edit-Mode)
      const isBeingCancelled = mode === 'edit' && 
                              initialData?.status !== 'cancelled' && 
                              data.status === 'cancelled';
      
      if (isBeingCancelled && initialData?.id) {
        // Frage nach Stornierungsgrund
        const reason = prompt('Bitte geben Sie den Stornierungsgrund ein (optional):');
        const cancelledBy = prompt('Storniert durch (z.B. "Gast", "Host", "System"):') || 'Host';
        
        // Stornierungsinformationen zur Buchung hinzufügen
        data.cancellation_date = new Date().toISOString();
        data.cancellation_reason = reason || undefined;
        data.cancelled_by = cancelledBy;
        
        // Suche nach zugehörigen Reinigungsaufträgen
        const { data: cleaningTasks, error: tasksError } = await supabase
          .from('service_tasks')
          .select('*')
          .eq('booking_id', initialData.id)
          .eq('service_type', 'cleaning')
          .neq('status', 'cancelled')
          .neq('status', 'completed');
        
        if (tasksError) throw tasksError;
        
        if (cleaningTasks && cleaningTasks.length > 0) {
          // Aufgaben gefunden - Dialog anzeigen
          setRelatedCleaningTasks(cleaningTasks);
          setPendingBookingData(data);
          setShowCancelCleaningDialog(true);
          setIsSubmitting(false);
          return; // Warten auf Benutzerentscheidung
        }
      }
      
      // Normale Buchungsaktualisierung fortsetzen
      await performBookingUpdate(data);
      
    } catch (error: any) {
      console.error('Booking error:', error);
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Speichern der Buchung',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    }
  };

  const performBookingUpdate = async (data: BookingFormData) => {
    try {
      console.log('performBookingUpdate - check_in:', data.check_in.toISOString());
      console.log('performBookingUpdate - check_out:', data.check_out.toISOString());
      
      // Check for conflicting bookings (skip for same booking in edit mode)
      let query = supabase
        .from('bookings')
        .select('id, guest_name, check_in, check_out, status')
        .eq('house_id', data.house_id)
        .in('status', ['confirmed', 'checked_in']);

      // Only exclude the current booking ID in edit mode
      if (mode === 'edit' && initialData) {
        query = query.neq('id', initialData.id);
      }

      const { data: allBookings, error: conflictError } = await query;
      
      console.log('🔍 CONFLICT CHECK START');
      console.log('House ID:', data.house_id);
      console.log('New booking times:', data.check_in.toISOString(), 'to', data.check_out.toISOString());
      console.log('All non-cancelled bookings for this house:', allBookings);

      if (conflictError) throw conflictError;
      
      // Manual overlap check
      const conflictingBookings = allBookings?.filter(booking => {
        // ✅ CHECK 1: Eigene Buchung im Edit-Mode ausschließen
        if (mode === 'edit' && initialData?.id && booking.id === initialData.id) {
          console.log('⏭️ SKIPPING: Same booking being edited (ID:', booking.id, ')');
          return false;
        }
        
        // ✅ CHECK 2: Stornierte Buchungen ignorieren
        if (booking.status === 'cancelled') {
          console.log('⏭️ SKIPPING: Cancelled booking (ID:', booking.id, ')');
          return false;
        }
        
        const bookingCheckIn = new Date(booking.check_in);
        const bookingCheckOut = new Date(booking.check_out);
        const newCheckIn = data.check_in;
        const newCheckOut = data.check_out;
        
        console.log('---');
        console.log('Checking booking:', booking.guest_name, booking.status);
        console.log('Existing: CheckIn:', bookingCheckIn.toISOString(), 'CheckOut:', bookingCheckOut.toISOString());
        console.log('New:      CheckIn:', newCheckIn.toISOString(), 'CheckOut:', newCheckOut.toISOString());
        
        // Check if there's an overlap
        const condition1 = bookingCheckIn < newCheckOut;
        const condition2 = bookingCheckOut > newCheckIn;
        
        // Allow same-day turnover: If check-out time equals check-in time exactly, it's NOT a conflict
        const isSameDayTurnover = bookingCheckOut.getTime() === newCheckIn.getTime();
        
        const hasOverlap = condition1 && condition2 && !isSameDayTurnover;
        
        console.log('Overlap check: bookingCheckIn < newCheckOut?', condition1);
        console.log('Overlap check: bookingCheckOut > newCheckIn?', condition2);
        console.log('Same-day turnover (exact match)?', isSameDayTurnover);
        console.log('Has overlap?', hasOverlap);
        
        if (hasOverlap) {
          console.log('❌ CONFLICT FOUND with:', booking.guest_name);
        }
        
        return hasOverlap;
      }) || [];
      
      console.log('🔍 CONFLICT CHECK END - Total conflicts:', conflictingBookings.length);

      if (conflictingBookings && conflictingBookings.length > 0) {
        const conflictDetails = conflictingBookings[0];
        toast({
          title: 'Buchungskonflikt',
          description: `Konflikt mit Buchung von ${conflictDetails.guest_name} (${format(new Date(conflictDetails.check_in), 'dd.MM.yyyy HH:mm', { locale: de })} - ${format(new Date(conflictDetails.check_out), 'dd.MM.yyyy HH:mm', { locale: de })})`,
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      // Prepare booking data
      const bookingData = {
        house_id: data.house_id,
        number_of_guests: data.number_of_guests,
        check_in: data.check_in.toISOString(),
        check_out: data.check_out.toISOString(),
        guest_name: data.guest_name.trim(),
        guest_email: data.guest_email || null,
        guest_phone: data.guest_phone || null,
        nationality: (data.nationality && data.nationality !== 'none' && data.nationality !== '') ? data.nationality : null,
        booking_amount: data.booking_amount || null,
        currency: data.currency || 'EUR',
        platform: (data.platform && data.platform !== 'none') ? data.platform : null,
        notes: data.notes || null,
        status: data.status,
        source: 'manual',
      };

      console.log('Prepared booking data for save:', bookingData);

      if (mode === 'edit' && initialData) {
        console.log('Updating booking with ID:', initialData.id);
        // Update existing booking
        await updateBooking.mutateAsync({
          id: initialData.id,
          ...bookingData,
        });

        console.log('Booking updated successfully');
        toast({
          title: 'Buchung aktualisiert',
          description: 'Die Buchung wurde erfolgreich aktualisiert.',
        });
      } else {
        console.log('Creating new booking');
        // Create new booking
        await createBooking.mutateAsync(bookingData);

        console.log('Booking created successfully');
        toast({
          title: 'Buchung erstellt',
          description: 'Die Buchung wurde erfolgreich erstellt.',
        });
      }

      onSuccess();
    } catch (error: any) {
      console.error('Booking update error:', error);
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Speichern der Buchung',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelCleaningTasks = async () => {
    try {
      setShowCancelCleaningDialog(false);
      setIsSubmitting(true);
      
      // Alle gefundenen Reinigungsaufträge auf "cancelled" setzen
      for (const task of relatedCleaningTasks) {
        await updateServiceTask.mutateAsync({
          id: task.id,
          status: 'cancelled',
        });
      }
      
      toast({
        title: 'Reinigungsaufträge storniert',
        description: `${relatedCleaningTasks.length} ${relatedCleaningTasks.length === 1 ? 'Reinigungsauftrag wurde' : 'Reinigungsaufträge wurden'} auf "Storniert" gesetzt.`,
      });
      
      // Jetzt die Buchung aktualisieren
      if (pendingBookingData) {
        await performBookingUpdate(pendingBookingData);
      }
      
    } catch (error: any) {
      console.error('Error cancelling cleaning tasks:', error);
      toast({
        title: 'Fehler',
        description: 'Fehler beim Stornieren der Reinigungsaufträge',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    } finally {
      setRelatedCleaningTasks([]);
      setPendingBookingData(null);
    }
  };

  const handleKeepCleaningTasks = async () => {
    setShowCancelCleaningDialog(false);
    
    toast({
      title: 'Reinigungsaufträge beibehalten',
      description: 'Die Reinigungsaufträge bleiben aktiv.',
    });
    
    // Nur Buchung aktualisieren
    if (pendingBookingData) {
      await performBookingUpdate(pendingBookingData);
    }
    
    setRelatedCleaningTasks([]);
    setPendingBookingData(null);
  };

  // Generate linen order for this booking
  const generateLinenOrderMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.functions.invoke('generate-booking-linen-order', {
        body: { booking_id: bookingId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Wäschebestellung berechnet",
        description: `${data.total_items} Teile für ${data.booking.guest_name} - Geschätzte Kosten: ${data.estimated_cost} EUR`
      });
      
      setPrefilledOrderData(data);
      setLinenOrderDialogOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: error.message || "Fehler beim Erstellen der Wäschebestellung",
        variant: "destructive"
      });
    }
  });

  const handleGenerateLinenOrder = () => {
    if (initialData?.id) {
      generateLinenOrderMutation.mutate(initialData.id);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Ferienhaus */}
          <FormField
            control={form.control}
            name="house_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ferienhaus *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ferienhaus wählen" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    {housesLoading ? (
                      <SelectItem value="loading" disabled>Lädt...</SelectItem>
                    ) : (
                      houses?.map((house) => (
                        <SelectItem key={house.id} value={house.id}>
                          {house.name} (max. {house.max_guests} Gäste)
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Anzahl Gäste */}
          <FormField
            control={form.control}
            name="number_of_guests"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Anzahl Gäste *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Anzahl Gäste"
                    min="1"
                    max="20"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                    value={field.value || ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Check-in Datum */}
          <FormField
            control={form.control}
            name="check_in"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Check-in Datum *</FormLabel>
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
                          format(field.value, "dd.MM.yyyy HH:mm", { locale: de })
                        ) : (
                          <span>Datum wählen</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background border shadow-lg z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => date && field.onChange(setTimeOnDate(date, 15))}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      locale={de}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Check-out Datum */}
          <FormField
            control={form.control}
            name="check_out"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Check-out Datum *</FormLabel>
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
                          format(field.value, "dd.MM.yyyy HH:mm", { locale: de })
                        ) : (
                          <span>Datum wählen</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background border shadow-lg z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => date && field.onChange(setTimeOnDate(date, 10))}
                      disabled={(date) => {
                        const checkIn = form.getValues('check_in');
                        return date < new Date() || (checkIn && date <= checkIn);
                      }}
                      initialFocus
                      locale={de}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gastname */}
          <FormField
            control={form.control}
            name="guest_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gastname *</FormLabel>
                <FormControl>
                  <Input placeholder="Name des Gastes" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* E-Mail */}
          <FormField
            control={form.control}
            name="guest_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-Mail</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="E-Mail Adresse" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Telefon */}
          <FormField
            control={form.control}
            name="guest_phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefon</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="Telefonnummer" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Nationalität */}
          <FormField
            control={form.control}
            name="nationality"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nationalität</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Land wählen" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-background border shadow-lg z-50 max-h-60">
                    <SelectItem value="none">Keine Angabe</SelectItem>
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.code} - {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Platform */}
          <FormField
            control={form.control}
            name="platform"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Plattform</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || 'none'}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Plattform wählen" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="none">Keine Angabe</SelectItem>
                    <SelectItem value="booking.com">Booking.com</SelectItem>
                    <SelectItem value="airbnb">Airbnb</SelectItem>
                    <SelectItem value="vrbo">VRBO</SelectItem>
                    <SelectItem value="belvilla">Belvilla</SelectItem>
                    <SelectItem value="direct">Direktbuchung</SelectItem>
                    <SelectItem value="other">Sonstige</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Buchungsbetrag */}
          <FormField
            control={form.control}
            name="booking_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Buchungsbetrag</FormLabel>
                <div className="flex space-x-2">
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                      value={field.value || ''}
                      className="flex-1"
                    />
                  </FormControl>
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field: currencyField }) => (
                      <Select onValueChange={currencyField.onChange} value={currencyField.value}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background border shadow-lg z-50">
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="CHF">CHF</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Status */}
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Status wählen" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="confirmed">Bestätigt</SelectItem>
                    <SelectItem value="checked_in">Eingecheckt</SelectItem>
                    <SelectItem value="completed">Abgeschlossen</SelectItem>
                    <SelectItem value="cancelled">Storniert</SelectItem>
                  </SelectContent>
                </Select>
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
                  placeholder="Zusätzliche Notizen zur Buchung"
                  className="min-h-[80px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit Buttons */}
        <div className="flex gap-3 pt-4">
          <Button 
            type="submit" 
            className="flex-1 bg-black hover:bg-gray-800 text-white"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              mode === 'edit' ? 'Aktualisiere Buchung...' : 'Erstelle Buchung...'
            ) : (
              mode === 'edit' ? 'Buchung aktualisieren' : 'Buchung erstellen'
            )}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Abbrechen
            </Button>
          )}
        </div>
      </form>

      {/* AlertDialog für Reinigungsstornierung */}
      <AlertDialog open={showCancelCleaningDialog} onOpenChange={setShowCancelCleaningDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reinigungsaufträge stornieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Buchung hat {relatedCleaningTasks.length} zugehörige{' '}
              {relatedCleaningTasks.length === 1 ? 'Reinigungsauftrag' : 'Reinigungsaufträge'}:
              
              <div className="mt-3 space-y-2">
                {relatedCleaningTasks.map((task, index) => (
                  <div key={task.id} className="text-sm bg-muted p-2 rounded">
                    <div className="font-medium">Reinigung #{index + 1}</div>
                    <div>Datum: {format(new Date(task.scheduled_date), 'dd.MM.yyyy', { locale: de })}</div>
                    {task.scheduled_time && <div>Zeit: {task.scheduled_time}</div>}
                    <div className="text-muted-foreground">Status: {task.status}</div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4">
                Möchten Sie {relatedCleaningTasks.length === 1 ? 'diesen Reinigungsauftrag' : 'diese Reinigungsaufträge'} ebenfalls auf "Storniert" setzen?
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowCancelCleaningDialog(false);
              setIsSubmitting(false);
              setRelatedCleaningTasks([]);
              setPendingBookingData(null);
            }}>
              Abbrechen
            </AlertDialogCancel>
            <Button 
              variant="outline" 
              onClick={handleKeepCleaningTasks}
            >
              Nein, beibehalten
            </Button>
            <AlertDialogAction onClick={handleCancelCleaningTasks}>
              Ja, stornieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Linen Order Button - Only in edit mode */}
      {mode === 'edit' && initialData && (
        <div className="border-t pt-4 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleGenerateLinenOrder}
            disabled={generateLinenOrderMutation.isPending}
            className="w-full"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            {generateLinenOrderMutation.isPending 
              ? 'Berechne Wäschebedarf...' 
              : 'Wäschebestellung für diese Buchung erstellen'
            }
          </Button>
          {prefilledOrderData && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {prefilledOrderData.note}
            </p>
          )}
        </div>
      )}
    </Form>
  );
};

export default CreateBookingForm;