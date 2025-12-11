import { Bell, Check, X, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGuestContactReminders } from '@/hooks/useGuestContactReminders';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

const GuestContactAlertBanner = () => {
  const { guestsToContact, isLoading, markAsContacted, markAsNotRequired, isUpdating } = useGuestContactReminders();
  const { toast } = useToast();

  if (isLoading || guestsToContact.length === 0) {
    return null;
  }

  const handleMarkContacted = (bookingId: string, guestName: string) => {
    markAsContacted(bookingId);
    toast({
      title: "✓ Als kontaktiert markiert",
      description: `${guestName} wurde als kontaktiert markiert.`,
    });
  };

  const handleMarkNotRequired = (bookingId: string, guestName: string) => {
    markAsNotRequired(bookingId);
    toast({
      title: "Kontakt nicht nötig",
      description: `${guestName} benötigt keinen Kontakt.`,
    });
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500 p-4 mb-6 rounded-lg shadow-sm">
      <div className="flex items-start gap-3">
        <Bell className="h-6 w-6 text-amber-600 dark:text-amber-400 animate-pulse flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-amber-800 dark:text-amber-200 text-lg">
            📞 {guestsToContact.length} {guestsToContact.length === 1 ? 'Gast' : 'Gäste'} vor Anreise kontaktieren
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Diese Gäste reisen in ca. 8 Tagen an und wurden noch nicht kontaktiert.
          </p>
          
          <div className="mt-4 space-y-3">
            {guestsToContact.map(booking => (
              <div 
                key={booking.id} 
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-background/50 p-3 rounded-lg border border-amber-200 dark:border-amber-800"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{booking.guest_name}</span>
                    <Badge variant="outline" className="text-xs">
                      {booking.houses?.name}
                    </Badge>
                    <Badge 
                      variant={booking.daysUntilCheckIn <= 7 ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      in {booking.daysUntilCheckIn} Tagen
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                    <span>
                      Check-in: {format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de })}
                    </span>
                    <span>
                      {booking.number_of_guests} {booking.number_of_guests === 1 ? 'Gast' : 'Gäste'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3 mt-2">
                    {booking.guest_email && (
                      <a 
                        href={`mailto:${booking.guest_email}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Mail className="h-3 w-3" />
                        {booking.guest_email}
                      </a>
                    )}
                    {booking.guest_phone && (
                      <a 
                        href={`tel:${booking.guest_phone}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {booking.guest_phone}
                      </a>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleMarkNotRequired(booking.id, booking.guest_name)}
                    disabled={isUpdating}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Nicht nötig
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleMarkContacted(booking.id, booking.guest_name)}
                    disabled={isUpdating}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Kontaktiert
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuestContactAlertBanner;
