import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCreateBooking, useUpdateBooking } from '@/hooks/useBookings';
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
  notes: z.string().optional(),
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
  const { toast } = useToast();

  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();

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
        notes: initialData.notes || '',
      };
    }
    return {
      number_of_guests: 1,
      currency: 'EUR',
      guest_email: '',
      guest_phone: '',
      nationality: '',
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
      console.log('Edit mode - initialData:', initialData);
      const values = getDefaultValues();
      console.log('Form values being set:', values);
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
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const onSubmit = async (data: BookingFormData) => {
    console.log('Form submit - mode:', mode, 'data:', data, 'initialData:', initialData);
    setIsSubmitting(true);
    
    try {
      // Check for conflicting bookings (skip for same booking in edit mode)
      const { data: conflictingBookings, error: conflictError } = await supabase
        .from('bookings')
        .select('id')
        .eq('house_id', data.house_id)
        .or(`and(check_in.lte.${data.check_out.toISOString()},check_out.gte.${data.check_in.toISOString()})`)
        .neq('status', 'cancelled')
        .neq('id', mode === 'edit' && initialData ? initialData.id : 'never-match');

      if (conflictError) throw conflictError;

      if (conflictingBookings && conflictingBookings.length > 0) {
        toast({
          title: 'Buchungskonflikt',
          description: 'Für diesen Zeitraum existiert bereits eine Buchung.',
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
        guest_name: data.guest_name,
        guest_email: data.guest_email || null,
        guest_phone: data.guest_phone || null,
        nationality: (data.nationality && data.nationality !== 'none') ? data.nationality : null,
        booking_amount: data.booking_amount || null,
        currency: data.currency,
        notes: data.notes || null,
        status: 'confirmed' as const,
        source: 'manual',
      };

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
      console.error('Booking error:', error);
      toast({
        title: 'Fehler',
        description: mode === 'edit' 
          ? 'Die Buchung konnte nicht aktualisiert werden.'
          : 'Die Buchung konnte nicht erstellt werden.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
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
                          format(field.value, "dd.MM.yyyy", { locale: de })
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
                      onSelect={field.onChange}
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
                          format(field.value, "dd.MM.yyyy", { locale: de })
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
                      onSelect={field.onChange}
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
    </Form>
  );
};

export default CreateBookingForm;