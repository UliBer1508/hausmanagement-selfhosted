import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GuestCommunication {
  id: string;
  guest_id: string | null;
  guest_email: string | null;
  guest_name: string | null;
  direction: 'outbound' | 'inbound';
  channel: string;
  subject: string | null;
  body: string | null;
  occurred_at: string;
  created_at: string;
}

export interface LogCommunicationInput {
  guestId?: string | null;
  guestEmail?: string | null;
  guestName?: string | null;
  direction: 'outbound' | 'inbound';
  channel?: string;
  subject?: string | null;
  body?: string | null;
  occurredAt?: string;
}

const buildQueryKey = (guestEmail?: string | null, guestId?: string | null) => [
  'guest-communications',
  guestId ?? null,
  guestEmail?.toLowerCase() ?? null,
];

export function useGuestCommunications(guestEmail?: string | null, guestId?: string | null) {
  return useQuery({
    queryKey: buildQueryKey(guestEmail, guestId),
    enabled: !!(guestEmail || guestId),
    queryFn: async (): Promise<GuestCommunication[]> => {
      let query = supabase
        .from('guest_communications')
        .select('*')
        .order('occurred_at', { ascending: false });

      if (guestId && guestEmail) {
        query = query.or(`guest_id.eq.${guestId},guest_email.ilike.${guestEmail}`);
      } else if (guestId) {
        query = query.eq('guest_id', guestId);
      } else if (guestEmail) {
        query = query.ilike('guest_email', guestEmail);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as GuestCommunication[];
    },
  });
}

export function useLogCommunication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogCommunicationInput) => {
      const row = {
        guest_id: input.guestId ?? null,
        guest_email: input.guestEmail ?? null,
        guest_name: input.guestName ?? null,
        direction: input.direction,
        channel: input.channel ?? 'email',
        subject: input.subject ?? null,
        body: input.body ?? null,
        occurred_at: input.occurredAt ?? new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('guest_communications')
        .insert(row)
        .select('*')
        .single();
      if (error) throw error;
      return data as GuestCommunication;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest-communications'] });
    },
  });
}

/**
 * Fire-and-forget logger used in places that don't want to await the mutation.
 * Errors are caught and logged so they don't break the calling flow.
 */
export async function logCommunication(input: LogCommunicationInput) {
  try {
    const row = {
      guest_id: input.guestId ?? null,
      guest_email: input.guestEmail ?? null,
      guest_name: input.guestName ?? null,
      direction: input.direction,
      channel: input.channel ?? 'email',
      subject: input.subject ?? null,
      body: input.body ?? null,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    };
    const { error } = await supabase.from('guest_communications').insert(row);
    if (error) throw error;
  } catch (err) {
    console.error('[logCommunication] failed:', err);
  }
}