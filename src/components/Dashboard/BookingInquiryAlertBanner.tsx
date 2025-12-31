import { Bell, Check, X, Calendar, Users, Home, Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBookingInquiries, BookingInquiry } from '@/hooks/useBookingInquiries';
import { format, differenceInDays } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const BookingInquiryAlertBanner = () => {
  const { 
    inquiries, 
    pendingCount,
    acceptInquiry,
    rejectInquiry,
    isAccepting,
    isRejecting 
  } = useBookingInquiries();

  if (pendingCount === 0) {
    return null;
  }

  const formatDateRange = (checkIn: string, checkOut: string) => {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const nights = differenceInDays(end, start);
    return `${format(start, 'dd.MM.yyyy', { locale: de })} - ${format(end, 'dd.MM.yyyy', { locale: de })} (${nights} ${nights === 1 ? 'Nacht' : 'Nächte'})`;
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500 p-4 mb-6 rounded-lg shadow-sm">
      <div className="flex items-start gap-3">
        <Bell className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-amber-800 dark:text-amber-200 text-base sm:text-lg">
              🔔 {pendingCount} neue Buchungsanfrage{pendingCount !== 1 ? 'n' : ''}
            </h3>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Über die Chalet-Analyse-App eingegangene Anfragen.
          </p>
          
          <div className="mt-4 space-y-3">
            {inquiries.map((inquiry: BookingInquiry) => (
              <div 
                key={inquiry.id} 
                className="bg-white dark:bg-background/50 p-4 rounded-lg border border-amber-200 dark:border-amber-800"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    {/* Gastname */}
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-foreground">
                        {inquiry.guest_name}
                      </span>
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        Neu
                      </Badge>
                    </div>
                    
                    {/* Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDateRange(inquiry.check_in, inquiry.check_out)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>{inquiry.number_of_guests} {inquiry.number_of_guests === 1 ? 'Gast' : 'Gäste'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Home className="h-4 w-4" />
                        <span>{inquiry.houses?.name || 'Unbekannt'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <span>{inquiry.guest_email}</span>
                      </div>
                      {inquiry.guest_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          <span>{inquiry.guest_phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Nachricht */}
                    {inquiry.message && (
                      <div className="mt-2 p-2 bg-muted/50 rounded text-sm italic">
                        "{inquiry.message}"
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-row lg:flex-col gap-2">
                    <Button
                      size="sm"
                      onClick={() => acceptInquiry(inquiry)}
                      disabled={isAccepting || isRejecting}
                      className="bg-green-600 hover:bg-green-700 text-white flex-1 lg:flex-none"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Zur Buchung
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isAccepting || isRejecting}
                          className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-950 flex-1 lg:flex-none"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Ablehnen
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Anfrage ablehnen?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Möchten Sie die Buchungsanfrage von <strong>{inquiry.guest_name}</strong> wirklich ablehnen? 
                            Diese Aktion kann nicht rückgängig gemacht werden.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => rejectInquiry(inquiry)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Ablehnen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingInquiryAlertBanner;
