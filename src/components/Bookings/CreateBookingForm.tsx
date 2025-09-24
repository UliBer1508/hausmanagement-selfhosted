import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarIcon, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  booking_amount: z.number().optional(),
  currency: z.string().default('EUR'),
  notes: z.string().optional(),
}).refine((data) => data.check_out > data.check_in, {
  message: 'Check-out muss nach Check-in liegen',
  path: ['check_out'],
});

type BookingFormData = z.infer<typeof bookingSchema>;

interface CreateBookingFormProps {
  onSuccess: () => void;
}

const CreateBookingForm = ({ onSuccess }: CreateBookingFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      number_of_guests: 1,
      currency: 'EUR',
      guest_email: '',
      guest_phone: '',
      notes: '',
    },
  });

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
    setIsSubmitting(true);
    
    try {
      // Check for conflicting bookings
      const { data: conflictingBookings, error: conflictError } = await supabase
        .from('bookings')
        .select('id')
        .eq('house_id', data.house_id)
        .or(`and(check_in.lte.${data.check_out.toISOString()},check_out.gte.${data.check_in.toISOString()})`)
        .neq('status', 'cancelled');

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

      // Create booking
      const bookingData = {
        house_id: data.house_id,
        number_of_guests: data.number_of_guests,
        check_in: data.check_in.toISOString(),
        check_out: data.check_out.toISOString(),
        guest_name: data.guest_name,
        guest_email: data.guest_email || null,
        guest_phone: data.guest_phone || null,
        booking_amount: data.booking_amount || null,
        currency: data.currency,
        notes: data.notes || null,
        status: 'confirmed' as const,
        source: 'manual',
      };

      const { error: insertError } = await supabase
        .from('bookings')
        .insert([bookingData]);

      if (insertError) throw insertError;

      toast({
        title: 'Buchung erstellt',
        description: 'Die Buchung wurde erfolgreich erstellt.',
      });

      onSuccess();
    } catch (error: any) {
      console.error('Error creating booking:', error);
      toast({
        title: 'Fehler',
        description: 'Die Buchung konnte nicht erstellt werden.',
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
                <Select onValueChange={field.onChange} defaultValue={field.value}>
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

        {/* iCal Import Button */}
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            iCal Import
          </Button>
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

          {/* Buchungsbetrag */}
          <FormItem>
            <FormLabel>Buchungsbetrag</FormLabel>
            <div className="flex space-x-2">
              <FormField
                control={form.control}
                name="booking_amount"
                render={({ field }) => (
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
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
          </FormItem>
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

        {/* Submit Button */}
        <Button 
          type="submit" 
          className="w-full bg-black hover:bg-gray-800 text-white"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Erstelle Buchung...' : 'Buchung erstellen'}
        </Button>
      </form>
    </Form>
  );
};

export default CreateBookingForm;