import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Calendar, MapPin, Users } from 'lucide-react';
import { Booking, House } from '@/types';

interface RecentBookingsProps {
  bookings: Booking[];
  houses: House[];
}

const RecentBookings = ({ bookings, houses }: RecentBookingsProps) => {
  const getHouseById = (houseId: string) => {
    return houses.find(house => house.id === houseId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-primary-green/20 text-primary-green';
      case 'checked-in':
        return 'bg-primary-blue/20 text-primary-blue';
      case 'checked-out':
        return 'bg-muted/50 text-muted-foreground';
      default:
        return 'bg-muted/50 text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Bestätigt';
      case 'checked-in':
        return 'Eingecheckt';
      case 'checked-out':
        return 'Ausgecheckt';
      default:
        return status;
    }
  };

  return (
    <Card className="card-glow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Aktuelle Buchungen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {bookings.map((booking) => {
          const house = getHouseById(booking.house_id || '');
          const initials = booking.guest_name?.split(' ').map(n => n[0]).join('') || 'G';
          
          return (
            <div key={booking.id} className="flex items-center gap-4 p-4 rounded-lg bg-accent/30 hover:bg-accent/50 transition-all duration-200 group">
              <Avatar className="w-12 h-12 group-hover:scale-110 transition-transform duration-200">
                <AvatarFallback className="bg-gradient-to-br from-primary-blue to-primary-purple text-white font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-foreground">{booking.guest_name}</h4>
                  <Badge className={getStatusColor(booking.status || 'confirmed')}>
                    {getStatusText(booking.status || 'confirmed')}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {house?.name || 'Unbekanntes Haus'}
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {booking.guest_count} Gäste
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  {new Date(booking.check_in).toLocaleDateString('de-DE')} - {new Date(booking.check_out).toLocaleDateString('de-DE')}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default RecentBookings;