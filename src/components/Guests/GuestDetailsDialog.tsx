import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  Euro, 
  Home,
  MessageCircle,
  FileText
} from 'lucide-react';
import GuestEmailDialog from './GuestEmailDialog';

interface Guest {
  id?: string;
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  nationality?: string;
  guest_notes?: string;
  bookings: any[];
  total_revenue: number;
  last_booking?: any;
  next_booking?: any;
  stay_count: number;
  category: 'new' | 'returning';
}

interface GuestDetailsDialogProps {
  guest: Guest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GuestDetailsDialog = ({ guest, open, onOpenChange }: GuestDetailsDialogProps) => {
  const [showEmailDialog, setShowEmailDialog] = useState(false);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge variant="default" className="bg-green-100 text-green-800">Bestätigt</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Storniert</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800">Abgeschlossen</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'returning':
        return <Badge variant="default" className="bg-green-100 text-green-800">Stammgast</Badge>;
      default:
        return <Badge variant="outline" className="bg-blue-100 text-blue-800">Neuer Gast</Badge>;
    }
  };

  const handleContact = () => {
    if (guest.guest_email) {
      setShowEmailDialog(true);
    } else if (guest.guest_phone) {
      window.open(`tel:${guest.guest_phone}`, '_blank');
    }
  };

  const totalStayDays = guest.bookings.reduce((total, booking) => {
    const checkIn = new Date(booking.check_in);
    const checkOut = new Date(booking.check_out);
    const days = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    return total + days;
  }, 0);

  const avgStayDuration = guest.bookings.length > 0 ? Math.round(totalStayDays / guest.bookings.length) : 0;
  const avgBookingValue = guest.bookings.length > 0 ? guest.total_revenue / guest.bookings.length : 0;

  // Sort bookings by date
  const sortedBookings = [...guest.bookings].sort((a, b) => 
    new Date(b.check_in).getTime() - new Date(a.check_in).getTime()
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <User className="w-5 h-5" />
            {guest.guest_name}
            {getCategoryBadge(guest.category)}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Detaillierte Übersicht über Buchungshistorie und Gastprofil
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Guest Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Gast-Informationen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{guest.guest_name}</span>
                {guest.nationality && (
                  <Badge variant="outline" className="ml-auto">
                    {guest.nationality.toUpperCase()}
                  </Badge>
                )}
              </div>

              {guest.guest_email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{guest.guest_email}</span>
                </div>
              )}

              {guest.guest_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{guest.guest_phone}</span>
                </div>
              )}

              {guest.guest_notes && (
                <div className="pt-3 border-t">
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium mb-1">Notizen & Vorlieben</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{guest.guest_notes}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4">
                <Button 
                  onClick={handleContact}
                  disabled={!guest.guest_email && !guest.guest_phone}
                  className="w-full"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Kontakt aufnehmen
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Statistiken</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Buchungen</span>
                </div>
                <span className="font-medium">{guest.stay_count}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Euro className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Gesamtumsatz</span>
                </div>
                <span className="font-medium">€{guest.total_revenue.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Euro className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Ø Buchungswert</span>
                </div>
                <span className="font-medium">€{avgBookingValue.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Ø Aufenthalt</span>
                </div>
                <span className="font-medium">{avgStayDuration} Tage</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Gesamt Tage</span>
                </div>
                <span className="font-medium">{totalStayDays} Tage</span>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Letzte Aktivität</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {guest.last_booking && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Letzter Aufenthalt</p>
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-1 mb-1">
                      <MapPin className="w-3 h-3" />
                      {guest.last_booking.houses?.name}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(guest.last_booking.check_in), 'dd.MM.yyyy', { locale: de })} - 
                      {format(new Date(guest.last_booking.check_out), 'dd.MM.yyyy', { locale: de })}
                    </div>
                  </div>
                </div>
              )}

              {guest.next_booking && (
                <div className="space-y-2 pt-3 border-t">
                  <p className="text-sm font-medium">Nächster Aufenthalt</p>
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-1 mb-1">
                      <MapPin className="w-3 h-3" />
                      {guest.next_booking.houses?.name}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(guest.next_booking.check_in), 'dd.MM.yyyy', { locale: de })} - 
                      {format(new Date(guest.next_booking.check_out), 'dd.MM.yyyy', { locale: de })}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Booking History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Buchungshistorie ({guest.bookings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedBookings.map((booking, index) => (
                <div key={booking.id || index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{booking.houses?.name}</span>
                      {getStatusBadge(booking.status)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de })} - 
                      {format(new Date(booking.check_out), 'dd.MM.yyyy', { locale: de })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {booking.number_of_guests} Gäste
                      {booking.booking_amount && (
                        <span className="ml-3">€{booking.booking_amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                      )}
                    </div>
                    {booking.status === 'cancelled' && (booking.cancellation_date || booking.cancellation_reason || booking.cancelled_by) && (
                      <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
                        <div className="font-medium text-destructive mb-1">Stornierungsinformationen:</div>
                        {booking.cancellation_date && (
                          <div>Storniert am: {format(new Date(booking.cancellation_date), 'dd.MM.yyyy HH:mm', { locale: de })}</div>
                        )}
                        {booking.cancelled_by && (
                          <div>Storniert durch: {booking.cancelled_by}</div>
                        )}
                        {booking.cancellation_reason && (
                          <div>Grund: {booking.cancellation_reason}</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground ml-4">
                    {Math.ceil((new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / (1000 * 60 * 60 * 24))} Tage
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </DialogContent>

      {/* Email Dialog */}
      <GuestEmailDialog
        guest={guest}
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
      />
    </Dialog>
  );
};

export default GuestDetailsDialog;