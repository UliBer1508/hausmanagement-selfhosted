import { useState } from 'react';
import { CardContent } from '@/components/ui/card';
import { ClickableCard } from '@/components/ui/clickable-card';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import EditBookingDialog from './EditBookingDialog';
import { BookingWithHouse } from '@/types';
import { getGuestName } from '@/lib/guestHelpers';
import { useGuestStayCounts, getGuestCategory } from '@/hooks/useGuestStayCounts';

interface BookingCardProps {
  booking: BookingWithHouse;
  colorVariant: 'green' | 'blue' | 'purple';
  onBookingUpdated?: () => void;
}

const BookingCard = ({ booking, colorVariant, onBookingUpdated }: BookingCardProps) => {
  const { data: stayCounts } = useGuestStayCounts();
  const category = getGuestCategory(stayCounts, booking.guest_email);
  const [editOpen, setEditOpen] = useState(false);

  const categoryBadge =
    category === 'returning' ? (
      <Badge variant="default" className="bg-green-100 text-green-800">Stammgast</Badge>
    ) : (
      <Badge variant="outline" className="bg-blue-100 text-blue-800">Neuer Gast</Badge>
    );

  const getDotColor = (variant: string) => {
    switch (variant) {
      case 'green':
        return 'bg-green-500';
      case 'blue':
        return 'bg-blue-500';
      case 'purple':
        return 'bg-purple-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-100 text-green-800 border-green-300">✅ Bestätigt</Badge>;
      case 'checked_in':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">🏠 Eingecheckt</Badge>;
      case 'completed':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300">✔️ Abgeschlossen</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ClickableCard
      aria-label={`Buchung von ${getGuestName(booking)} bearbeiten`}
      onActivate={() => setEditOpen(true)}
      className="relative bg-card"
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Guest Name */}
          <div>
            <div className="flex items-center gap-2 flex-wrap pr-10">
              <span className={`h-2 w-2 rounded-full ${getDotColor(colorVariant)}`} aria-hidden />
              <h3 className="font-semibold text-lg">{getGuestName(booking)}</h3>
              {stayCounts && categoryBadge}
            </div>
            <p className="text-sm text-muted-foreground">{booking.houses?.name}</p>
          </div>

          {/* Dates */}
          <div className="text-sm space-y-1">
            <div className="flex gap-1">
              <span className="text-muted-foreground">📅 Check-in:</span>
              <span>{format(parseISO(booking.check_in), "dd.MM.yyyy", { locale: de })}</span>
            </div>
            <div className="flex gap-1">
              <span className="text-muted-foreground">📅 Check-out:</span>
              <span>{format(parseISO(booking.check_out), "dd.MM.yyyy", { locale: de })}</span>
            </div>
          </div>

          {/* Guests */}
          <div className="flex items-center gap-2">
            <span className="text-base">👥</span>
            <span className="text-sm">
              {booking.number_of_guests}
              {(booking.number_of_children !== undefined && booking.number_of_children > 0) && (
                <span className="text-muted-foreground ml-1">
                  ({booking.number_of_adults ?? booking.number_of_guests} Erw., {booking.number_of_children} Ki.)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Status Badge - Bottom Right */}
        <div className="absolute bottom-2 right-2">
          {getStatusBadge(booking.status)}
        </div>

        {/* Edit Dialog (controlled, no visible trigger) */}
        <EditBookingDialog
          booking={booking}
          onBookingUpdated={onBookingUpdated}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      </CardContent>
    </ClickableCard>
  );
};

export default BookingCard;