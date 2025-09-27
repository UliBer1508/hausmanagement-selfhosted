import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

export interface GuestProfile {
  id?: string;
  guest_email: string;
  booking_id?: string;
  house_id?: string;
  age_group?: string;
  group_type?: string;
  group_size?: number;
  nationality?: string;
  preferred_categories?: string[];
  activity_level?: string;
  budget_range?: string;
  weather_preference?: string;
  time_preference?: string;
  predicted_interests?: any;
  confidence_score?: number;
  stay_duration?: number;
  check_in_date?: string;
  check_out_date?: string;
  house_location?: string;
  booking_source?: string;
  last_updated?: string;
}

export const useGuestProfile = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  // Hole Gäste-Profil für eine Buchung
  const getGuestProfile = useCallback(async (guestEmail: string, bookingId?: string) => {
    let query = supabase
      .from('guest_preferences')
      .select('*')
      .eq('guest_email', guestEmail);
    
    if (bookingId) {
      query = query.eq('booking_id', bookingId);
    }
    
    const { data, error } = await query.order('last_updated', { ascending: false }).limit(1);
    
    if (error) throw error;
    return data?.[0] as GuestProfile | null;
  }, []);

  // Generiere Gäste-Profil für eine Buchung
  const generateProfileMutation = useMutation({
    mutationFn: async ({ bookingId, regenerate = false }: { bookingId: string; regenerate?: boolean }) => {
      setIsGenerating(true);
      
      const { data, error } = await supabase.functions.invoke('generate-guest-profile', {
        body: {
          booking_id: bookingId,
          generate_new: regenerate
        }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Gäste-Profil generiert",
        description: "AI-basierte Gästeanalyse erfolgreich durchgeführt und gespeichert",
      });
      queryClient.invalidateQueries({ queryKey: ['guest-preferences'] });
    },
    onError: (error: any) => {
      console.error('Failed to generate guest profile:', error);
      toast({
        title: "Profil-Generierung fehlgeschlagen",
        description: "Das Gäste-Profil konnte nicht erstellt werden",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsGenerating(false);
    }
  });

  // Hole alle gespeicherten Profile
  const getAllProfiles = useCallback(async (limit = 50) => {
    const { data, error } = await supabase
      .from('guest_preferences')
      .select('*')
      .order('last_updated', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data as GuestProfile[];
  }, []);

  // Suche Profile nach E-Mail oder anderen Kriterien
  const searchProfiles = useCallback(async (searchTerm: string) => {
    const { data, error } = await supabase
      .from('guest_preferences')
      .select('*')
      .or(`guest_email.ilike.%${searchTerm}%,nationality.ilike.%${searchTerm}%`)
      .order('last_updated', { ascending: false });
    
    if (error) throw error;
    return data as GuestProfile[];
  }, []);

  return {
    // Data
    isGenerating,
    
    // Functions
    getGuestProfile,
    getAllProfiles,
    searchProfiles,
    
    // Mutations
    generateProfile: generateProfileMutation.mutateAsync,
    
    // States
    isGeneratingProfile: generateProfileMutation.isPending
  };
};