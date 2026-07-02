import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarIcon, Loader2, ShoppingCart, Star, UserCheck } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCreateBooking, useUpdateBooking, useDeleteBooking } from '@/hooks/useBookings';
import { useUpdateServiceTask } from '@/hooks/useServiceTasks';
import { Booking, BookingWithHouse } from '@/types';
import { normalizeRating, getMaxRatingForPlatform } from '@/lib/ratingHelpers';
import { COUNTRIES } from '@/lib/countries';
import { GuestSuggestions } from './GuestSuggestions';
import BookingChargesPanel from './BookingChargesPanel';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Mail, CreditCard, AlertCircle } from 'lucide-react';

const bookingSchema = z.object({
  house_id: z.string().min(1, 'Ferienhaus ist erforderlich'),
  number_of_adults: z.number().min(1, 'Mindestens 1 Erwachsener erforderlich').max(20, 'Maximum 20 Erwachsene'),
  number_of_children: z.number().min(0, 'Anzahl Kinder kann nicht negativ sein').max(20, 'Maximum 20 Kinder').default(0),
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
  payment_status: z.enum(['pending', 'paid', 'partial']).default('pending'),
  platform: z.string().optional(),
  external_booking_id: z.string().optional(),
  external_rating: z.number().min(0).max(10).optional(),
  notes: z.string().optional(),
  cancellation_date: z.string().optional(),
  cancellation_reason: z.string().optional(),
  cancelled_by: z.string().optional(),
  auto_create_cleaning: z.boolean().default(true),
}).refine((data) => data.check_out > data.check_in, {
  message: 'Check-out muss nach Check-in liegen',
  path: ['check_out'],
});

type BookingFormData = z.infer<typeof bookingSchema>;

// Prefill data from booking inquiry
interface BookingPrefillData {
  house_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone?: string;
  check_in: Date;
  check_out: Date;
  number_of_guests: number;
  number_of_adults?: number;
  number_of_children?: number;
  booking_amount?: number;
  notes?: string;
  inquiry_id?: string;
}

interface CreateBookingFormProps {
  mode?: 'create' | 'edit';
  initialData?: BookingWithHouse;
  onSuccess: (bookingId?: string) => void;
  onCancel?: () => void;
  prefillData?: BookingPrefillData; // From booking inquiry
}

const CreateBookingForm = ({ mode = 'create', initialData, onSuccess, onCancel, prefillData }: CreateBookingFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHistoricalBooking, setIsHistoricalBooking] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [relatedItems, setRelatedItems] = useState<{ cleaningTasks: any[]; linenOrders: any[] }>({ cleaningTasks: [], linenOrders: [] });

  // Guest suggestions state
  const [showGuestSuggestions, setShowGuestSuggestions] = useState(false);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(initialData?.guest_id || null);
  const [showFlaggedGuestWarning, setShowFlaggedGuestWarning] = useState(false);
  const [pendingFlaggedGuest, setPendingFlaggedGuest] = useState<any>(null);

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

  // Delta charges state (Zusatzkosten bei Erhöhung)
  const [deltaResult, setDeltaResult] = useState<{ charges: any[]; total_amount: number } | null>(null);
  const [isCalculatingDelta, setIsCalculatingDelta] = useState(false);
  const [isSendingPaymentLink, setIsSendingPaymentLink] = useState(false);

  // Baseline = die GEBUCHTE Personenzahl beim Öffnen des Dialogs (eingefroren).
  // Verhindert, dass sich das Delta an einem Zwischenstand aufhängt
  // (das war die Ursache der 14-Personen-Fehlberechnung).
  const baselineGuests = mode === 'edit' && initialData
    ? (initialData.number_of_guests || 0)
    : 0;

  // Ja/Nein-Frage "Zusatzkosten erheben?" vor dem Aufrechnen
  const [showChargeAskDialog, setShowChargeAskDialog] = useState(false);
  const [pendingDelta, setPendingDelta] = useState<{ new_guests: number; new_nights: number } | null>(null);

  // Freies Reinigungs-/Sonstiges-Feld im Aufrechnen-Schritt
  const [extraDesc, setExtraDesc] = useState('');
  const [extraAmount, setExtraAmount] = useState('');
  
  const { toast } = useToast();

  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();
  const updateServiceTask = useUpdateServiceTask();
  const deleteBooking = useDeleteBooking();

  // Mutation to create cleaning task automatically
  const createCleaningTaskMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      console.log('🚀 EDGE FUNCTION WIRD AUFGERUFEN mit booking_id:', bookingId);
      const { data, error } = await supabase.functions.invoke(
        'create-cleaning-task-for-booking',
        { body: { booking_id: bookingId } }
      );
      console.log('📥 EDGE FUNCTION ANTWORT:', { data, error });
      if (error) {
        console.error('❌ EDGE FUNCTION FEHLER:', error);
        throw error;
      }
      return data;
    },
    onSuccess: (data) => {
      console.log('✅ EDGE FUNCTION ERFOLGREICH:', data);
      if (data.success && data.task_created) {
        toast({
          title: "📝 Reinigungsauftrag als Entwurf erstellt",
          description: `Bitte im Reinigung-Tab prüfen. Geplant: ${data.scheduled_date} um ${data.scheduled_time} Uhr`,
          duration: 5000,
        });
      } else if (data.message) {
        toast({
          title: "Info",
          description: data.message,
          variant: "default",
        });
      }
    },
    onError: (error) => {
      console.error('❌ MUTATION FEHLER:', error);
      console.error('Error creating cleaning task:', error);
      toast({
        title: "Fehler bei Reinigungserstellung",
        description: "Der Reinigungsauftrag konnte nicht automatisch erstellt werden. Sie können ihn manuell im Reinigungsmodul anlegen.",
        variant: "destructive",
      });
    },
  });

  // Set default values based on mode and initial data
  const getDefaultValues = (): Partial<BookingFormData> => {
    if (mode === 'edit' && initialData) {
      const paymentStatus = initialData.payment_status;
      const validPaymentStatus: 'pending' | 'paid' | 'partial' = 
        (paymentStatus === 'paid' || paymentStatus === 'partial') ? paymentStatus : 'pending';
      
      // Fallback für alte Daten: wenn number_of_adults nicht gesetzt, nutze number_of_guests
      const adults = initialData.number_of_adults ?? initialData.number_of_guests;
      const children = initialData.number_of_children ?? 0;
      
      return {
        house_id: initialData.houses?.id || initialData.house_id,
        number_of_adults: adults,
        number_of_children: children,
        check_in: new Date(initialData.check_in),
        check_out: new Date(initialData.check_out),
        guest_name: initialData.guest_name,
        guest_email: initialData.guest_email || '',
        guest_phone: initialData.guest_phone || '',
        nationality: initialData.nationality && initialData.nationality !== 'none' ? initialData.nationality : '',
        booking_amount: initialData.booking_amount || undefined,
        currency: initialData.currency || 'EUR',
        status: initialData.status || 'confirmed',
        payment_status: validPaymentStatus,
        platform: initialData.platform || 'none',
        external_booking_id: initialData.external_booking_id || '',
        external_rating: (initialData as any).external_rating || undefined,
        notes: initialData.notes || '',
      };
    }
    // Prefill data from booking inquiry
    if (prefillData) {
      // Apply standard check-in/check-out times to prefill dates
      // Check-in: 15:00, Check-out: 10:00 (same as calendar picker defaults)
      const prefillCheckIn = setTimeOnDate(prefillData.check_in, 15);
      const prefillCheckOut = setTimeOnDate(prefillData.check_out, 10);
      return {
        house_id: prefillData.house_id,
        number_of_adults: prefillData.number_of_adults ?? prefillData.number_of_guests,
        number_of_children: prefillData.number_of_children ?? 0,
        check_in: prefillCheckIn,
        check_out: prefillCheckOut,
        guest_name: prefillData.guest_name,
        guest_email: prefillData.guest_email || '',
        guest_phone: prefillData.guest_phone || '',
        nationality: '',
        booking_amount: prefillData.booking_amount,
        currency: 'EUR',
        status: 'confirmed',
        payment_status: 'pending',
        platform: 'website', // From inquiry
        external_booking_id: '',
        external_rating: undefined,
        notes: prefillData.notes || '',
        auto_create_cleaning: true,
      };
    }
    return {
      number_of_adults: 1,
      number_of_children: 0,
      currency: 'EUR',
      status: 'confirmed',
      payment_status: 'pending',
      guest_email: '',
      guest_phone: '',
      nationality: '',
      platform: 'none',
      external_booking_id: '',
      external_rating: undefined,
      notes: '',
      auto_create_cleaning: true,
    };
  };

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: getDefaultValues(),
  });

  // Reset form when initial data or prefill data changes
  useEffect(() => {
    if (mode === 'edit' && initialData) {
      console.log('Edit mode - initialData:', JSON.stringify(initialData, null, 2));
      console.log('booking_amount from initialData:', initialData.booking_amount);
      const values = getDefaultValues();
      console.log('Form values being set:', JSON.stringify(values, null, 2));
      form.reset(values);
    } else if (prefillData) {
      console.log('Prefill mode - prefillData:', JSON.stringify(prefillData, null, 2));
      const values = getDefaultValues();
      form.reset(values);
    }
  }, [initialData, mode, form, prefillData]);

  // Auto-disable cleaning task creation for historical bookings
  useEffect(() => {
    if (isHistoricalBooking && form.getValues('auto_create_cleaning')) {
      form.setValue('auto_create_cleaning', false);
    }
  }, [isHistoricalBooking, form]);

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
      let createdBookingId: string | undefined;
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

      // Phase II: Gast erstellen oder finden (verbesserte Duplikat-Erkennung)
      let guestId: string | null = null;
      
      // Strategie 1: Suche nach Email (falls vorhanden)
      if (data.guest_email) {
        const { data: existingGuest } = await supabase
          .from('guests')
          .select('id')
          .eq('email', data.guest_email)
          .maybeSingle();
        
        if (existingGuest) {
          console.log('✅ Gast per Email gefunden:', existingGuest.id);
          guestId = existingGuest.id;
        }
      }
      
      // Strategie 2: Suche nach Name + Telefonnummer (falls keine Email-Übereinstimmung)
      if (!guestId && data.guest_phone) {
        const normalizedPhone = data.guest_phone.replace(/\s+/g, '');
        const { data: existingGuests } = await supabase
          .from('guests')
          .select('id, phone')
          .ilike('name', data.guest_name.trim());
        
        // Prüfe ob Telefonnummer ähnlich ist (normalisiert)
        if (existingGuests && existingGuests.length > 0) {
          for (const guest of existingGuests) {
            if (guest.phone) {
              const existingPhone = guest.phone.replace(/\s+/g, '');
              // Vergleiche die letzten 9 Ziffern (ohne Ländervorwahl-Varianten)
              if (existingPhone === normalizedPhone || 
                  existingPhone.slice(-9) === normalizedPhone.slice(-9)) {
                console.log('✅ Gast per Name + Telefon gefunden:', guest.id);
                guestId = guest.id;
                break;
              }
            }
          }
        }
      }
      
      // Strategie 3: Suche nach exaktem Namen + Nationalität (als Fallback)
      if (!guestId && data.nationality && data.nationality !== 'none' && data.nationality !== '') {
        const { data: existingGuests } = await supabase
          .from('guests')
          .select('id')
          .ilike('name', data.guest_name.trim())
          .eq('nationality', data.nationality)
          .order('created_at', { ascending: true })
          .limit(1);
        
        if (existingGuests && existingGuests.length > 0) {
          console.log('✅ Gast per Name + Nationalität gefunden:', existingGuests[0].id);
          guestId = existingGuests[0].id;
        }
      }
      
      // Strategie 4: Suche NUR nach exaktem Namen (letzter Fallback)
      if (!guestId) {
        const { data: existingGuests } = await supabase
          .from('guests')
          .select('id')
          .ilike('name', data.guest_name.trim())
          .order('created_at', { ascending: true })
          .limit(1);
        
        if (existingGuests && existingGuests.length > 0) {
          console.log('✅ Gast per Name (exakt) gefunden:', existingGuests[0].id);
          guestId = existingGuests[0].id;
        }
      }
      
      // Aktualisiere gefundenen Gast mit neuen/besseren Daten
      if (guestId) {
        const updateData: Record<string, unknown> = {
          name: data.guest_name.trim(),
          updated_at: new Date().toISOString(),
        };
        // Nur setzen wenn vorhanden (nicht überschreiben mit null)
        if (data.guest_email) updateData.email = data.guest_email;
        if (data.guest_phone) updateData.phone = data.guest_phone;
        if (data.nationality && data.nationality !== 'none' && data.nationality !== '') {
          updateData.nationality = data.nationality;
        }
        
        await supabase
          .from('guests')
          .update(updateData)
          .eq('id', guestId);
      }
      
      // Erstelle neuen Gast falls nicht gefunden
      if (!guestId) {
        console.log('📝 Erstelle neuen Gast:', data.guest_name);
        const { data: newGuest, error: guestError } = await supabase
          .from('guests')
          .insert({
            name: data.guest_name.trim(),
            email: data.guest_email || null,
            phone: data.guest_phone || null,
            nationality: (data.nationality && data.nationality !== 'none' && data.nationality !== '') ? data.nationality : null,
          })
          .select('id')
          .single();
        
        if (guestError) {
          console.error('Fehler beim Erstellen des Gastes:', guestError);
        } else {
          guestId = newGuest.id;
          console.log('✅ Neuer Gast erstellt:', guestId);
        }
      }

      // Prepare booking data
      const numberOfGuests = data.number_of_adults + data.number_of_children;
      // Modell B: Wenn Buchung aus einer Anfrage stammt UND ein Betrag hinterlegt ist,
      // wird der Betrag als booking_charge angelegt. booking_amount bleibt 0/null,
      // damit es nicht doppelt zählt — der Webhook addiert den Betrag bei Zahlung.
      const isFromInquiryWithAmount =
        !!prefillData?.inquiry_id && !!data.booking_amount && data.booking_amount > 0;
      const bookingData = {
        house_id: data.house_id,
        guest_id: guestId, // Verknüpfung zur guests-Tabelle
        number_of_guests: numberOfGuests,
        number_of_adults: data.number_of_adults,
        number_of_children: data.number_of_children,
        check_in: data.check_in.toISOString(),
        check_out: data.check_out.toISOString(),
        guest_name: data.guest_name.trim(),
        guest_email: data.guest_email || null,
        guest_phone: data.guest_phone || null,
        nationality: (data.nationality && data.nationality !== 'none' && data.nationality !== '') ? data.nationality : null,
        booking_amount: isFromInquiryWithAmount ? 0 : (data.booking_amount || null),
        currency: data.currency || 'EUR',
        platform: (data.platform && data.platform !== 'none') ? data.platform : null,
        external_booking_id: data.external_booking_id || null,
        external_rating: data.external_rating || null,
        normalized_rating: data.external_rating 
          ? normalizeRating(data.external_rating, (data.platform && data.platform !== 'none') ? data.platform : null)
          : null,
        notes: data.notes || null,
        status: data.status,
        payment_status: data.payment_status,
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

        // === Zusatzkosten: nur bei ECHTER Erhöhung über die gebuchte Zahl fragen ===
        // Delta wird gegen die eingefrorene Baseline gemessen, nicht gegen einen Zwischenstand.
        const new_guests = numberOfGuests;
        const msPerDay = 1000 * 60 * 60 * 24;
        const new_nights = Math.max(
          0,
          Math.round((data.check_out.getTime() - data.check_in.getTime()) / msPerDay)
        );
        const isIncrease = new_guests > baselineGuests;
        if (isIncrease) {
          // Erst fragen, ob Zusatzkosten erhoben werden sollen.
          // (Reduzierung tut bewusst nichts — man erstattet Gästen nichts zurück.)
          setPendingDelta({ new_guests, new_nights });
          setShowChargeAskDialog(true);
          return; // Dialog übernimmt; onSuccess folgt nach der Entscheidung.
        }
      } else {
        console.log('Creating new booking');
        // Create new booking
        const bookingResult = await createBooking.mutateAsync(bookingData);
        createdBookingId = bookingResult?.id;

        console.log('Booking created successfully');

        // Modell B: Erstelle booking_charge für den Buchungsbetrag aus der Anfrage
        if (isFromInquiryWithAmount && bookingResult?.id) {
          try {
            const houseName =
              houses?.find((h) => h.id === data.house_id)?.name || 'Buchung';
            const amount = data.booking_amount as number;
            const { error: chargeError } = await supabase
              .from('booking_charges')
              .insert({
                booking_id: bookingResult.id,
                house_id: data.house_id,
                charge_type: 'accommodation',
                description: `Buchungsbetrag / Booking amount: ${houseName}`,
                quantity: 1,
                unit_amount: amount,
                amount: amount,
                status: 'open',
                origin: 'manual',
              });
            if (chargeError) {
              console.error('Fehler beim Erstellen der Buchungsforderung:', chargeError);
              toast({
                title: 'Hinweis',
                description:
                  'Buchung wurde erstellt, aber die Zahlungsforderung konnte nicht angelegt werden: ' +
                  chargeError.message,
                variant: 'destructive',
              });
            }
          } catch (e: any) {
            console.error('Fehler beim Erstellen der Buchungsforderung:', e);
          }
        }

        // Update inquiry status if this booking is from an inquiry
        if (prefillData?.inquiry_id) {
          console.log('Updating inquiry status to confirmed:', prefillData.inquiry_id);
          await supabase
            .from('booking_inquiries')
            .update({ status: 'confirmed', updated_at: new Date().toISOString() })
            .eq('id', prefillData.inquiry_id);
        }

        toast({
          title: 'Buchung erstellt',
          description: prefillData?.inquiry_id 
            ? 'Die Buchung wurde aus der Anfrage erstellt. Sie können dem Gast jetzt eine Bestätigungs-E-Mail senden.'
            : 'Die Buchung wurde erfolgreich erstellt.',
        });

        // Auto-create cleaning task if checkbox is enabled AND not historical booking
        // Defensiver Check: Default to true wenn undefined
        const shouldCreateCleaning = data.auto_create_cleaning !== false;
        
        console.log('🔍 DEBUG - Reinigungsauftrag-Check:', {
          'auto_create_cleaning': data.auto_create_cleaning,
          'auto_create_cleaning_type': typeof data.auto_create_cleaning,
          'shouldCreateCleaning': shouldCreateCleaning,
          'booking_id': bookingResult?.id,
          'isHistoricalBooking': isHistoricalBooking,
          'willCreate': !!(shouldCreateCleaning && bookingResult?.id && !isHistoricalBooking)
        });

        if (shouldCreateCleaning && bookingResult?.id && !isHistoricalBooking) {
          console.log('✅ Alle Bedingungen erfüllt! Erstelle Reinigungsauftrag...');
          console.log('🧹 Auto-creating cleaning task for booking:', bookingResult.id);
          await createCleaningTaskMutation.mutateAsync(bookingResult.id);
        } else {
          console.log('❌ Reinigungsauftrag wird NICHT erstellt. Grund:', 
            !data.auto_create_cleaning ? '❌ Checkbox nicht aktiviert (auto_create_cleaning = false)' :
            !bookingResult?.id ? '❌ Keine booking_id vorhanden' :
            isHistoricalBooking ? '❌ Historische Buchung (isHistoricalBooking = true)' : 
            '❌ Unbekannter Grund - alle Bedingungen sollten erfüllt sein!'
          );
        }
      }

      onSuccess(createdBookingId);
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

  const handleCheckAndDeleteBooking = async () => {
    if (!initialData?.id) return;

    try {
      // Check for related cleaning tasks
      const { data: cleaningTasks, error: cleaningError } = await supabase
        .from('service_tasks')
        .select('*')
        .eq('booking_id', initialData.id);
      
      if (cleaningError) throw cleaningError;

      // Check for related linen orders
      const { data: linenOrders, error: linenError } = await supabase
        .from('linen_orders')
        .select('*')
        .eq('booking_id', initialData.id);
      
      if (linenError) throw linenError;

      setRelatedItems({ 
        cleaningTasks: cleaningTasks || [], 
        linenOrders: linenOrders || [] 
      });
      setShowDeleteDialog(true);
    } catch (error: any) {
      toast({
        title: "Fehler",
        description: error.message || "Fehler beim Prüfen der verknüpften Daten",
        variant: "destructive"
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!initialData?.id) return;

    try {
      await deleteBooking.mutateAsync(initialData.id);
      
      toast({
        title: "Buchung gelöscht",
        description: `Buchung und ${relatedItems.cleaningTasks.length} Reinigungsauftrag/äge und ${relatedItems.linenOrders.length} Wäschebestellung/en wurden gelöscht.`,
      });

      setShowDeleteDialog(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Fehler beim Löschen",
        description: error.message || "Die Buchung konnte nicht gelöscht werden",
        variant: "destructive"
      });
    }
  };

  // === Delta-Panel Handler ===

  // "Ja, Zusatzkosten berechnen" -> Vorschau holen (persist=false, schreibt nichts)
  const handleAskYes = async () => {
    setShowChargeAskDialog(false);
    if (!pendingDelta || !initialData?.id) { onSuccess(); return; }
    setIsCalculatingDelta(true);
    try {
      const { data: deltaData, error } = await supabase.functions.invoke(
        'calculate-booking-delta',
        {
          body: {
            booking_id: initialData.id,
            baseline_guests: baselineGuests,
            new_guests: pendingDelta.new_guests,
            new_nights: pendingDelta.new_nights,
            persist: false,
          },
        }
      );
      if (error) throw error;
      const charges = deltaData?.charges || [];
      if (charges.length > 0) {
        setDeltaResult({ charges, total_amount: deltaData.total_amount || 0 });
        // Panel offen lassen zum Korrigieren; NICHT schließen.
      } else {
        toast({ title: 'Keine Zusatzkosten', description: 'Für diese Änderung fallen keine Posten an.' });
        onSuccess();
      }
    } catch (e: any) {
      toast({
        title: 'Hinweis',
        description: 'Zusatzkosten konnten nicht berechnet werden: ' + (e.message || 'Fehler'),
        variant: 'destructive',
      });
      onSuccess();
    } finally {
      setIsCalculatingDelta(false);
      setPendingDelta(null);
    }
  };

  // "Nein, nicht berechnen" -> nur merken (Notiz), nichts anlegen
  const handleAskNo = () => {
    setShowChargeAskDialog(false);
    setPendingDelta(null);
    toast({ title: 'Notiz', description: 'Mehr Gäste erfasst — keine Zusatzkosten berechnet.' });
    onSuccess();
  };

  // Betrag eines Vorschau-Postens im Panel korrigieren (vor dem Anlegen)
  const updatePreviewCharge = (idx: number, newAmount: number) => {
    setDeltaResult((prev) => {
      if (!prev) return prev;
      const charges = prev.charges.map((c, i) =>
        i === idx ? { ...c, amount: Math.round(newAmount * 100) / 100 } : c
      );
      const total = charges.reduce((s, c) => s + Number(c.amount || 0), 0);
      return { charges, total_amount: Math.round(total * 100) / 100 };
    });
  };

  // Freien Reinigungs-/Sonstiges-Posten zur Vorschau hinzufügen
  const addExtraCharge = () => {
    const amt = parseFloat(extraAmount);
    if (!extraDesc.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast({
        title: 'Eingabe unvollständig',
        description: 'Bezeichnung und Betrag > 0 erforderlich.',
        variant: 'destructive',
      });
      return;
    }
    setDeltaResult((prev) => {
      const base = prev || { charges: [], total_amount: 0 };
      const charges = [...base.charges, {
        booking_id: initialData?.id,
        house_id: null,
        charge_type: 'other',
        description: extraDesc.trim(),
        quantity: 1,
        unit_amount: Math.round(amt * 100) / 100,
        amount: Math.round(amt * 100) / 100,
        status: 'open',
        origin: 'auto_delta',
      }];
      const total = charges.reduce((s, c) => s + Number(c.amount || 0), 0);
      return { charges, total_amount: Math.round(total * 100) / 100 };
    });
    setExtraDesc('');
    setExtraAmount('');
  };

  // Bestätigte (ggf. korrigierte) Posten wirklich anlegen (persist=true)
  // und den ÜBERGANG der Gästezahl strukturiert in der Buchung festhalten.
  const persistCharges = async () => {
    if (!deltaResult || !initialData?.id) return null;
    const { data, error } = await supabase.functions.invoke('calculate-booking-delta', {
      body: { booking_id: initialData.id, persist: true, charges: deltaResult.charges },
    });
    if (error) throw error;

    // Übergang dokumentieren: booked_guests (das "vorher") NUR setzen, wenn noch leer,
    // damit es bei weiteren Änderungen nicht überschrieben wird.
    try {
      const surcharge = (deltaResult.charges || [])
        .reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
      const patch: Record<string, unknown> = {
        guests_changed_at: new Date().toISOString(),
        guest_surcharge_amount: Math.round(surcharge * 100) / 100,
      };
      if ((initialData as any).booked_guests == null) {
        patch.booked_guests = baselineGuests;
      }
      await supabase.from('bookings').update(patch).eq('id', initialData.id);
    } catch (e) {
      console.error('Konnte Gästezahl-Übergang nicht speichern:', e);
    }

    return data;
  };

  const handleConfirmDeltaCharges = async () => {
    try {
      await persistCharges();
      toast({
        title: 'Forderungen angelegt',
        description: `${deltaResult?.charges.length || 0} Posten wurden als offene Forderung gespeichert.`,
      });
      setDeltaResult(null);
      onSuccess();
    } catch (e: any) {
      toast({
        title: 'Fehler',
        description: e.message || 'Konnte nicht gespeichert werden.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateAndSendPaymentLink = async () => {
    if (!deltaResult || !initialData?.id) return;
    setIsSendingPaymentLink(true);
    try {
      // Zuerst die (korrigierten) Vorschau-Posten anlegen — sie haben noch keine id.
      const persisted = await persistCharges();
      if (!persisted?.charges?.length) throw new Error('Keine Forderungen angelegt.');

      // EINEN gebündelten Link für alle offenen Forderungen der Buchung erzeugen.
      const paymentUrls: string[] = [];
      {
        const { data: linkData, error: linkError } = await supabase.functions.invoke(
          'create-payment-link',
          { body: { booking_id: initialData.id } }
        );
        if (linkError) throw linkError;
        if (linkData?.payment_url) paymentUrls.push(linkData.payment_url);
      }

      const guestEmail = form.getValues('guest_email');
      if (!guestEmail) {
        toast({
          title: 'Zahlungslink erstellt',
          description: 'Keine Gast-E-Mail hinterlegt – Link nicht versendet.',
          variant: 'destructive',
        });
      } else {
        const linksHtml = paymentUrls
          .map((u, i) => `<p>Zahlungslink ${i + 1}: <a href="${u}">${u}</a></p>`)
          .join('');
        const totalFmt = (deltaResult.total_amount).toFixed(2).replace('.', ',') + ' €';
        const html = `
          <p>Hallo ${form.getValues('guest_name') || ''},</p>
          <p>aufgrund der Änderung Ihrer Buchung fallen Zusatzkosten in Höhe von <strong>${totalFmt}</strong> an.</p>
          ${linksHtml}
          <p>Vielen Dank!</p>
        `;
        const { openEmail } = await import('@/lib/mailtoHelper');
        await openEmail({
          to: guestEmail,
          subject: 'Zusatzkosten zu Ihrer Buchung',
          html,
        });
        toast({
          title: 'E-Mail vorbereitet',
          description: 'Vorschaufenster geöffnet — Betreff und Text prüfen, dann ‚Per Gmail senden‘.',
        });
      }

      setDeltaResult(null);
      onSuccess();
    } catch (err: any) {
      console.error('Payment-Link/E-Mail Fehler:', err);
      toast({
        title: 'Fehler',
        description: err.message || 'Zahlungslink konnte nicht erstellt/versendet werden.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingPaymentLink(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 min-w-0">
        {mode === 'edit' && initialData?.id && (
          <BookingChargesPanel
            bookingId={initialData.id}
            bookingAmount={initialData.booking_amount}
            guestEmail={initialData.guest_email}
            guestName={initialData.guest_name}
          />
        )}
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

          {/* Anzahl Erwachsene */}
          <FormField
            control={form.control}
            name="number_of_adults"
            render={({ field }) => (
              <FormItem>
                <FormLabel>👨 Erwachsene *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Erwachsene"
                    min="1"
                    max="20"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    value={field.value ?? 1}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Anzahl Kinder */}
          <FormField
            control={form.control}
            name="number_of_children"
            render={({ field }) => (
              <FormItem>
                <FormLabel>👶 Kinder</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Kinder"
                    min="0"
                    max="20"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    value={field.value ?? 0}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Historische Buchung Checkbox */}
        <div className="flex items-center space-x-2 p-4 bg-muted/50 rounded-lg">
          <Checkbox
            id="historical-booking"
            checked={isHistoricalBooking}
            onCheckedChange={(checked) => setIsHistoricalBooking(checked === true)}
          />
          <label
            htmlFor="historical-booking"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            Historische Buchung (erlaubt vergangene Daten)
          </label>
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
                      disabled={isHistoricalBooking ? false : (date) => date < new Date()}
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
                        if (isHistoricalBooking) {
                          return checkIn && date <= checkIn;
                        }
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
          {/* Gastname mit Vorschlägen */}
          <FormField
            control={form.control}
            name="guest_name"
            render={({ field }) => (
              <FormItem className="relative">
                <FormLabel className="flex items-center gap-2">
                  Gastname *
                  {selectedGuestId && (
                    <span className="flex items-center gap-1 text-xs text-primary font-normal">
                      <UserCheck className="h-3 w-3" />
                      Bekannter Gast
                    </span>
                  )}
                </FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Name des Gastes" 
                    {...field} 
                    onChange={(e) => {
                      field.onChange(e);
                      setShowGuestSuggestions(true);
                      // Reset selected guest when typing
                      if (selectedGuestId) {
                        setSelectedGuestId(null);
                      }
                    }}
                    onFocus={() => setShowGuestSuggestions(true)}
                  />
                </FormControl>
                <GuestSuggestions
                  searchTerm={field.value || ''}
                  isOpen={showGuestSuggestions && mode === 'create'}
                  onClose={() => setShowGuestSuggestions(false)}
                  onSelect={(guest) => {
                    if (guest.is_flagged) {
                      setPendingFlaggedGuest(guest);
                      setShowFlaggedGuestWarning(true);
                      setShowGuestSuggestions(false);
                    } else {
                      form.setValue('guest_name', guest.name);
                      if (guest.email) form.setValue('guest_email', guest.email);
                      if (guest.phone) form.setValue('guest_phone', guest.phone);
                      if (guest.nationality) form.setValue('nationality', guest.nationality);
                      setSelectedGuestId(guest.id);
                      setShowGuestSuggestions(false);
                    }
                  }}
                />
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
                    {COUNTRIES.map((country) => (
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            {/* Buchungsnummer */}
            <FormField
              control={form.control}
              name="external_booking_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Buchungsnummer</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="z.B. HM123456789" 
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Externe Bewertung - dynamisch basierend auf Plattform */}
            <FormField
              control={form.control}
              name="external_rating"
              render={({ field }) => {
                const currentPlatform = form.watch('platform');
                const maxRating = getMaxRatingForPlatform(currentPlatform === 'none' ? null : currentPlatform);
                const isBookingCom = currentPlatform?.toLowerCase().includes('booking');
                
                return (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-amber-500" />
                      Externe Bewertung
                    </FormLabel>
                    <div className="flex items-center space-x-2">
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max={maxRating}
                          placeholder={`0.0`}
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                          value={field.value || ''}
                          className="flex-1"
                        />
                      </FormControl>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {isBookingCom ? '/10' : `/${maxRating} ⭐`}
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Auto-create cleaning task checkbox - only in create mode */}
            {mode === 'create' && (
              <FormField
                control={form.control}
                name="auto_create_cleaning"
                render={({ field }) => (
                  <FormItem className="flex flex-col justify-end h-full">
                    <div className={cn(
                      "flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3 h-[42px]",
                      isHistoricalBooking ? "bg-muted/10 opacity-50" : "bg-muted/30"
                    )}>
                      <FormControl>
                        <Checkbox
                          checked={field.value ?? true}
                          onCheckedChange={(checked) => {
                            console.log('🔧 Checkbox "Reinigungsauftrag erstellen" geändert auf:', checked);
                            field.onChange(checked);
                          }}
                          disabled={isHistoricalBooking}
                        />
                      </FormControl>
                      <FormLabel className={cn(
                        "font-normal text-sm",
                        isHistoricalBooking ? "cursor-not-allowed" : "cursor-pointer"
                      )}>
                        Reinigungsauftrag automatisch erstellen
                        {isHistoricalBooking && (
                          <span className="text-xs text-muted-foreground ml-2">
                            (nicht für historische Buchungen)
                          </span>
                        )}
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            )}
          </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* Zahlungsstatus */}
          <FormField
            control={form.control}
            name="payment_status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Zahlungsstatus</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Status wählen" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="pending">💤 Ausstehend</SelectItem>
                    <SelectItem value="paid">✅ Bezahlt</SelectItem>
                    <SelectItem value="partial">⚠️ Teilweise bezahlt</SelectItem>
                  </SelectContent>
                </Select>
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
                <FormLabel>Buchungsstatus</FormLabel>
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

        {/* Wäschebestellung-Button (nur Edit-Mode) */}
        {mode === 'edit' && initialData && (
          <div className="border-t pt-4 mt-4">
            <Button
              type="button"
              onClick={handleGenerateLinenOrder}
              disabled={generateLinenOrderMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              {generateLinenOrderMutation.isPending
                ? 'Berechne Wäschebedarf...'
                : 'Wäschebestellung erstellen'}
            </Button>
            {prefilledOrderData && (
              <p className="text-sm text-muted-foreground mt-2 text-center">
                {prefilledOrderData.note}
              </p>
            )}
          </div>
        )}

        {/* Submit Buttons */}
        <div className="flex flex-row flex-wrap gap-2 pt-4">
          {deltaResult && (
            <div className="basis-full rounded-md border border-amber-300 bg-amber-50 p-4 mb-2">
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-900">
                    Diese Änderung erzeugt {deltaResult.total_amount.toFixed(2).replace('.', ',')} € Zusatzkosten:
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    Beträge bei Bedarf anpassen, dann als Forderung anlegen oder Zahlungslink senden.
                  </p>
                </div>
              </div>

              {/* Editierbare Posten */}
              <div className="space-y-2 mb-3">
                {deltaResult.charges.map((c: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-amber-900">
                    <span className="flex-1 min-w-0 truncate">{c.description}</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={c.amount}
                      onChange={(e) => updatePreviewCharge(idx, parseFloat(e.target.value) || 0)}
                      className="w-28 h-8 bg-white"
                    />
                    <span>€</span>
                  </div>
                ))}
              </div>

              {/* Freies Feld: Reinigung / Sonstiges (pro Buchung) */}
              <div className="flex flex-wrap items-end gap-2 mb-3 border-t border-amber-200 pt-3">
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs text-amber-800">Reinigung / Sonstiges (Bezeichnung)</label>
                  <Input
                    type="text"
                    placeholder="z.B. Endreinigung"
                    value={extraDesc}
                    onChange={(e) => setExtraDesc(e.target.value)}
                    className="h-8 bg-white"
                  />
                </div>
                <div className="w-28">
                  <label className="text-xs text-amber-800">Betrag €</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={extraAmount}
                    onChange={(e) => setExtraAmount(e.target.value)}
                    className="h-8 bg-white"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addExtraCharge}>
                  Posten hinzufügen
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={handleConfirmDeltaCharges}>
                  Als Forderung anlegen
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateAndSendPaymentLink}
                  disabled={isSendingPaymentLink}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSendingPaymentLink ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4 mr-2" />
                  )}
                  Zahlungslink erstellen & an Gast senden
                </Button>
              </div>
            </div>
          )}
          <Button
            type="submit"
            className="flex-1 min-w-0 bg-black hover:bg-gray-800 text-white"
            disabled={isSubmitting || isCalculatingDelta}
          >
            {isSubmitting || isCalculatingDelta ? (
              mode === 'edit' ? 'Aktualisiere...' : 'Erstelle...'
            ) : (
              mode === 'edit' ? 'Aktualisieren' : 'Buchung erstellen'
            )}
          </Button>
          {mode === 'edit' && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleCheckAndDeleteBooking}
              disabled={isSubmitting}
              className="flex-1 min-w-0"
            >
              Löschen
            </Button>
          )}
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="basis-full sm:basis-auto sm:w-auto"
            >
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

      {/* AlertDialog: Zusatzkosten berechnen? (bei Erhöhung der Personenzahl) */}
      <AlertDialog open={showChargeAskDialog} onOpenChange={setShowChargeAskDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zusatzkosten berechnen?</AlertDialogTitle>
            <AlertDialogDescription>
              Es kommen{' '}
              <strong>
                {pendingDelta ? Math.max(0, pendingDelta.new_guests - baselineGuests) : 0}
              </strong>{' '}
              zusätzliche Person(en) gegenüber der gebuchten Zahl ({baselineGuests}).
              Sollen dafür Zusatzkosten (Bettwäsche, Ortstaxe, ggf. Reinigung) berechnet
              und ein Zahlungslink vorbereitet werden?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={handleAskNo}>
              Nein, nur merken
            </Button>
            <AlertDialogAction onClick={handleAskYes}>
              Ja, Zusatzkosten berechnen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog für Problem-Gast Warnung */}
      <AlertDialog open={showFlaggedGuestWarning} onOpenChange={setShowFlaggedGuestWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              ⚠️ Problem-Gast erkannt
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{pendingFlaggedGuest?.name}</strong> wurde als problematischer Gast markiert. 
              Möchten Sie trotzdem mit diesem Gast fortfahren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowFlaggedGuestWarning(false);
              setPendingFlaggedGuest(null);
            }}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingFlaggedGuest) {
                form.setValue('guest_name', pendingFlaggedGuest.name);
                if (pendingFlaggedGuest.email) form.setValue('guest_email', pendingFlaggedGuest.email);
                if (pendingFlaggedGuest.phone) form.setValue('guest_phone', pendingFlaggedGuest.phone);
                if (pendingFlaggedGuest.nationality) form.setValue('nationality', pendingFlaggedGuest.nationality);
                setSelectedGuestId(pendingFlaggedGuest.id);
              }
              setShowFlaggedGuestWarning(false);
              setPendingFlaggedGuest(null);
            }}>
              Trotzdem übernehmen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog für Buchungslöschung */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buchung wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3">
                <p className="font-medium">
                  Diese Aktion löscht unwiderruflich die Buchung von {initialData?.guest_name}
                </p>
                
                {(relatedItems.cleaningTasks.length > 0 || relatedItems.linenOrders.length > 0) && (
                  <div className="mt-3 p-3 bg-destructive/10 rounded-md">
                    <p className="font-medium text-destructive mb-2">
                      Folgende verknüpfte Daten werden ebenfalls gelöscht:
                    </p>
                    <ul className="text-sm space-y-1">
                      {relatedItems.cleaningTasks.length > 0 && (
                        <li>• {relatedItems.cleaningTasks.length} Reinigungsauftrag/äge</li>
                      )}
                      {relatedItems.linenOrders.length > 0 && (
                        <li>• {relatedItems.linenOrders.length} Wäschebestellung/en</li>
                      )}
                    </ul>
                  </div>
                )}
                
                <p className="text-sm text-muted-foreground mt-3">
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteDialog(false)}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
};

export default CreateBookingForm;