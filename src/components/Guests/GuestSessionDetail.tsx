import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Star } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { GuestAppSession, GuestAppEvent, GuestPreference, GuestSavedActivity, AppReview } from '@/hooks/useGuestAppTracking';

// Label mappings
const preferenceLabels: Record<string, string> = {
  activity_types: 'Aktivitäten',
  travel_companions: 'Reisegruppe',
  duration: 'Dauer',
  budget_range: 'Budget',
  activity_level: 'Aktivitätslevel',
  max_travel_time: 'Max. Anfahrt',
  weather_preference: 'Wetter',
  transport_mode: 'Transport',
  start_location: 'Startort',
  special_interests: 'Interessen',
};

const valueLabels: Record<string, string> = {
  // travel_companions
  'solo': 'Alleine',
  'couple': 'Paar',
  'family': 'Familie',
  'friends': 'Freunde',
  'group': 'Gruppe',
  // duration
  'half-day': 'Halbtags',
  'full-day': 'Ganztags',
  'multi-day': 'Mehrtägig',
  // budget_range
  'low': 'Günstig',
  'medium': 'Mittel',
  'high': 'Gehoben',
  // activity_level
  'relaxed': 'Entspannt',
  'moderate': 'Moderat',
  'active': 'Aktiv',
  'challenging': 'Anspruchsvoll',
  // activity_types
  'ski_touring': 'Skitouren',
  'hiking': 'Wandern',
  'skiing': 'Skifahren',
  'wellness': 'Wellness',
  'culture': 'Kultur',
  'gastronomy': 'Gastronomie',
  'nature': 'Natur',
  'adventure': 'Abenteuer',
  // weather
  'weather-independent': 'Wetterunabhängig',
  'good-weather': 'Bei gutem Wetter',
  // transport
  'flexible': 'Flexibel',
  'car': 'Auto',
  'public': 'Öffentlich',
};

const eventIcons: Record<string, string> = {
  'page_visit': '📍',
  'button_click': '🔘',
  'search': '🔍',
  'preference': '🎯',
  'activity': '💾',
  'event': '✅',
};

const preferenceIcons: Record<string, string> = {
  activity_types: '🎿',
  travel_companions: '👫',
  duration: '⏱️',
  budget_range: '💰',
  activity_level: '🏃',
  max_travel_time: '🚗',
  weather_preference: '🌤️',
  transport_mode: '🚌',
  start_location: '📍',
  special_interests: '⭐',
};

const categoryIcons: Record<string, string> = {
  'Winter': '⛷️',
  'Sommer': '🥾',
  'Ganzjährig': '🏔️',
  'Kultur': '🏛️',
  'Wellness': '🧖',
  'Gastronomie': '🍽️',
};

interface GuestSessionDetailProps {
  session: GuestAppSession;
  events: GuestAppEvent[];
  preferences: GuestPreference[];
  activities: GuestSavedActivity[];
  review: AppReview | null;
  isLoading: boolean;
  onBack: () => void;
}

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return valueLabels[value] || value;
  }
  if (typeof value === 'number') {
    return `${value} Min`;
  }
  if (Array.isArray(value)) {
    return value.map(v => valueLabels[v] || v).join(', ');
  }
  return String(value);
};

const getDeviceBadge = (deviceType: string | null) => {
  switch (deviceType) {
    case 'mobile':
      return '📱 Mobile';
    case 'tablet':
      return '📱 Tablet';
    default:
      return '💻 Desktop';
  }
};

const getLanguageFlag = (language: string | null) => {
  switch (language?.toLowerCase()) {
    case 'de':
      return '🇩🇪 Deutsch';
    case 'en':
      return '🇬🇧 English';
    default:
      return language || 'Unbekannt';
  }
};

export const GuestSessionDetail = ({
  session,
  events,
  preferences,
  activities,
  review,
  isLoading,
  onBack,
}: GuestSessionDetailProps) => {
  const guestName = session.guest_name || session.booking_guest_name || '[Anonym]';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Zurück zur Übersicht
        </Button>
      </div>

      {/* Guest Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{guestName}</CardTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            {session.guest_email && (
              <Badge variant="outline">{session.guest_email}</Badge>
            )}
            {session.house_name && (
              <Badge variant="secondary">{session.house_name}</Badge>
            )}
            <Badge variant="outline">{getDeviceBadge(session.device_type)}</Badge>
            <Badge variant="outline">{getLanguageFlag(session.language)}</Badge>
          </div>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* Preferences */}
          {preferences.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Präferenzen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {preferences.map((pref) => (
                    <div key={pref.id} className="flex items-start gap-2 text-sm">
                      <span>{preferenceIcons[pref.preference_key] || '📌'}</span>
                      <span className="text-muted-foreground">
                        {preferenceLabels[pref.preference_key] || pref.preference_key}:
                      </span>
                      <span className="font-medium">
                        {formatValue(pref.preference_value)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Saved Activities */}
          {activities.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Gespeicherte Aktivitäten ({activities.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded-md"
                    >
                      <span>
                        {categoryIcons[activity.main_category || ''] || '🎯'}
                      </span>
                      <span className="font-medium">
                        {activity.activity_name || 'Unbekannte Aktivität'}
                      </span>
                      <span className="text-muted-foreground">-</span>
                      <span className="text-muted-foreground">
                        {format(new Date(activity.scheduled_date), 'dd.MM.yyyy', { locale: de })}
                        {activity.scheduled_time && ` ${activity.scheduled_time.slice(0, 5)}`}
                      </span>
                      {activity.status && activity.status !== 'planned' && (
                        <Badge variant="outline" className="ml-auto text-xs">
                          {activity.status}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Event Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Event-Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 text-sm border-l-2 border-muted pl-3 py-1"
                    >
                      <span className="text-muted-foreground font-mono text-xs min-w-[45px]">
                        {format(new Date(event.created_at), 'HH:mm')}
                      </span>
                      <span>{eventIcons[event.event_type] || '📌'}</span>
                      <div className="flex-1">
                        <span className="font-medium capitalize">
                          {event.event_type.replace('_', ' ')}
                        </span>
                        {event.event_name && (
                          <span className="text-muted-foreground">
                            : {event.event_name}
                          </span>
                        )}
                        {event.page_path && event.event_type === 'page_visit' && (
                          <span className="text-muted-foreground ml-1">
                            ({event.page_path})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {events.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Keine Events gefunden
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Review */}
          {review && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">App-Bewertung</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-5 w-5 ${
                        i < review.rating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted'
                      }`}
                    />
                  ))}
                  <span className="text-muted-foreground ml-2">
                    ({review.rating}/5)
                  </span>
                </div>
                {review.feedback_text && (
                  <p className="text-sm italic text-muted-foreground">
                    "{review.feedback_text}"
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
