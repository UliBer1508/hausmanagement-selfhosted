import { useState } from 'react';
import { Bell, Check, X, Calendar, Users, Home, Mail, Phone, Euro } from 'lucide-react';
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
import CreateBookingDialog, { BookingPrefillData } from '@/components/Bookings/CreateBookingDialog';
import GuestEmailDialog from '@/components/Guests/GuestEmailDialog';

const BookingInquiryAlertBanner = () => {
  const { 
    inquiries, 
    pendingCount,
    rejectInquiry,
    isRejecting 
  } = useBookingInquiries();

  // State for booking dialog
  const [selectedInquiry, setSelectedInquiry] = useState<BookingInquiry | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);

  // State for email dialog after rejection
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [rejectedInquiry, setRejectedInquiry] = useState<BookingInquiry | null>(null);

  // State for email dialog after confirmation
  const [showConfirmEmailDialog, setShowConfirmEmailDialog] = useState(false);
  const [confirmedInquiry, setConfirmedInquiry] = useState<BookingInquiry | null>(null);
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | undefined>(undefined);

  const formatDateRange = (checkIn: string, checkOut: string) => {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const nights = differenceInDays(end, start);
    return `${format(start, 'dd.MM.yyyy', { locale: de })} - ${format(end, 'dd.MM.yyyy', { locale: de })} (${nights} ${nights === 1 ? 'Nacht' : 'Nächte'})`;
  };

  const handleAcceptClick = (inquiry: BookingInquiry) => {
    setSelectedInquiry(inquiry);
    setShowBookingDialog(true);
  };

  const handleBookingCreated = (bookingId?: string) => {
    // After booking created, show confirmation email dialog
    if (selectedInquiry) {
      setConfirmedInquiry(selectedInquiry);
      setConfirmedBookingId(bookingId);
      setShowConfirmEmailDialog(true);
    }
    setShowBookingDialog(false);
    setSelectedInquiry(null);
  };

  const handleRejectClick = async (inquiry: BookingInquiry) => {
    // First reject (which saves guest data)
    await rejectInquiry(inquiry);
    // Then show email dialog
    setRejectedInquiry(inquiry);
    setShowEmailDialog(true);
  };

  // Create prefill data for booking dialog
  const getPrefillData = (inquiry: BookingInquiry): BookingPrefillData => ({
    house_id: inquiry.house_id,
    guest_name: inquiry.guest_name,
    guest_email: inquiry.guest_email,
    guest_phone: inquiry.guest_phone || undefined,
    check_in: new Date(inquiry.check_in),
    check_out: new Date(inquiry.check_out),
    number_of_guests: inquiry.number_of_guests,
    number_of_adults: inquiry.number_of_adults ?? inquiry.number_of_guests,
    number_of_children: inquiry.number_of_children ?? 0,
    booking_amount: inquiry.estimated_amount ?? undefined,
    notes: inquiry.message || undefined,
    inquiry_id: inquiry.id,
  });

  // Email dialog for rejection - extracted so it can render even when pendingCount is 0
  const rejectionEmailDialog = rejectedInquiry && (
    <GuestEmailDialog
      guest={{
        guest_name: rejectedInquiry.guest_name,
        guest_email: rejectedInquiry.guest_email,
        guest_phone: rejectedInquiry.guest_phone,
      }}
      open={showEmailDialog}
      onOpenChange={(open) => {
        setShowEmailDialog(open);
        if (!open) setRejectedInquiry(null);
      }}
      defaultTemplate="inquiry_rejected"
      templatePlaceholders={{
        checkIn: format(new Date(rejectedInquiry.check_in), 'dd.MM.yyyy', { locale: de }),
        checkOut: format(new Date(rejectedInquiry.check_out), 'dd.MM.yyyy', { locale: de }),
        houseName: rejectedInquiry.houses?.name || '',
      }}
    />
  );

  // Email dialog for confirmation - extracted so it can render even when pendingCount is 0
  const confirmationEmailDialog = confirmedInquiry && (
    <GuestEmailDialog
      guest={{
        guest_name: confirmedInquiry.guest_name,
        guest_email: confirmedInquiry.guest_email,
        guest_phone: confirmedInquiry.guest_phone,
      }}
      open={showConfirmEmailDialog}
      onOpenChange={(open) => {
        setShowConfirmEmailDialog(open);
        if (!open) {
          setConfirmedInquiry(null);
          setConfirmedBookingId(undefined);
        }
      }}
      defaultTemplate="inquiry_confirmed"
      bookingId={confirmedBookingId}
      templatePlaceholders={{
        checkIn: format(new Date(confirmedInquiry.check_in), 'dd.MM.yyyy', { locale: de }),
        checkOut: format(new Date(confirmedInquiry.check_out), 'dd.MM.yyyy', { locale: de }),
        houseName: confirmedInquiry.houses?.name || '',
        guestName: confirmedInquiry.guest_name,
      }}
    />
  );

  // If no pending inquiries, only render active email dialogs
  if (pendingCount === 0) {
    if ((showEmailDialog && rejectedInquiry) || (showConfirmEmailDialog && confirmedInquiry)) {
      return (
        <>
          {rejectionEmailDialog}
          {confirmationEmailDialog}
        </>
      );
    }
    return null;
  }

  return (
    <>
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
                          <span>
                            {inquiry.number_of_adults ?? inquiry.number_of_guests} Erwachsene
                            {(inquiry.number_of_children ?? 0) > 0 && (
                              <span className="ml-1">+ {inquiry.number_of_children} Kinder</span>
                            )}
                          </span>
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
                        {inquiry.estimated_amount != null && inquiry.estimated_amount > 0 && (
                          <div className="flex items-center gap-2">
                            <Euro className="h-4 w-4" />
                            <span>{inquiry.estimated_amount.toLocaleString('de-DE')} EUR</span>
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
                        onClick={() => handleAcceptClick(inquiry)}
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
                            disabled={isRejecting}
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
                              Die Gastdaten werden gespeichert und Sie können dem Gast eine E-Mail senden.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRejectClick(inquiry)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Ablehnen & E-Mail senden
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

      {/* Booking Dialog (controlled) */}
      {selectedInquiry && (
        <CreateBookingDialog
          open={showBookingDialog}
          onOpenChange={(open) => {
            setShowBookingDialog(open);
            if (!open) setSelectedInquiry(null);
          }}
          prefillData={getPrefillData(selectedInquiry)}
          onBookingCreated={handleBookingCreated}
        />
      )}

      {/* Email Dialogs */}
      {rejectionEmailDialog}
      {confirmationEmailDialog}
    </>
  );
};

export default BookingInquiryAlertBanner;
