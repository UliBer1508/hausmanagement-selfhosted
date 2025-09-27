import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

export interface Activity {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  location: string;
  address?: string;
  coordinates?: any; // JSONB aus Supabase
  duration_minutes?: number;
  difficulty_level?: number;
  price_min?: number;
  price_max?: number;
  currency: string;
  season_availability?: string[];
  weather_dependent: boolean;
  group_size_min: number;
  group_size_max?: number;
  rating?: number;
  review_count: number;
  popularity_score: number;
  is_active: boolean;
  images?: string[];
  tags?: string[];
}

export interface ActivityRecommendation {
  id: string;
  guest_email: string;
  booking_id: string;
  activity_id: string;
  recommendation_score: number;
  reasoning: any; // JSONB aus Supabase
  personalized_description?: string;
  optimal_time_slot?: string;
  status: string;
  generated_at: string;
  expires_at?: string;
  activities: any; // Supabase joined data
}

export interface GuestProfile {
  guest_email: string;
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
}

export const useActivityRecommendations = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  // Hole alle verfügbaren Aktivitäten
  const {
    data: activities,
    isLoading: activitiesLoading,
    error: activitiesError
  } = useQuery({
    queryKey: ['activities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('is_active', true)
        .order('popularity_score', { ascending: false });
      
      if (error) throw error;
      return data;
    }
  });

  // Hole Empfehlungen für eine Buchung
  const getBookingRecommendations = useCallback(async (bookingId: string) => {
    const { data, error } = await supabase
      .from('activity_recommendations')
      .select(`
        *,
        activities (*)
      `)
      .eq('booking_id', bookingId)
      .eq('status', 'suggested')
      .order('recommendation_score', { ascending: false });
    
    if (error) throw error;
    return data as ActivityRecommendation[];
  }, []);

  // Hole Gäste-Profil
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

  // Generiere Empfehlungen für eine Buchung
  const generateRecommendationsMutation = useMutation({
    mutationFn: async ({ bookingId, regenerate = false }: { bookingId: string; regenerate?: boolean }) => {
      setIsGenerating(true);
      
      const { data, error } = await supabase.functions.invoke('generate-activity-recommendations', {
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
        title: "Aktivitäts-Empfehlungen generiert",
        description: `${data.recommendations?.length || 0} personalisierte Empfehlungen erstellt`,
      });
      queryClient.invalidateQueries({ queryKey: ['activity-recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['guest-preferences'] });
    },
    onError: (error: any) => {
      console.error('Failed to generate recommendations:', error);
      toast({
        title: "Empfehlungen fehlgeschlagen",
        description: "Aktivitäts-Empfehlungen konnten nicht generiert werden",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsGenerating(false);
    }
  });

  // Aktualisiere Empfehlungs-Status
  const updateRecommendationStatus = useMutation({
    mutationFn: async ({ recommendationId, status }: { recommendationId: string; status: string }) => {
      const { error } = await supabase
        .from('activity_recommendations')
        .update({ status })
        .eq('id', recommendationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-recommendations'] });
    },
    onError: (error: any) => {
      console.error('Failed to update recommendation status:', error);
      toast({
        title: "Update fehlgeschlagen",
        description: "Status konnte nicht aktualisiert werden",
        variant: "destructive",
      });
    }
  });

  // Buche eine Aktivität
  const bookActivityMutation = useMutation({
    mutationFn: async ({ 
      bookingId, 
      activityId, 
      scheduledDate, 
      scheduledTime, 
      participants,
      totalPrice 
    }: { 
      bookingId: string; 
      activityId: string; 
      scheduledDate: string;
      scheduledTime?: string;
      participants: number;
      totalPrice?: number;
    }) => {
      const { error } = await supabase
        .from('booking_activities')
        .insert({
          booking_id: bookingId,
          activity_id: activityId,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          participants,
          total_price: totalPrice,
          status: 'planned'
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Aktivität gebucht",
        description: "Die Aktivität wurde erfolgreich zu Ihrer Reise hinzugefügt",
      });
      queryClient.invalidateQueries({ queryKey: ['booking-activities'] });
      queryClient.invalidateQueries({ queryKey: ['activity-recommendations'] });
    },
    onError: (error: any) => {
      console.error('Failed to book activity:', error);
      toast({
        title: "Buchung fehlgeschlagen",
        description: "Die Aktivität konnte nicht gebucht werden",
        variant: "destructive",
      });
    }
  });

  return {
    // Data
    activities,
    activitiesLoading,
    activitiesError,
    isGenerating,
    
    // Functions
    getBookingRecommendations,
    getGuestProfile,
    
    // Mutations
    generateRecommendations: generateRecommendationsMutation.mutateAsync,
    updateRecommendationStatus: updateRecommendationStatus.mutateAsync,
    bookActivity: bookActivityMutation.mutateAsync,
    
    // States
    isGeneratingRecommendations: generateRecommendationsMutation.isPending,
    isUpdatingStatus: updateRecommendationStatus.isPending,
    isBookingActivity: bookActivityMutation.isPending
  };
};