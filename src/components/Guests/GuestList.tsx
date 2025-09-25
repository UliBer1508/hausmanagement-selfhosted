import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { MessageCircle, Eye, Edit, Home, Calendar, User, Phone, Mail } from 'lucide-react';
import GuestDetailsDialog from './GuestDetailsDialog';

interface Guest {
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  nationality?: string;
  bookings: any[];
  total_revenue: number;
  last_booking?: any;
  next_booking?: any;
  stay_count: number;
  category: 'new' | 'returning';
}

interface GuestListProps {
  guests: Guest[];
  isLoading: boolean;
}

const GuestList = ({ guests, isLoading }: GuestListProps) => {
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const { toast } = useToast();

  const handleViewDetails = (guest: Guest) => {
    setSelectedGuest(guest);
    setShowDetailsDialog(true);
  };

  const handleContact = (guest: Guest) => {
    if (guest.guest_email) {
      window.open(`mailto:${guest.guest_email}`, '_blank');
    } else if (guest.guest_phone) {
      window.open(`tel:${guest.guest_phone}`, '_blank');
    }
  };

  const handleEdit = (guest: Guest) => {
    // Edit functionality to be implemented
    toast({
      title: "Feature coming soon",
      description: `Edit functionality for ${guest.guest_name} will be available in the next update.`,
    });
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'returning':
        return <Badge variant="default" className="bg-green-100 text-green-800">Stammgast</Badge>;
      default:
        return <Badge variant="outline" className="bg-blue-100 text-blue-800">Neuer Gast</Badge>;
    }
  };

  const getCountryCode = (nationality?: string) => {
    if (!nationality) return '';
    return nationality.length === 2 ? nationality.toUpperCase() : '';
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Gäste-Liste (--)</h3>
        <div className="text-center py-8 text-muted-foreground">
          Lädt Gästedaten...
        </div>
      </div>
    );
  }

  if (!guests || guests.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Gäste-Liste (0)</h3>
        <div className="text-center py-8 text-muted-foreground">
          Keine Gäste gefunden.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Gäste-Liste ({guests.length})</h3>
      <p className="text-sm text-muted-foreground">Übersicht aller Gäste mit Buchungshistorie</p>
      
      <div className="space-y-3">
        {guests.map((guest, index) => (
          <Card key={`${guest.guest_name}-${index}`} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-3">
                    <h4 className="font-semibold text-lg">
                      {guest.guest_name}
                      {getCountryCode(guest.nationality) && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          ({getCountryCode(guest.nationality)})
                        </span>
                      )}
                    </h4>
                    {getCategoryBadge(guest.category)}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-muted-foreground" />
                      <span>
                        <span className="font-medium">{guest.stay_count}</span> Buchungen
                      </span>
                    </div>

                    {guest.last_booking && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>
                          Letztes: <span className="font-medium">{guest.last_booking.houses?.name}</span>
                        </span>
                      </div>
                    )}

                    {guest.next_booking && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>
                          Nächstes: {format(new Date(guest.next_booking.check_in), 'dd.MM.yyyy', { locale: de })}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Umsatz:</span>
                      <span className="font-medium">€{guest.total_revenue.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {(guest.guest_email || guest.guest_phone) && (
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {guest.guest_email && (
                        <div className="flex items-center gap-1">
                          <Mail className="w-4 h-4" />
                          <span>{guest.guest_email}</span>
                        </div>
                      )}
                      {guest.guest_phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          <span>{guest.guest_phone}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleContact(guest)}
                    disabled={!guest.guest_email && !guest.guest_phone}
                  >
                    <MessageCircle className="w-4 h-4 mr-1" />
                    Kontakt
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleViewDetails(guest)}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Details
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleEdit(guest)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Bearbeiten
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedGuest && (
        <GuestDetailsDialog
          guest={selectedGuest}
          open={showDetailsDialog}
          onOpenChange={setShowDetailsDialog}
        />
      )}
    </div>
  );
};

export default GuestList;