import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Types
export interface GuestAppSession {
  id: string;
  session_id: string;
  booking_id: string | null;
  guest_email: string | null;
  guest_name: string | null;
  started_at: string;
  last_activity_at: string;
  user_agent: string | null;
  device_type: string | null;
  language: string | null;
  furthest_step: string | null;
  completed_onboarding: boolean | null;
  referrer: string | null;
  // Joined data
  booking_guest_name?: string;
  check_in?: string;
  check_out?: string;
  house_name?: string;
  house_id?: string;
}

export interface GuestAppEvent {
  id: string;
  session_id: string;
  booking_id: string | null;
  event_type: string;
  event_name: string;
  event_data: unknown;
  page_path: string | null;
  created_at: string;
}

export interface GuestPreference {
  id: string;
  preference_key: string;
  preference_value: unknown;
  preferred_language: string | null;
}

export interface GuestSavedActivity {
  id: string;
  guest_email: string;
  guest_name: string;
  activity_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  guest_notes: string | null;
  status: string | null;
  // Joined
  activity_name?: string;
  main_category?: string;
}

export interface AppReview {
  id: string;
  guest_email: string;
  guest_name: string | null;
  booking_id: string;
  rating: number;
  feedback_text: string | null;
  preferred_language: string | null;
  submitted_from_screen: string | null;
  created_at: string;
}

export interface GuestAppStats {
  totalSessions: number;
  identifiedGuests: number;
  completedOnboarding: number;
  averageRating: number | null;
}

export interface SessionFilters {
  timeRange: 'today' | '7days' | '30days' | 'all';
  houseId: string;
  status: 'all' | 'identified' | 'completed';
  excludeBots: boolean;
}

// Bot detection patterns
const BOT_PATTERNS = [
  'Chrome/119',      // Outdated Chrome bot
  'LikeWise',        // LikeWise Crawler
  'HeadlessChrome',  // Automated browsers
  /\bbot\b/i,        // Generic bot
  /\bcrawler\b/i,    // Web crawlers
  /\bspider\b/i,     // Search spiders
];

// Check if a user agent matches known bot patterns
export const isBot = (userAgent: string | null): boolean => {
  if (!userAgent) return false;
  
  return BOT_PATTERNS.some(pattern => {
    if (typeof pattern === 'string') {
      return userAgent.includes(pattern);
    }
    return pattern.test(userAgent);
  });
};

// Hook for sessions list
export const useGuestAppSessions = (filters: SessionFilters) => {
  return useQuery({
    queryKey: ['guest-app-sessions', filters],
    queryFn: async (): Promise<GuestAppSession[]> => {
      let query = supabase
        .from('guest_app_sessions')
        .select(`
          *,
          bookings:booking_id (
            guest_name,
            check_in,
            check_out,
            house_id,
            houses:house_id (
              name
            )
          )
        `)
        .order('last_activity_at', { ascending: false })
        .limit(100);

      // Time range filter
      if (filters.timeRange !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        if (filters.timeRange === 'today') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (filters.timeRange === '7days') {
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else {
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
        
        query = query.gte('started_at', startDate.toISOString());
      }

      // Status filter
      if (filters.status === 'identified') {
        query = query.not('guest_email', 'is', null);
      } else if (filters.status === 'completed') {
        query = query.eq('completed_onboarding', true);
      }

      const { data, error } = await query;
      
      if (error) throw error;

      // Transform data and apply house filter
      const sessions = (data || []).map((session: Record<string, unknown>) => {
        const booking = session.bookings as Record<string, unknown> | null;
        const house = booking?.houses as Record<string, string> | null;
        
        return {
          ...session,
          booking_guest_name: booking?.guest_name as string | undefined,
          check_in: booking?.check_in as string | undefined,
          check_out: booking?.check_out as string | undefined,
          house_id: booking?.house_id as string | undefined,
          house_name: house?.name,
        } as GuestAppSession;
      });

      // Bot filter (client-side)
      let filteredSessions = sessions;
      if (filters.excludeBots) {
        filteredSessions = filteredSessions.filter(s => !isBot(s.user_agent));
      }

      // House filter (client-side since it's a nested join)
      if (filters.houseId && filters.houseId !== 'all') {
        filteredSessions = filteredSessions.filter(s => s.house_id === filters.houseId);
      }

      return filteredSessions;
    },
  });
};

// Hook for session details
export const useGuestSessionDetails = (sessionId: string | null) => {
  // Events
  const eventsQuery = useQuery({
    queryKey: ['guest-app-events', sessionId],
    queryFn: async (): Promise<GuestAppEvent[]> => {
      if (!sessionId) return [];
      
      const { data, error } = await supabase
        .from('guest_app_events')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!sessionId,
  });

  // Preferences
  const preferencesQuery = useQuery({
    queryKey: ['guest-preferences', sessionId],
    queryFn: async (): Promise<GuestPreference[]> => {
      if (!sessionId) return [];
      
      const { data, error } = await supabase
        .from('guest_preference_responses')
        .select('id, preference_key, preference_value, preferred_language')
        .eq('session_id', sessionId);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!sessionId,
  });

  // Saved activities
  const activitiesQuery = useQuery({
    queryKey: ['guest-saved-activities', sessionId],
    queryFn: async (): Promise<GuestSavedActivity[]> => {
      if (!sessionId) return [];
      
      const { data, error } = await supabase
        .from('guest_saved_activities')
        .select(`
          *,
          alpine_activities:activity_id (
            name,
            main_category
          )
        `)
        .eq('session_id', sessionId)
        .order('scheduled_date', { ascending: true });
      
      if (error) throw error;
      
      return (data || []).map((item: Record<string, unknown>) => {
        const activity = item.alpine_activities as Record<string, string> | null;
        return {
          ...item,
          activity_name: activity?.name,
          main_category: activity?.main_category,
        } as GuestSavedActivity;
      });
    },
    enabled: !!sessionId,
  });

  // Review (via booking_id from session)
  const reviewQuery = useQuery({
    queryKey: ['guest-app-review', sessionId],
    queryFn: async (): Promise<AppReview | null> => {
      if (!sessionId) return null;
      
      // First get the session to find booking_id
      const { data: session } = await supabase
        .from('guest_app_sessions')
        .select('booking_id')
        .eq('session_id', sessionId)
        .maybeSingle();
      
      if (!session?.booking_id) return null;
      
      const { data, error } = await supabase
        .from('app_reviews')
        .select('*')
        .eq('booking_id', session.booking_id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!sessionId,
  });

  return {
    events: eventsQuery.data || [],
    preferences: preferencesQuery.data || [],
    activities: activitiesQuery.data || [],
    review: reviewQuery.data,
    isLoading: eventsQuery.isLoading || preferencesQuery.isLoading || activitiesQuery.isLoading || reviewQuery.isLoading,
  };
};

// Hook for aggregated stats
export const useGuestAppStats = (filters: SessionFilters) => {
  return useQuery({
    queryKey: ['guest-app-stats', filters],
    queryFn: async (): Promise<GuestAppStats> => {
      // Build time filter
      let timeFilter = '';
      if (filters.timeRange !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        if (filters.timeRange === 'today') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        } else if (filters.timeRange === '7days') {
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else {
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
        timeFilter = startDate.toISOString();
      }

      // Fetch all sessions with user_agent for bot filtering
      let sessionsQuery = supabase
        .from('guest_app_sessions')
        .select('user_agent, guest_email, completed_onboarding');
      
      if (timeFilter) {
        sessionsQuery = sessionsQuery.gte('started_at', timeFilter);
      }
      
      const { data: allSessions } = await sessionsQuery;
      
      // Apply bot filter client-side
      const sessions = filters.excludeBots 
        ? (allSessions || []).filter(s => !isBot(s.user_agent))
        : (allSessions || []);

      const totalSessions = sessions.length;
      const identifiedGuests = sessions.filter(s => s.guest_email !== null).length;
      const completedOnboarding = sessions.filter(s => s.completed_onboarding === true).length;

      // Average rating (not affected by bot filter)
      const { data: reviews } = await supabase
        .from('app_reviews')
        .select('rating');
      
      const averageRating = reviews && reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : null;

      return {
        totalSessions,
        identifiedGuests,
        completedOnboarding,
        averageRating: averageRating ? Math.round(averageRating * 10) / 10 : null,
      };
    },
  });
};
