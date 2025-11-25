import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export const useProviderMessageNotifications = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to all new provider messages
    const channel = supabase
      .channel('global-provider-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'provider_messages',
          filter: 'sender_type=eq.provider',
        },
        async (payload) => {
          const newMessage = payload.new;
          
          // Fetch provider details to get the name
          const { data: provider } = await supabase
            .from('service_providers')
            .select('name, alias')
            .eq('id', newMessage.provider_id)
            .single();

          const providerName = provider?.alias || provider?.name || 'Service Provider';
          const messagePreview = newMessage.message.substring(0, 50) + (newMessage.message.length > 50 ? '...' : '');

          // Show toast notification
          toast({
            title: `📩 Neue Nachricht von ${providerName}`,
            description: `"${messagePreview}"`,
            duration: 5000,
          });

          // Invalidate queries to update unread counts
          queryClient.invalidateQueries({ queryKey: ['provider-unread-counts'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast, queryClient]);
};
