import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BookingInquiry {
  id: string;
  house_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  number_of_guests: number;
  number_of_adults?: number | null;
  number_of_children?: number | null;
  estimated_amount?: number | null;
  message: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
  updated_at: string;
  houses?: {
    id: string;
    name: string;
  };
}

// Hilfsfunktion: Gast speichern oder aktualisieren
const saveOrUpdateGuest = async (inquiry: BookingInquiry): Promise<string | null> => {
  let guestId: string | null = null;
  
  // Prüfen ob Gast bereits existiert (per E-Mail)
  if (inquiry.guest_email) {
    const { data: existingGuest } = await supabase
      .from('guests')
      .select('id')
      .eq('email', inquiry.guest_email)
      .maybeSingle();
    
    if (existingGuest) {
      // Existierenden Gast aktualisieren
      guestId = existingGuest.id;
      await supabase
        .from('guests')
        .update({
          name: inquiry.guest_name,
          phone: inquiry.guest_phone || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingGuest.id);
    }
  }
  
  // Neuen Gast erstellen falls nicht gefunden
  if (!guestId) {
    const { data: newGuest } = await supabase
      .from('guests')
      .insert({
        name: inquiry.guest_name,
        email: inquiry.guest_email,
        phone: inquiry.guest_phone || null,
        notes: `Quelle: Buchungsanfrage vom ${new Date(inquiry.created_at || new Date()).toLocaleDateString('de-DE')}`,
      })
      .select('id')
      .single();
    
    if (newGuest) {
      guestId = newGuest.id;
    }
  }
  
  return guestId;
};

export const useBookingInquiries = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Lade alle pending Anfragen
  const { data: inquiries = [], isLoading, refetch } = useQuery({
    queryKey: ['booking-inquiries', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_inquiries')
        .select(`
          *,
          houses!booking_inquiries_house_id_fkey (
            id,
            name
          )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as BookingInquiry[];
    },
  });

  // Anfrage akzeptieren und zur Buchung konvertieren
  const acceptInquiry = useMutation({
    mutationFn: async (inquiry: BookingInquiry) => {
      // 1. Gast speichern oder aktualisieren
      const guestId = await saveOrUpdateGuest(inquiry);

      // 2. Buchung erstellen mit guest_id
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          house_id: inquiry.house_id,
          guest_id: guestId,
          guest_name: inquiry.guest_name,
          guest_email: inquiry.guest_email,
          guest_phone: inquiry.guest_phone,
          check_in: inquiry.check_in,
          check_out: inquiry.check_out,
          number_of_guests: inquiry.number_of_guests,
          notes: inquiry.message || undefined,
          status: 'confirmed',
          source: 'inquiry',
          platform: 'website'
        })
        .select()
        .single();

      if (bookingError) throw bookingError;

      // 2. Reinigungsauftrag erstellen
      const checkOutDate = new Date(inquiry.check_out);
      const { error: cleaningError } = await supabase
        .from('service_tasks')
        .insert({
          house_id: inquiry.house_id,
          booking_id: booking.id,
          service_type: 'cleaning',
          status: 'scheduled',
          scheduled_date: checkOutDate.toISOString().split('T')[0],
          scheduled_time: '10:00:00',
          notes: `Abreise-Reinigung für ${inquiry.guest_name}`
        });

      if (cleaningError) {
        console.error('Fehler beim Erstellen des Reinigungsauftrags:', cleaningError);
      }

      // 3. Anfrage-Status auf confirmed setzen
      const { error: updateError } = await supabase
        .from('booking_inquiries')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', inquiry.id);

      if (updateError) throw updateError;

      return booking;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-inquiries'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['service-tasks'] });
      toast({
        title: "Buchung erstellt",
        description: "Die Anfrage wurde erfolgreich in eine Buchung umgewandelt.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: error.message || "Die Anfrage konnte nicht verarbeitet werden.",
        variant: "destructive",
      });
    },
  });

  // Anfrage ablehnen (Gastdaten werden trotzdem gespeichert!)
  const rejectInquiry = useMutation({
    mutationFn: async (inquiry: BookingInquiry) => {
      // 1. Gast speichern oder aktualisieren (Lead behalten!)
      await saveOrUpdateGuest(inquiry);

      // 2. Anfrage-Status auf rejected setzen
      const { error } = await supabase
        .from('booking_inquiries')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', inquiry.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-inquiries'] });
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      toast({
        title: "Anfrage abgelehnt",
        description: "Die Buchungsanfrage wurde abgelehnt. Gastdaten wurden gespeichert.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler",
        description: error.message || "Die Anfrage konnte nicht abgelehnt werden.",
        variant: "destructive",
      });
    },
  });

  // Funktion um nur den Status zu aktualisieren (ohne Gast zu speichern)
  const updateInquiryStatus = async (inquiryId: string, status: 'confirmed' | 'rejected') => {
    const { error } = await supabase
      .from('booking_inquiries')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', inquiryId);
    
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['booking-inquiries'] });
  };

  return {
    inquiries,
    pendingCount: inquiries.length,
    isLoading,
    refetch,
    acceptInquiry: acceptInquiry.mutate,
    rejectInquiry: rejectInquiry.mutate,
    updateInquiryStatus,
    isAccepting: acceptInquiry.isPending,
    isRejecting: rejectInquiry.isPending,
  };
};
