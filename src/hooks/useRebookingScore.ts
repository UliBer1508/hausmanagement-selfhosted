import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GuestRebookingData {
  guest_key: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  nationality: string | null;
  stay_count: number;
  total_revenue: number;
  last_stay: string | null;
  months_since_last_stay: number;
  avg_stay_nights: number;
  preferred_season: string | null;
  last_house: string | null;
  rebooking_score: number;
  score_label: 'critical' | 'at_risk' | 'stable' | 'loyal';
}

function calculateRebookingScore(g: {
  stay_count: number;
  total_revenue: number;
  months_since_last_stay: number;
  avg_stay_nights: number;
}): number {
  let score = 100;
  if (g.months_since_last_stay > 18) score -= 55;
  else if (g.months_since_last_stay > 12) score -= 40;
  else if (g.months_since_last_stay > 9) score -= 25;
  else if (g.months_since_last_stay > 6) score -= 12;
  else if (g.months_since_last_stay > 3) score -= 4;

  if (g.stay_count === 1) score -= 20;
  else if (g.stay_count === 2) score -= 8;
  else if (g.stay_count >= 5) score += 10;

  if (g.total_revenue >= 4000) score += 8;
  else if (g.total_revenue >= 2000) score += 4;
  else if (g.total_revenue < 500) score -= 5;

  if (g.avg_stay_nights >= 7) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getScoreLabel(score: number): GuestRebookingData['score_label'] {
  if (score < 25) return 'critical';
  if (score < 50) return 'at_risk';
  if (score < 75) return 'stable';
  return 'loyal';
}

function getPreferredSeason(checkIn: string): string {
  const month = new Date(checkIn).getMonth() + 1;
  if (month >= 12 || month <= 2) return 'Winter';
  if (month >= 3 && month <= 5) return 'Frühling';
  if (month >= 6 && month <= 8) return 'Sommer';
  return 'Herbst';
}

export function useRebookingGuests() {
  return useQuery({
    queryKey: ['rebooking-guests'],
    queryFn: async (): Promise<GuestRebookingData[]> => {
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
          guest_name,
          guest_email,
          guest_phone,
          nationality,
          booking_amount,
          check_in,
          check_out,
          number_of_guests,
          houses!bookings_house_id_fkey(name)
        `)
        .not('guest_name', 'is', null)
        .order('check_in', { ascending: false });

      if (error) throw error;
      if (!bookings) return [];

      const guestMap = new Map<string, any>();
      const now = new Date();

      bookings.forEach((booking: any) => {
        const key = `${booking.guest_name}|${booking.guest_email || ''}`;
        if (!guestMap.has(key)) {
          guestMap.set(key, {
            guest_key: key,
            guest_name: booking.guest_name,
            guest_email: booking.guest_email,
            guest_phone: booking.guest_phone,
            nationality: booking.nationality,
            stay_count: 0,
            total_revenue: 0,
            total_nights: 0,
            last_stay: null,
            last_house: null,
            preferred_season: null,
          });
        }
        const g = guestMap.get(key)!;
        g.stay_count += 1;
        g.total_revenue += booking.booking_amount || 0;

        if (booking.check_in && booking.check_out) {
          const nights = Math.round(
            (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          g.total_nights += nights;
        }

        if (!g.last_stay || new Date(booking.check_in) > new Date(g.last_stay)) {
          g.last_stay = booking.check_in;
          g.last_house = booking.houses?.name || null;
          g.preferred_season = getPreferredSeason(booking.check_in);
        }
      });

      return Array.from(guestMap.values())
        .map((g) => {
          const monthsSince = g.last_stay
            ? (now.getTime() - new Date(g.last_stay).getTime()) / (1000 * 60 * 60 * 24 * 30)
            : 99;
          const score = calculateRebookingScore({
            stay_count: g.stay_count,
            total_revenue: g.total_revenue,
            months_since_last_stay: monthsSince,
            avg_stay_nights: g.stay_count > 0 ? g.total_nights / g.stay_count : 0,
          });
          return {
            ...g,
            months_since_last_stay: Math.round(monthsSince),
            avg_stay_nights: g.stay_count > 0 ? Math.round(g.total_nights / g.stay_count) : 0,
            rebooking_score: score,
            score_label: getScoreLabel(score),
          } as GuestRebookingData;
        })
        .filter((g) => g.guest_email)
        .sort((a, b) => a.rebooking_score - b.rebooking_score);
    },
  });
}

export function useSendRebookingOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      guest,
      aiContent,
      aiSubject,
      aiHtml,
    }: {
      guest: GuestRebookingData;
      aiContent: string;
      aiSubject: string;
      aiHtml?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('send-gmail', {
        body: {
          to: [guest.guest_email],
          subject: aiSubject,
          html: aiHtml || aiContent,
          text: aiContent,
          guestName: guest.guest_name,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Versand fehlgeschlagen');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rebooking-guests'] });
    },
  });
}