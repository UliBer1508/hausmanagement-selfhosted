import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_url: string | null;
  paid_at: string | null;
  stripe_payment_link_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

export interface BookingChargeRow {
  id: string;
  booking_id: string;
  house_id: string | null;
  charge_type: string;
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  currency: string;
  status: 'open' | 'paid' | 'cancelled' | string;
  origin: string | null;
  payment_id: string | null;
  created_at: string;
  payment?: PaymentRow | null;
}

export const useBookingCharges = (bookingId?: string) => {
  return useQuery({
    queryKey: ['booking_charges', bookingId],
    enabled: !!bookingId,
    queryFn: async (): Promise<BookingChargeRow[]> => {
      const { data: charges, error } = await supabase
        .from('booking_charges')
        .select('*')
        .eq('booking_id', bookingId!)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const paymentIds = (charges || [])
        .map((c: any) => c.payment_id)
        .filter(Boolean);

      let paymentsById: Record<string, PaymentRow> = {};
      if (paymentIds.length > 0) {
        const { data: payments, error: pErr } = await supabase
          .from('payments')
          .select('*')
          .in('id', paymentIds);
        if (pErr) throw pErr;
        paymentsById = Object.fromEntries((payments || []).map((p: any) => [p.id, p]));
      }

      return (charges || []).map((c: any) => ({
        ...c,
        payment: c.payment_id ? paymentsById[c.payment_id] || null : null,
      }));
    },
  });
};
