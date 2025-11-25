import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export interface ProviderMessage {
  id: string;
  provider_id: string;
  sender_type: 'admin' | 'provider';
  message: string;
  is_read: boolean;
  related_task_id?: string | null;
  related_linen_order_id?: string | null;
  created_at: string;
}

export const useProviderMessages = (providerId: string | null) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load messages for selected provider
  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['provider-messages', providerId],
    queryFn: async () => {
      if (!providerId) return [];
      
      const { data, error } = await supabase
        .from('provider_messages')
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as ProviderMessage[];
    },
    enabled: !!providerId,
  });

  // Count unread messages per provider
  const { data: unreadCounts = {} } = useQuery({
    queryKey: ['provider-unread-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('provider_messages')
        .select('provider_id')
        .eq('sender_type', 'provider')
        .eq('is_read', false);

      if (error) throw error;

      const counts: Record<string, number> = {};
      data.forEach((msg) => {
        counts[msg.provider_id] = (counts[msg.provider_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Send message (as admin)
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, relatedTaskId, relatedLinenOrderId }: {
      message: string;
      relatedTaskId?: string | null;
      relatedLinenOrderId?: string | null;
    }) => {
      if (!providerId) throw new Error('No provider selected');

      const { data, error } = await supabase
        .from('provider_messages')
        .insert({
          provider_id: providerId,
          sender_type: 'admin',
          message,
          related_task_id: relatedTaskId,
          related_linen_order_id: relatedLinenOrderId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-messages', providerId] });
      toast({
        title: 'Nachricht gesendet',
        description: 'Die Nachricht wurde erfolgreich versendet.',
      });
    },
    onError: (error) => {
      console.error('Error sending message:', error);
      toast({
        title: 'Fehler',
        description: 'Die Nachricht konnte nicht gesendet werden.',
        variant: 'destructive',
      });
    },
  });

  // Mark messages as read
  const markAsReadMutation = useMutation({
    mutationFn: async (messageIds: string[]) => {
      const { error } = await supabase
        .from('provider_messages')
        .update({ is_read: true })
        .in('id', messageIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-messages', providerId] });
      queryClient.invalidateQueries({ queryKey: ['provider-unread-counts'] });
    },
  });

  // Realtime subscription for live updates
  useEffect(() => {
    if (!providerId) return;

    const channel = supabase
      .channel(`provider-messages-${providerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'provider_messages',
          filter: `provider_id=eq.${providerId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['provider-messages', providerId] });
          queryClient.invalidateQueries({ queryKey: ['provider-unread-counts'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [providerId, queryClient]);

  return {
    messages,
    isLoading,
    unreadCounts,
    sendMessage: sendMessageMutation.mutate,
    markAsRead: markAsReadMutation.mutate,
  };
};
