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
import { getGuestName, getGuestEmail, getGuestPhone, getGuestNationality } from '@/lib/guestHelpers';

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
  // Ergebnis einer Pruefung ohne offene Posten ("alles bereits abgerechnet").
  const [zusatzkostenStand, setZusatzkostenStand] = useState<
    { zuwachs: number; abgerechnet: number; urspruenglich: number; jetzt: number } | null
  >(null);
  const [isSendingPaymentLink, setIsSendingPaymentLink] = useState(false);

  /*
   * FIX 11.09.2026: `offenerStand` wurde im "Zusatzkosten berechnen?"-Dialog
   * (weiter unten im JSX) verwendet, aber nirgends deklariert. Da JSX-Ausdrücke
   * beim Rendern der Komponente sofort ausgewertet werden — unabhängig davon,
   * ob der Dialog gerade sichtbar ist —, warf das bei JEDEM Rendern von
   * CreateBookingForm einen ReferenceError. Das passierte schon beim Öffnen
   * des Bearbeiten-Dialogs, also bei jedem Klick auf eine Buchungskarte in der
   * Übersicht. Die Route-ErrorBoundary fing das ab ("Diese Seite konnte nicht
   * geladen werden"). Dieser State hält jetzt das Prüfergebnis aus
   * `calculate-booking-delta` (persist:false), das in performBookingUpdate()
   * ohnehin schon geholt wird.
   */
  const [offenerStand, setOffenerStand] = useState<
    { urspruenglich: number; zuwachs: number; abgerechnet: number; offen: number } | null
  >(null);

  /*
   * Die ursprünglich gebuchte Gästezahl wird NICHT mehr aus dem
   * Buchungsobjekt im Browser abgeleitet.
   *
   * Früher stand hier:
   *   const baselineGuests = initialData.delta_guests
   *                       ?? initialData.number_of_guests ?? 0;
   *
   * Enthielt das Objekt die Spalten nicht — was davon abhängt, welche
   * Abfrage den Dialog geöffnet hat —, war der Wert 0, und daraus wurde ein
   * Delta über die volle Gästezahl. Der Wert wird jetzt nach dem Speichern
   * frisch aus der Buchung gelesen und hier abgelegt, damit die Rückfrage
   * dieselbe Zahl anzeigt, mit der `calculate-booking-delta` rechnet.
   */
  const [gebuchteGaesteDb, setGebuchteGaesteDb] = useState<number | null>(null);

  // Ja/Nein-Frage "Zusatzkosten erheben?" vor dem Aufrechnen
  const [showChargeAskDialog, setShowChargeAskDialog] = useState(false);
  const [pendingDelta, setPendingDelta] = useState<{ new_guests: number; new_nights: number } | null>(null);

  // Schritt 3 des Ablaufs: Gästezahl, auf die die Wäschebestellung noch
  // nachgezogen werden muss. Wird beim Speichern gesetzt und erst NACH
  // Abschluss der Zusatzkosten abgearbeitet — siehe
  // docs/Prozess-Gaestezahl-Aenderung.md.
  const [pendingLinenGuests, setPendingLinenGuests] = useState<number | null>(null);

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
        // Etappe 4: Quelle ist die guests-Relation; die Kopiespalten in bookings
        // sind nur noch Rueckfall und verschwinden in Etappe 6.
        guest_name:  getGuestName(initialData) === 'Unbekannt' ? '' : getGuestName(initialData),
        guest_email: getGuestEmail(initialData) || '',
        guest_phone: getGuestPhone(initialData) || '',
        nationality: (() => {
          const n = getGuestNationality(initialData);
          return n && n !== 'none' ? n : '';
        })(),
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
    // ACHTUNG bei Aenderungen: NICHT auf [initialData] hoeren.
    // initialData ist bei jedem Refetch ein NEUES Objekt (React Query baut die
    // Zeilen neu, withGuestData() kopiert sie nochmals). Im Uebersicht-Tab
    // horcht OriginalDashboard.tsx per Realtime auf jede Aenderung der Tabelle
    // bookings; persistCharges() schreibt dort MITTEN im Zahlungslink-Ablauf in
    // bookings. Das loeste einen Refetch -> neues initialData -> form.reset()
    // waehrend der Vorgang noch lief. Im Buchungen-Tab gibt es diese Realtime-
    // Subscription nicht, weshalb derselbe Dialog dort funktionierte.
    // Zuruecksetzen ist nur noetig, wenn eine ANDERE Buchung geladen wird.
  }, [initialData?.id, mode, form, prefillData]);

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
        // Gastname wird in der Konflikt-Meldung angezeigt (weiter unten:
        // "Konflikt mit Buchung von ..."), deshalb wird er gebraucht.
        // Quelle ist die guests-Relation (Etappe 4, Block 2).
        .select('id, check_in, check_out, status, guests!bookings_guest_id_fkey(name)')
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
        console.log('Checking booking:', (booking as any).guests?.name || booking.guest_name, booking.status);
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
          console.log('❌ CONFLICT FOUND with:', (booking as any).guests?.name || booking.guest_name);
        }
        
        return hasOverlap;
      }) || [];
      
      console.log('🔍 CONFLICT CHECK END - Total conflicts:', conflictingBookings.length);

      if (conflictingBookings && conflictingBookings.length > 0) {
        const conflictDetails = conflictingBookings[0];
        toast({
          title: 'Buchungskonflikt',
          description: `Konflikt mit Buchung von ${(conflictDetails as any).guests?.name || conflictDetails.guest_name} (${format(new Date(conflictDetails.check_in), 'dd.MM.yyyy HH:mm', { locale: de })} - ${format(new Date(conflictDetails.check_out), 'dd.MM.yyyy HH:mm', { locale: de })})`,
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      // Phase II: Gast erstellen oder finden (verbesserte Duplikat-Erkennung)
      let guestId: string | null = null;

      // BEARBEITEN-MODUS: bestehende Zuordnung NICHT neu ermitteln.
      //
      // WARUM (Befund 12.08.2026, Konzept-Gastdaten-Entdopplung Etappe 2):
      // Die Kaskade unten lief bisher bei JEDEM Speichern, also auch beim
      // Bearbeiten einer laengst zugeordneten Buchung. Traegt man dort eine
      // E-Mail nach, die bereits einem ANDEREN Gast gehoert, findet Strategie 1
      // diesen anderen Gast und die Buchung wird still umgehaengt — samt
      // Stammgast-Zaehlung, Historie und Umsatz. Der DB-Trigger macht das
      // bewusst nicht (er matcht bei gesetzter guest_id nicht neu); die
      // Anwendung umging diesen Schutz.
      //
      // Eine Zuordnung wird bewusst geaendert (Gast-Zusammenfuehrung), nicht
      // als Nebenwirkung einer Adresskorrektur.
      const behaelltBestehendeZuordnung = mode === 'edit' && !!initialData?.guest_id;
      if (behaelltBestehendeZuordnung) {
        guestId = initialData.guest_id as string;
      }

      // Strategie 1: Suche nach Email (falls vorhanden)
      if (!guestId && data.guest_email) {
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
      // Leere Felder beim Absenden absichern (Erwachsene min. 1, Kinder min. 0)
      const safeAdults = Number.isFinite(data.number_of_adults) ? data.number_of_adults : 1;
      const safeChildren = Number.isFinite(data.number_of_children) ? data.number_of_children : 0;
      data.number_of_adults = safeAdults;
      data.number_of_children = safeChildren;
      const numberOfGuests = safeAdults + safeChildren;
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

      /*
       * `delta_guests` wird hier NICHT gesetzt.
       *
       * Die Spalte hat seit 11.09.2026 `DEFAULT 0` und haelt den kumulierten
       * Zuwachs gegenueber der urspruenglichen Buchung. Eine neue Buchung hat
       * per Definition keinen Zuwachs. Fortgeschrieben wird ausschliesslich
       * vom Trigger `trg_fortschreiben_delta_guests` — kein Anwendungspfad
       * schreibt die Spalte, auch nicht der Excel-Import oder die
       * Anfrage-Uebernahme.
       */

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

        // === Wäschemenge vormerken ===
        //
        // Der Ablauf ist festgelegt (docs/Prozess-Gaestezahl-Aenderung.md):
        //   1. Gästezahl ändern
        //   2. Zusatzkosten berechnen und Zahlungslink erstellen
        //   3. ERST DANN die Wäschebestellung anpassen
        //
        // Deshalb wird hier nur gemerkt, dass die Anpassung aussteht. Sie
        // läuft am Ende jedes Zweigs — nach "Forderungen anlegen", nach
        // "Zahlungslink erstellen" und auch nach "Nein, nur merken", denn
        // die Wäsche wird unabhängig davon gebraucht, ob der Gast dafür
        // zahlt.
        //
        // Bei einer REDUZIERUNG gibt es keine Rückfrage; dann wird direkt
        // unten angepasst.
        /*
         * Ob eine Erhöhung vorliegt, entscheidet die DATENBANK.
         *
         * Bis 08.09.2026 stand hier `new_guests > baselineGuests`, und
         * `baselineGuests` kam aus dem Buchungsobjekt im Browser:
         * `delta_guests ?? number_of_guests ?? 0`. Zwei Fehlerbilder:
         *
         *   - Fehlten beide Spalten im Objekt, war der Wert 0. Dann galt
         *     jedes Speichern als Erhöhung um die volle Gästezahl.
         *   - Enthielt das Objekt bereits die erhöhte Zahl, war die
         *     Bedingung falsch und es wurde NIE gefragt — die Zusatzkosten
         *     fielen still aus.
         *
         * Welche Abfrage welche Spalte mitlädt, darf darüber nicht
         * entscheiden. Die Buchung ist an dieser Stelle bereits gespeichert
         * (Schritt 1 des Ablaufs), also steht der Sollstand in der Tabelle.
         */
        /*
         * Erhoehung oder nicht?
         *
         * Entschieden wird gegen den Stand VOR dieser Bearbeitung. Der steht
         * im Objekt, mit dem der Dialog geoeffnet wurde. Gerechnet wird damit
         * nicht — das macht `calculate-booking-delta` serverseitig aus
         * `delta_guests` und den bestehenden Forderungen. Hier geht es nur um
         * die Frage, ob ueberhaupt gefragt werden muss.
         *
         * Die frühere Abfrage der "urspruenglich gebuchten" Zahl entfaellt:
         * es gibt keinen Fall "kein Ausgangswert" mehr, weil ein leerer
         * Zuwachs jetzt schlicht 0 bedeutet.
         */
        const alteGaestezahl = Number(initialData.number_of_guests) || 0;
        const linenNachzuziehen = new_guests !== alteGaestezahl;

        /*
         * Gefragt wird nicht "wurde gerade erhoeht?", sondern
         * "steht noch etwas offen?".
         *
         * Bis 11.09.2026 hing die Rueckfrage allein an
         * `new_guests > alteGaestezahl`. Damit war eine offene Zusatzperson
         * unsichtbar, sobald der Moment der Aenderung vorbei war: wurde eine
         * Forderung storniert oder geloescht, oder hatte man beim ersten Mal
         * "nur merken" gewaehlt, fuehrte kein Weg zurueck zur Berechnung —
         * ausser die Gaestezahl kuenstlich hoch und wieder runter zu setzen.
         *
         * `calculate-booking-delta` beantwortet die Frage serverseitig: es
         * kennt den Zuwachs aus der Buchung und die bereits abgerechneten
         * Personen aus `booking_charges`. Bleibt ein Rest, wird gefragt.
         * Ist alles abgerechnet, passiert nichts — auch dann nicht, wenn
         * gerade erhoeht wurde.
         */
        let offeneZusatzkosten = false;
        // FIX 11.09.2026: Ergebnis der Prüfung nach außen sichtbar machen,
        // damit der Dialog unten (offenerStand) es anzeigen kann, statt es
        // nach der Berechnung von offeneZusatzkosten zu verwerfen.
        let pruefData: any = null;
        try {
          const { data: pruef, error: pruefErr } = await supabase.functions.invoke(
            'calculate-booking-delta',
            { body: { booking_id: initialData.id, persist: false } }
          );
          if (pruefErr) throw pruefErr;
          pruefData = pruef;
          offeneZusatzkosten = Number((pruef as any)?.delta) > 0;
        } catch (e) {
          console.error('Zusatzkosten-Pruefung fehlgeschlagen:', e);
          // Nicht raten: lieber fragen als still uebergehen. Die Vorschau
          // selbst rechnet gleich erneut und legt den Rechenweg offen.
          offeneZusatzkosten = new_guests > alteGaestezahl;
        }

        if (offeneZusatzkosten) {
          setGebuchteGaesteDb(alteGaestezahl);
          // Erst fragen, ob Zusatzkosten erhoben werden sollen.
          // (Reduzierung erzeugt nie eine Forderung — man erstattet nichts
          // zurueck. Der Zuwachs kann dadurch aber wieder offen werden.)
          setPendingLinenGuests(linenNachzuziehen ? new_guests : null);
          setPendingDelta({ new_guests, new_nights });
          // FIX 11.09.2026: offenerStand aus dem bereits geholten Prüfergebnis
          // befüllen — vorher war die Variable nie gesetzt (siehe Kommentar
          // bei der State-Deklaration oben).
          setOffenerStand(pruefData ? {
            urspruenglich: Number(pruefData.urspruenglich_gebucht) || 0,
            zuwachs: Number(pruefData.zuwachs_gesamt) || 0,
            abgerechnet: Number(pruefData.bereits_abgerechnet) || 0,
            offen: Number(pruefData.delta) || 0,
          } : null);
          setShowChargeAskDialog(true);
          return; // Dialog übernimmt; onSuccess folgt nach der Entscheidung.
        }

        // Nichts offen: Wäsche trotzdem anpassen, wenn sich die Zahl geändert hat.
        if (linenNachzuziehen) {
          await runLinenAdjustment(initialData.id, new_guests);
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
        // estimated_cost kann null sein, wenn für keinen Artikel ein Preis
        // hinterlegt ist. Ohne diese Prüfung stünde hier "null EUR".
        description: data.estimated_cost
          ? `${data.total_items} Teile für ${data.booking.guest_name} - Geschätzte Kosten: ${data.estimated_cost} EUR`
          : `${data.total_items} Teile für ${data.booking.guest_name} - Kosten nicht berechenbar (keine Preise hinterlegt)`
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

  /**
   * Zieht die Wäschebestellung einer Buchung auf die aktuelle Gästezahl nach.
   *
   * Wird nach dem Speichern einer geänderten Personenzahl aufgerufen. Der Weg
   * entspricht dem Max-Tool `update_linen_for_booking` (chat-assistant), damit
   * es nur EINEN Rechenweg gibt: Mengen und Betrag kommen aus
   * `generate-booking-linen-order`, die bestehende Bestellung wird ersetzt.
   *
   * Drei Punkte, die hier bewusst so sind:
   *
   * 1. `total_cost` wird MITGESCHRIEBEN. Ohne das wandert die Menge und der
   *    Betrag bleibt stehen — genau der Fehler, der die Bestellung
   *    a538893c (Maximilian Herr, 02.01.2026) auf 104 Teile zum Preis von 38
   *    gebracht hat. 0 ist dabei kein gültiger Betrag: `null` heißt "nicht
   *    berechenbar", 0 hieße "kostenlos".
   *
   * 2. Der Status wird NICHT verändert. Steht die Bestellung schon auf
   *    `ausstehend`, liegt sie bei Teuni — sie auf `offen` zurückzusetzen
   *    würde den Freigabe-Trigger auslösen und einen zweiten Vorgang öffnen.
   *    Stattdessen wird ein max_actions-Eintrag angelegt: Teuni muss über die
   *    geänderte Menge informiert werden (Ablauf update_linen_for_booking,
   *    Schritt 4).
   *
   * 3. Stornierte Bestellungen bleiben unberührt.
   */
  const adjustLinenOrderToGuests = async (bookingId: string, guests: number) => {
    const { data: orders, error: findErr } = await supabase
      .from('linen_orders')
      .select('id, status, total_items')
      .eq('booking_id', bookingId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1);
    if (findErr) throw findErr;

    // Keine Bestellung vorhanden: nichts nachzuziehen. Das Anlegen macht die
    // Automatik (auto-create-linen-orders), nicht dieses Formular.
    if (!orders || orders.length === 0) return;
    const order = orders[0];

    const { data: calc, error: calcErr } = await supabase.functions.invoke(
      'generate-booking-linen-order',
      { body: { booking_id: bookingId } }
    );
    if (calcErr) throw calcErr;
    if (!calc?.success) throw new Error(calc?.error || 'Mengenberechnung fehlgeschlagen');

    const neueMenge = calc.total_items ?? 0;
    const alteMenge = order.total_items;
    const nowIso = new Date().toISOString();

    const { error: updErr } = await supabase
      .from('linen_orders')
      .update({
        items: calc.order_items,
        total_items: neueMenge,
        // 0 ist KEIN gültiger Betrag — bestellte Artikel kosten etwas.
        total_cost: calc.estimated_cost ? calc.estimated_cost : null,
        item_variants: calc.item_variants ?? undefined,
        linen_color: calc.linen_color ?? undefined,
        notes: `Wäschemenge an ${guests} Gäste angepasst (${new Date().toLocaleDateString('de-DE')}). Grund: geänderte Gästezahl.`,
        updated_at: nowIso,
      })
      .eq('id', order.id);
    if (updErr) throw updErr;

    // Vorgang sichtbar machen: Teuni muss die geänderte Menge sehen.
    try {
      await supabase.from('max_actions').insert({
        action_type: 'update_linen_for_booking',
        status: 'wartet_uli',
        booking_id: bookingId,
        waiting_for: 'teuni',
        last_step: `Wäschemenge angepasst (${alteMenge} → ${neueMenge} Teile, ${guests} Gäste) — Teuni muss informiert werden`,
        details: {
          order_id: order.id,
          alte_menge: alteMenge,
          neue_menge: neueMenge,
          gaeste: guests,
          status_der_bestellung: order.status,
        },
        created_by: 'uli',
      });
    } catch (logErr) {
      // Der Log darf die Anpassung nicht verhindern.
      console.error('max_actions-Log (Wäscheanpassung) fehlgeschlagen:', logErr);
    }

    toast({
      title: 'Wäschebestellung angepasst',
      description:
        `${alteMenge} → ${neueMenge} Teile für ${guests} Gäste` +
        (calc.estimated_cost ? `, ${Number(calc.estimated_cost).toFixed(2).replace('.', ',')} EUR` : '') +
        (order.status === 'ausstehend'
          ? '. Die Bestellung liegt bereits bei Teuni — bitte über die Änderung informieren.'
          : '.'),
      duration: 9000,
    });
  };

  /**
   * Schritt 3 ausführen: Wäschebestellung auf die neue Gästezahl bringen.
   *
   * Eigener Wrapper, weil der Aufruf an vier Endpunkten steht (Reduzierung,
   * "Nein, nur merken", "Forderungen anlegen", "Zahlungslink erstellen") und
   * ein Fehler dort den jeweiligen Vorgang NICHT abbrechen darf — die
   * Forderungen sind dann bereits angelegt. Er wird stattdessen deutlich
   * gemeldet, damit die Bestellung von Hand geprüft wird.
   */
  const runLinenAdjustment = async (bookingId: string, guests: number) => {
    try {
      await adjustLinenOrderToGuests(bookingId, guests);
    } catch (e) {
      console.error('Wäschemenge konnte nicht angepasst werden:', e);
      toast({
        title: 'Wäsche NICHT angepasst',
        description:
          'Die Gästezahl wurde gespeichert, die Wäschebestellung konnte aber nicht ' +
          'nachgezogen werden. Bitte in der Wäschekarte prüfen.',
        variant: 'destructive',
        duration: 12000,
      });
    } finally {
      setPendingLinenGuests(null);
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
  /*
   * Zusatzkosten pruefen, ohne die Gaestezahl zu aendern.
   *
   * Die Rueckfrage "Zusatzkosten berechnen?" erscheint nur bei einer
   * ERHOEHUNG. Wurde eine Forderung storniert oder geloescht und soll neu
   * gestellt werden, gab es bis 11.09.2026 keinen Weg dorthin — ausser die
   * Gaestezahl kuenstlich hoch und wieder runter zu setzen. Das erzeugte
   * zwei Meldungen an Teuni und zwei Waesche-Neuberechnungen fuer nichts.
   *
   * Dieser Knopf ruft dieselbe Funktion auf und aendert nichts: keine
   * Gaestezahl, keine Waesche, kein Vermerk. Er beantwortet die drei Fragen
   * in einem Schritt — ist schon berechnet, was ist berechnet, und faellt
   * jetzt noch etwas an.
   */
  const handlePruefeZusatzkosten = async () => {
    if (!initialData?.id) return;
    setIsCalculatingDelta(true);
    setZusatzkostenStand(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        'calculate-booking-delta',
        { body: { booking_id: initialData.id, persist: false } }
      );
      if (error) throw error;

      const charges = data?.charges || [];
      if (charges.length > 0) {
        setDeltaResult({
          charges,
          total_amount: data.total_amount || 0,
          zuwachs_gesamt: (data as any).zuwachs_gesamt,
          bereits_abgerechnet: (data as any).bereits_abgerechnet,
          urspruenglich_gebucht: (data as any).urspruenglich_gebucht,
          neue_gaestezahl: (data as any).neue_gaestezahl,
          naechte: (data as any).naechte,
          delta: (data as any).delta,
          bereits_berechnet: (data as any).bereits_berechnet,
        } as any);
      } else {
        // Nichts offen. Das ist eine Aussage und keine Fehlanzeige — der
        // Stand wird angezeigt, damit nachvollziehbar ist WARUM nichts anfaellt.
        setDeltaResult(null);
        setZusatzkostenStand({
          zuwachs: Number((data as any).zuwachs_gesamt) || 0,
          abgerechnet: Number((data as any).bereits_abgerechnet) || 0,
          urspruenglich: Number((data as any).urspruenglich_gebucht) || 0,
          jetzt: Number((data as any).neue_gaestezahl) || 0,
        });
      }
    } catch (e: any) {
      toast({
        title: 'Prüfung fehlgeschlagen',
        description: e.message || 'Zusatzkosten konnten nicht geprüft werden.',
        variant: 'destructive',
      });
    } finally {
      setIsCalculatingDelta(false);
    }
  };

  const handleAskYes = async () => {
    setShowChargeAskDialog(false);
    if (!pendingDelta || !initialData?.id) { onSuccess(); return; }
    setIsCalculatingDelta(true);
    try {
      const { data: deltaData, error } = await supabase.functions.invoke(
        'calculate-booking-delta',
        {
          body: {
            // NUR die booking_id. Gästezahl, gebuchte Ausgangszahl und
            // Nächte liest die Funktion selbst aus der Buchung — die ist zu
            // diesem Zeitpunkt bereits gespeichert (Schritt 1 des Ablaufs).
            //
            // Bis 08.09.2026 wurden `baseline_guests`, `new_guests` und
            // `new_nights` von hier mitgeschickt. `baselineGuests` fiel auf
            // 0 zurück, sobald das Buchungsobjekt weder `delta_guests` noch
            // `number_of_guests` enthielt — und welche Abfrage welche Spalte
            // mitlädt, entschied damit über einen Geldbetrag.
            booking_id: initialData.id,
            persist: false,
          },
        }
      );
      if (error) throw error;

      // Die Funktion konnte keine Ausgangs-Gästezahl ermitteln und hat
      // deshalb bewusst NICHTS gerechnet. Früher entstanden hier
      // stillschweigend Forderungen über die volle Gästezahl.
      if ((deltaData as any)?.warnung) {
        toast({
          title: 'Zusatzkosten nicht berechenbar',
          description: (deltaData as any).warnung,
          variant: 'destructive',
          duration: 15000,
        });
        setDeltaResult(null);
        if (initialData?.id && pendingLinenGuests) {
          await runLinenAdjustment(initialData.id, pendingLinenGuests);
        }
        onSuccess();
        return;
      }

      const charges = deltaData?.charges || [];
      if (charges.length > 0) {
        // Rechenweg und bestehende Forderungen mit übernehmen, damit die
        // Vorschau offenlegt, gegen welche Zahl gerechnet wurde.
        setDeltaResult({
          charges,
          total_amount: deltaData.total_amount || 0,
          zuwachs_gesamt: (deltaData as any).zuwachs_gesamt,
          bereits_abgerechnet: (deltaData as any).bereits_abgerechnet,
          urspruenglich_gebucht: (deltaData as any).urspruenglich_gebucht,
          neue_gaestezahl: (deltaData as any).neue_gaestezahl,
          naechte: (deltaData as any).naechte,
          delta: (deltaData as any).delta,
          bereits_berechnet: (deltaData as any).bereits_berechnet,
        } as any);
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
      setOffenerStand(null);
    }
  };

  // "Nein, nicht berechnen" -> Änderung vermerken, keine Forderung anlegen
  const handleAskNo = async () => {
    setShowChargeAskDialog(false);
    const guests = pendingDelta?.new_guests ?? null;
    setPendingDelta(null);
    setOffenerStand(null);

    /*
     * "Nur merken" muss auch wirklich merken.
     *
     * Bis 08.09.2026 zeigte dieser Zweig einen Toast und tat sonst nichts:
     * kein Feld, keine Notiz, kein Vermerk. Eine Erhöhung ohne Zusatzkosten
     * war danach nirgends auffindbar, und `delta_guests` blieb leer — was
     * die nächste Änderung gegen einen falschen Ausgangswert rechnen liess.
     */
    if (initialData?.id) {
      try {
        const patch: Record<string, unknown> = {
          guests_changed_at: new Date().toISOString(),
          guest_surcharge_amount: 0,
        };
        /*
         * `delta_guests` wird hier nicht geschrieben — das macht der Trigger.
         *
         * `.select()` ist Pflicht: ohne sie meldet Supabase `error === null`,
         * auch wenn NULL Zeilen betroffen waren, und der Code bestaetigt
         * einen Erfolg, den es nicht gab (CODING-GUIDE B3).
         */
        const { data: upd, error } = await supabase
          .from('bookings').update(patch).eq('id', initialData.id).select('id');
        if (error) throw error;
        if (!upd || upd.length === 0) throw new Error('Keine Zeile aktualisiert');
      } catch (e) {
        console.error('Vermerk zur Gästezahl-Änderung fehlgeschlagen:', e);
        toast({
          title: 'Vermerk nicht gespeichert',
          description: 'Die Änderung konnte nicht dokumentiert werden. Bitte melden.',
          variant: 'destructive',
        });
      }
    }

    toast({ title: 'Notiz', description: 'Mehr Gäste erfasst — keine Zusatzkosten berechnet.' });

    // Schritt 3: Wäsche trotzdem anpassen — sie wird unabhängig davon
    // gebraucht, ob der Gast dafür zahlt.
    if (initialData?.id && guests) {
      await runLinenAdjustment(initialData.id, guests);
    }
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

    /*
     * Uebergang dokumentieren.
     *
     * `guest_surcharge_amount` haelt die Summe ALLER nicht stornierten
     * Zusatzforderungen dieser Buchung, nicht nur die des letzten Vorgangs.
     * Bis 11.09.2026 wurde der Wert ueberschrieben — nach der zweiten
     * Aenderung zeigte das Badge deshalb nur den letzten Betrag, sah aber
     * wie die Gesamtsumme aus.
     *
     * `delta_guests` wird hier NICHT geschrieben — das macht der Trigger
     * `trg_fortschreiben_delta_guests` im selben Schreibvorgang wie
     * `number_of_guests`.
     */
    try {
      const { data: alleForderungen } = await supabase
        .from('booking_charges')
        .select('amount')
        .eq('booking_id', initialData.id)
        .eq('origin', 'auto_delta')
        .neq('status', 'cancelled');

      const summe = (alleForderungen ?? [])
        .reduce((s: number, c: any) => s + Number(c.amount || 0), 0);

      const patch: Record<string, unknown> = {
        guests_changed_at: new Date().toISOString(),
        guest_surcharge_amount: Math.round(summe * 100) / 100,
      };

      // `.select()` ist Pflicht — ohne sie meldet Supabase `error === null`,
      // auch wenn NULL Zeilen betroffen waren (CODING-GUIDE B3).
      const { data: upd, error: updErr } = await supabase
        .from('bookings').update(patch).eq('id', initialData.id).select('id');
      if (updErr) throw updErr;
      if (!upd || upd.length === 0) throw new Error('Keine Zeile aktualisiert');
    } catch (e) {
      console.error('Konnte Gästezahl-Übergang nicht speichern:', e);
      toast({
        title: 'Vermerk nicht gespeichert',
        description: 'Die Forderungen wurden angelegt, der Vermerk in der Buchung nicht. Bitte melden.',
        variant: 'destructive',
      });
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
      // Schritt 3: erst jetzt, nach Abschluss der Zusatzkosten.
      if (initialData?.id && pendingLinenGuests) {
        await runLinenAdjustment(initialData.id, pendingLinenGuests);
      }
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
      // Schritt 3: erst nach Forderungen UND Zahlungslink.
      if (initialData?.id && pendingLinenGuests) {
        await runLinenAdjustment(initialData.id, pendingLinenGuests);
      }
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
                    onChange={(e) => {
                      const v = e.target.value;
                      field.onChange(v === '' ? undefined : parseInt(v, 10));
                    }}
                    value={field.value ?? ''}
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
                    onChange={(e) => {
                      const v = e.target.value;
                      field.onChange(v === '' ? undefined : parseInt(v, 10));
                    }}
                    value={field.value ?? ''}
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

            {/* Zusatzkosten pruefen — sichtbar, sobald ein Zuwachs vorliegt.
                Aendert nichts, rechnet nur. */}
            {Number((initialData as any)?.delta_guests) > 0 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePruefeZusatzkosten}
                  disabled={isCalculatingDelta}
                  className="w-full mt-2 border-amber-400 text-amber-900 hover:bg-amber-50"
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  {isCalculatingDelta
                    ? 'Prüfe Zusatzkosten...'
                    : 'Zusatzkosten prüfen / neu berechnen'}
                </Button>
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  Ändert nichts an Buchung, Wäsche oder Dienstleistern.
                </p>
              </>
            )}

            {zusatzkostenStand && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 mt-2">
                <p className="text-sm font-semibold text-emerald-900">
                  Keine offenen Zusatzkosten
                </p>
                <p className="text-xs text-emerald-800 mt-1">
                  Ursprünglich {zusatzkostenStand.urspruenglich} Gäste, jetzt{' '}
                  {zusatzkostenStand.jetzt} — Zuwachs {zusatzkostenStand.zuwachs},
                  davon bereits abgerechnet {zusatzkostenStand.abgerechnet}.
                  {zusatzkostenStand.zuwachs > zusatzkostenStand.abgerechnet
                    ? ' Für die Differenz fallen keine Posten an (keine Sätze hinterlegt).'
                    : ' Es ist alles abgerechnet.'}
                </p>
              </div>
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
                  {/* Rechenweg offenlegen. Die Fehlberechnung bei Tal Yehuda
                      (7 statt 1 Zusatzperson, dreimal) blieb unbemerkt, weil
                      nirgends stand, gegen welche Zahl gerechnet wurde. */}
                  {typeof (deltaResult as any).zuwachs_gesamt === 'number' && (
                    <p className="text-xs text-amber-800 mt-1">
                      Gerechnet aus der Buchung: ursprünglich{' '}
                      {(deltaResult as any).urspruenglich_gebucht} Gäste, jetzt{' '}
                      {(deltaResult as any).neue_gaestezahl} — Zuwachs{' '}
                      {(deltaResult as any).zuwachs_gesamt}
                      {(deltaResult as any).bereits_abgerechnet > 0
                        ? `, davon bereits abgerechnet ${(deltaResult as any).bereits_abgerechnet}`
                        : ''}
                      {' '}= <strong>{(deltaResult as any).delta} zu berechnende Person
                      {(deltaResult as any).delta === 1 ? '' : 'en'}</strong>
                      {(deltaResult as any).naechte ? `, ${(deltaResult as any).naechte} Nächte` : ''}
                    </p>
                  )}
                  <p className="text-xs text-amber-800 mt-1">
                    Beträge bei Bedarf anpassen, dann als Forderung anlegen oder Zahlungslink senden.
                  </p>
                </div>
              </div>

              {/* Für diese Buchung bestehen bereits Zusatzforderungen */}
              {Array.isArray((deltaResult as any).bereits_berechnet) &&
                (deltaResult as any).bereits_berechnet.length > 0 && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 mb-3">
                  <p className="text-sm font-semibold text-red-900">
                    Achtung: Für diese Buchung {(deltaResult as any).bereits_berechnet.length === 1
                      ? 'besteht bereits eine Zusatzforderung'
                      : `bestehen bereits ${(deltaResult as any).bereits_berechnet.length} Zusatzforderungen`}
                  </p>
                  <div className="text-xs text-red-800 mt-1 space-y-0.5">
                    {(deltaResult as any).bereits_berechnet.map((b: any, i: number) => (
                      <div key={i}>
                        {Number(b.amount).toFixed(2).replace('.', ',')} € · {b.description}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-red-800 mt-2">
                    Legst du jetzt weitere an, wird doppelt gefordert. Prüfe, ob die
                    bestehenden Posten stattdessen storniert gehören.
                  </p>
                </div>
              )}

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
              {offenerStand ? (
                <>
                  Ursprünglich <strong>{offenerStand.urspruenglich}</strong> Gäste gebucht,
                  jetzt <strong>{pendingDelta?.new_guests ?? '—'}</strong> — Zuwachs{' '}
                  <strong>{offenerStand.zuwachs}</strong>
                  {offenerStand.abgerechnet > 0
                    ? <>, davon bereits abgerechnet <strong>{offenerStand.abgerechnet}</strong></>
                    : null}
                  . Noch nicht abgerechnet:{' '}
                  <strong>
                    {offenerStand.offen} Person{offenerStand.offen === 1 ? '' : 'en'}
                  </strong>.
                  {' '}Sollen dafür Zusatzkosten (Bettwäsche, Ortstaxe, ggf. Reinigung)
                  berechnet und ein Zahlungslink vorbereitet werden?
                </>
              ) : (
                <>
                  Es kommen{' '}
                  <strong>
                    {pendingDelta && gebuchteGaesteDb !== null
                      ? Math.max(0, pendingDelta.new_guests - gebuchteGaesteDb)
                      : 0}
                  </strong>{' '}
                  zusätzliche Person(en) gegenüber dem bisherigen Stand ({gebuchteGaesteDb ?? '—'}).
                  Sollen dafür Zusatzkosten (Bettwäsche, Ortstaxe, ggf. Reinigung)
                  berechnet und ein Zahlungslink vorbereitet werden?
                </>
              )}
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