import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Star, ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useRatingReminders, RatingReminder } from '@/hooks/useRatingReminders';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const RatingReminderBanner = () => {
  const navigate = useNavigate();
  const { reminders, marketingCandidates, otherReminders, totalCount, isLoading, settings, markAsNoRating, isMarkingNoRating } = useRatingReminders();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isHidden, setIsHidden] = useState(false);

  if (isLoading || totalCount === 0 || isHidden) {
    return null;
  }

  const getPlatformIcon = (platform: string | null) => {
    switch (platform?.toLowerCase()) {
      case 'airbnb': return '🏠';
      case 'booking.com': return '🅱️';
      case 'belvilla': return '🏡';
      case 'vrbo': return '🏘️';
      default: return '📝';
    }
  };

  const handleOpenBooking = (bookingId: string) => {
    // Navigate to bookings tab with the booking selected for editing
    navigate('/', { state: { activeTab: 'Buchungen', editBookingId: bookingId } });
  };

  const handleMarkAsNoRating = (bookingId: string, guestName: string) => {
    markAsNoRating(bookingId, {
      onSuccess: () => {
        toast.success(`"${guestName}" als "keine Bewertung" markiert`);
      },
      onError: () => {
        toast.error('Fehler beim Markieren');
      }
    });
  };

  const ReminderItem = ({ reminder, priority = false }: { reminder: RatingReminder; priority?: boolean }) => (
    <div className={`p-3 rounded-lg border ${priority ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800' : 'bg-muted/30 border-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{reminder.guest_name}</span>
            {reminder.platform && (
              <Badge variant="outline" className="text-xs">
                {getPlatformIcon(reminder.platform)} {reminder.platform}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {reminder.house_name}
            </Badge>
          </div>
          
          <div className="text-sm text-muted-foreground mt-1">
            Checkout vor {reminder.days_since_checkout} Tagen 
            ({format(new Date(reminder.check_out), 'dd.MM.yyyy', { locale: de })})
          </div>
          
          {priority && reminder.marketing_action_name && (
            <div className="flex items-center gap-1 mt-2 text-amber-700 dark:text-amber-400">
              <Star className="h-3.5 w-3.5 fill-current" />
              <span className="text-sm font-medium">
                Marketing: "{reminder.marketing_action_name}"
              </span>
              {reminder.number_of_children && reminder.number_of_children > 0 && (
                <span className="text-xs">
                  (Familie mit {reminder.number_of_children} Kind{reminder.number_of_children > 1 ? 'ern' : ''})
                </span>
              )}
              <span className="text-xs ml-1">⚠️ Bewertung für Auswertung benötigt!</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <Checkbox
              id={`no-rating-${reminder.id}`}
              disabled={isMarkingNoRating}
              onCheckedChange={(checked) => {
                if (checked) {
                  handleMarkAsNoRating(reminder.id, reminder.guest_name);
                }
              }}
            />
            <label 
              htmlFor={`no-rating-${reminder.id}`}
              className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
            >
              Keine Bewertung
            </label>
          </div>
          <Button
            size="sm"
            variant={priority ? "default" : "outline"}
            onClick={() => handleOpenBooking(reminder.id)}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Eintragen
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <CardTitle className="text-base font-semibold">
              Bewertungen nachtragen ({totalCount})
            </CardTitle>
            {marketingCandidates.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {marketingCandidates.length} Marketing-Priorität
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 px-2"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsHidden(true)}
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Buchungen ohne Bewertung ({settings.min_days_after_checkout}+ Tage nach Checkout)
        </p>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Marketing-Priorität */}
          {marketingCandidates.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Star className="h-4 w-4 fill-current" />
                <span className="text-sm font-medium">MARKETING-PRIORITÄT:</span>
              </div>
              <div className="space-y-2">
                {marketingCandidates.map(reminder => (
                  <ReminderItem key={reminder.id} reminder={reminder} priority />
                ))}
              </div>
            </div>
          )}

          {/* Weitere ausstehende */}
          {otherReminders.length > 0 && (
            <div className="space-y-2">
              {marketingCandidates.length > 0 && (
                <span className="text-sm font-medium text-muted-foreground">
                  WEITERE AUSSTEHENDE:
                </span>
              )}
              <div className="space-y-2">
                {otherReminders.slice(0, 5).map(reminder => (
                  <ReminderItem key={reminder.id} reminder={reminder} />
                ))}
                {otherReminders.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    + {otherReminders.length - 5} weitere...
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default RatingReminderBanner;
