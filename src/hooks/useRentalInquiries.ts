import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Mietinteressenten „Wohnen auf Zeit“ (SQL 72): Anfragen von der Website, interne
 * Kalkulation je Haus, persönliche Angebote. Bewusst getrennt von useBookingInquiries
 * (Urlaubsanfragen → Buchung). Tabellen sind noch nicht in types.ts → `as any`.
 */

export type RentalInquiryStatus = 'new' | 'contacted' | 'viewing' | 'offer' | 'rejected' | 'closed';

export interface RentalInquiry {
  id: string;
  house_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  move_in: string;
  duration_months: number | null;
  persons: number;
  purpose: 'work' | 'home_office' | 'other' | null;
  purpose_detail: string | null;
  pets: boolean;
  registration_confirmed: boolean;
  message: string | null;
  language: 'de' | 'en';
  source: string;
  status: RentalInquiryStatus;
  seen_at: string | null;
  admin_note: string | null;
  created_at: string;
  houses?: { id: string; name: string } | null;
}

export type RentalOfferStatus = 'draft' | 'released' | 'viewed' | 'accepted' | 'question' | 'withdrawn';

export interface RentalOffer {
  id: string;
  inquiry_id: string | null;
  house_id: string;
  token: string;
  guest_name: string;
  guest_email: string | null;
  language: 'de' | 'en';
  rent_month: number;
  utilities_month: number;
  utilities_mode: 'flat' | 'advance';
  deposit: number;
  final_cleaning_fee: number;
  move_in: string;
  duration_months: number | null;
  conditions_de: string | null;
  conditions_en: string | null;
  valid_until: string;
  status: RentalOfferStatus;
  released_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  response_seen_at: string | null;
  response_notified_at?: string | null;
  /** „Als Mieter übernehmen“ ausgeführt (SQL 73) */
  converted_at?: string | null;
  guest_message: string | null;
  created_at: string;
}

export const INQUIRY_STATUS_LABEL: Record<RentalInquiryStatus, string> = {
  new: 'neu',
  contacted: 'kontaktiert',
  viewing: 'Besichtigung',
  offer: 'Angebot',
  rejected: 'abgesagt',
  closed: 'erledigt',
};

export const OFFER_STATUS_LABEL: Record<RentalOfferStatus, string> = {
  draft: 'Entwurf (Kunde sieht nichts)',
  released: 'freigegeben, noch nicht geöffnet',
  viewed: 'vom Kunden geöffnet',
  accepted: 'vom Kunden angenommen',
  question: 'Rückfrage vom Kunden',
  withdrawn: 'zurückgezogen',
};

export const PURPOSE_LABEL: Record<string, string> = {
  work: 'Arbeit in der Region',
  home_office: 'Homeoffice / Auszeit',
  other: 'Sonstiges',
};

/** Link für den Kunden — die Angebotsseite liegt auf der Website. */
export const rentalOfferLink = (token: string, language: 'de' | 'en') =>
  `https://steinbockchalets.com/${language === 'en' ? 'offer' : 'angebot'}/${token}`;

export const useRentalInquiries = () =>
  useQuery({
    queryKey: ['rental-inquiries'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('rental_inquiries')
        .select('*, houses(id, name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as RentalInquiry[];
    },
    refetchInterval: 5 * 60 * 1000,
  });

export const useRentalOffers = () =>
  useQuery({
    queryKey: ['rental-offers'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('rental_offers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as RentalOffer[];
    },
    refetchInterval: 5 * 60 * 1000,
  });

/** Status einer Anfrage setzen (und dabei als gesehen markieren). */
export const useUpdateRentalInquiry = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: Partial<RentalInquiry> }) => {
      const { data, error } = await (supabase as any)
        .from('rental_inquiries').update(changes).eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Keine Zeile geändert (Rechte?)');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rental-inquiries'] }),
    onError: (e: any) => {
      console.error('[Mietinteressenten] Anfrage ändern', e);
      toast({ title: 'Konnte nicht gespeichert werden', description: e?.message, variant: 'destructive' });
    },
  });
};

/** Antwort eines Kunden auf ein Angebot als gesehen markieren. */
export const useMarkOfferResponseSeen = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any)
        .from('rental_offers').update({ response_seen_at: new Date().toISOString() }).eq('id', id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Keine Zeile geändert (Rechte?)');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rental-offers'] }),
    onError: (e: any) => console.error('[Mietinteressenten] Antwort gesehen', e),
  });
};
