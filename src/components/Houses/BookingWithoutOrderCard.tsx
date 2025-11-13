import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, Package } from "lucide-react";

interface BookingWithoutOrderCardProps {
  booking: {
    booking_id: string;
    guest_name: string;
    check_in: string;
    check_out: string;
    number_of_guests: number;
    days_until_checkin: number;
    urgency: 'urgent' | 'normal';
  };
  onCreateOrder: (bookingId: string) => void;
  isCreating: boolean;
}

export const BookingWithoutOrderCard = ({ 
  booking, 
  onCreateOrder, 
  isCreating 
}: BookingWithoutOrderCardProps) => {
  const borderColor = booking.urgency === 'urgent' ? 'border-destructive' : 'border-orange-500';
  
  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">{booking.guest_name}</h3>
            <p className="text-sm text-muted-foreground">
              Check-in: {format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de })}
              {' '}({booking.days_until_checkin} Tage)
            </p>
            <p className="text-sm">{booking.number_of_guests} Gäste</p>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-muted">
              offen
            </Badge>
            
            {booking.urgency === 'urgent' && (
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />
                DRINGEND
              </Badge>
            )}
          </div>
        </div>
        
        <Button
          className="w-full"
          onClick={() => onCreateOrder(booking.booking_id)}
          disabled={isCreating}
        >
          <Package className="h-4 w-4 mr-2" />
          {isCreating ? 'Erstelle Bestellung...' : 'Bestellung erstellen'}
        </Button>
      </CardContent>
    </Card>
  );
};
