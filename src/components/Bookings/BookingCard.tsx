import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

interface BookingCardProps {
  booking: any;
  colorVariant: 'green' | 'blue' | 'purple';
}

const BookingCard = ({ booking, colorVariant }: BookingCardProps) => {
  const getBorderColor = (variant: string) => {
    switch (variant) {
      case 'green':
        return 'border-l-green-500';
      case 'blue':
        return 'border-l-blue-500';
      case 'purple':
        return 'border-l-purple-500';
      default:
        return 'border-l-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Bestätigt</Badge>;
      case 'checked_in':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Eingecheckt</Badge>;
      case 'completed':
        return <Badge className="bg-gray-100 text-gray-800 border-gray-300">Abgeschlossen</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className={`border-l-4 ${getBorderColor(colorVariant)} bg-yellow-50 relative`}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Guest Name */}
          <div>
            <h3 className="font-semibold text-lg">{booking.guest_name}</h3>
            <p className="text-sm text-muted-foreground">{booking.houses?.name}</p>
          </div>

          {/* Dates */}
          <div className="text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-in:</span>
              <span>{format(parseISO(booking.check_in), "dd.MM.yyyy", { locale: de })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-out:</span>
              <span>{format(parseISO(booking.check_out), "dd.MM.yyyy", { locale: de })}</span>
            </div>
          </div>

          {/* Guests and Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{booking.number_of_guests}</span>
            </div>
            {getStatusBadge(booking.status)}
          </div>
        </div>

        {/* Edit Button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-8 w-8 p-0"
        >
          <Edit className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
};

export default BookingCard;