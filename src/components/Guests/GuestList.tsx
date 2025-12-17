import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

import GuestDetailsDialog from './GuestDetailsDialog';
import GuestEmailDialog from './GuestEmailDialog';
import GuestEditDialog from './GuestEditDialog';

interface Guest {
  id?: string;
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
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const { toast } = useToast();

  const handleViewDetails = (guest: Guest) => {
    setSelectedGuest(guest);
    setShowDetailsDialog(true);
  };

  const handleContact = (guest: Guest) => {
    if (guest.guest_email) {
      setSelectedGuest(guest);
      setShowEmailDialog(true);
    } else if (guest.guest_phone) {
      window.open(`tel:${guest.guest_phone}`, '_blank');
    } else {
      toast({
        title: "Keine Kontaktdaten",
        description: "Für diesen Gast sind keine E-Mail oder Telefonnummer verfügbar.",
        variant: "destructive"
      });
    }
  };

  const handleEdit = (guest: Guest) => {
    setSelectedGuest(guest);
    setShowEditDialog(true);
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
              <div className="flex flex-col gap-4">
                {/* Header with name and badge */}
                <div className="flex flex-wrap items-center gap-2">
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

                {/* Buchungsliste */}
                <div className="space-y-2">
                  <h5 className="font-medium text-sm flex items-center gap-2">
                    <span>📋</span>
                    Buchungen ({guest.bookings.length})
                  </h5>
                  
                  <div className="space-y-1.5 pl-6">
                    {guest.bookings
                      .sort((a: any, b: any) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime())
                      .map((booking: any, idx: number) => {
                        const checkIn = format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de });
                        const checkOut = format(new Date(booking.check_out), 'dd.MM.yyyy', { locale: de });
                        const isCancelled = booking.status === 'cancelled';
                        
                        return (
                          <div 
                            key={booking.id || idx} 
                            className={cn(
                              "flex items-center justify-between gap-2 text-sm p-2 rounded",
                              isCancelled ? "bg-red-50 border border-red-200" : "bg-muted/30"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium truncate">
                                  {booking.houses?.name || 'Unbekanntes Haus'}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                  {checkIn} - {checkOut}
                                </span>
                              </div>
                              {booking.booking_amount && (
                                <span className="text-xs text-muted-foreground">
                                  €{booking.booking_amount.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                                </span>
                              )}
                            </div>
                            
                            {/* Status Badge */}
                            <div className="shrink-0">
                              {isCancelled ? (
                                <Badge 
                                  variant="destructive" 
                                  className="bg-red-500 text-white font-semibold"
                                >
                                  STORNIERT
                                </Badge>
                              ) : booking.status === 'confirmed' ? (
                                <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                                  Bestätigt
                                </Badge>
                              ) : booking.status === 'pending' ? (
                                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                                  Ausstehend
                                </Badge>
                              ) : (
                                <Badge variant="outline">
                                  {booking.status}
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Gesamt-Umsatz */}
                <div className="flex items-center gap-2 text-sm pt-2 border-t">
                  <span className="text-muted-foreground">Gesamt-Umsatz:</span>
                  <span className="font-medium">
                    €{guest.total_revenue.toLocaleString('de-DE', { minimumFractionDigits: 2 })}
                  </span>
                  {(() => {
                    const cancelledCount = guest.bookings.filter((b: any) => b.status === 'cancelled').length;
                    if (cancelledCount > 0) {
                      return (
                        <span className="text-xs text-muted-foreground">
                          (ohne {cancelledCount} stornierte)
                        </span>
                      );
                    }
                  })()}
                </div>

                {/* Contact info */}
                {(guest.guest_email || guest.guest_phone) && (
                  <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                    {guest.guest_email && (
                      <div className="flex items-center gap-2">
                        <span className="text-lg shrink-0">📧</span>
                        <span className="truncate">{guest.guest_email}</span>
                      </div>
                    )}
                    {guest.guest_phone && (
                      <div className="flex items-center gap-2">
                        <span className="text-lg shrink-0">📱</span>
                        <span>{guest.guest_phone}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons - responsive */}
                <div className="flex flex-wrap gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleContact(guest)}
                    disabled={!guest.guest_email && !guest.guest_phone}
                    className="flex-1 sm:flex-none"
                  >
                    <span className="mr-1">💬</span>
                    Kontakt
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleViewDetails(guest)}
                    className="flex-1 sm:flex-none"
                  >
                    <span className="mr-1">👁️</span>
                    Details
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleEdit(guest)}
                    className="flex-1 sm:flex-none"
                  >
                    <span className="mr-1">✏️</span>
                    Bearbeiten
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedGuest && (
        <>
          <GuestDetailsDialog
            guest={selectedGuest}
            open={showDetailsDialog}
            onOpenChange={setShowDetailsDialog}
          />
          <GuestEmailDialog
            guest={selectedGuest}
            open={showEmailDialog}
            onOpenChange={setShowEmailDialog}
          />
          <GuestEditDialog
            guest={selectedGuest}
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
          />
        </>
      )}
    </div>
  );
};

export default GuestList;