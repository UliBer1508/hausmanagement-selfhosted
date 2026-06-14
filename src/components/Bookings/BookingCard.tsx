import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StickyNote } from 'lucide-react';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { de } from 'date-fns/locale';
import EditBookingDialog from './EditBookingDialog';
import { BookingWithHouse } from '@/types';
import { getGuestName } from '@/lib/guestHelpers';
import { useGuestStayCounts, getGuestCategory } from '@/hooks/useGuestStayCounts';
import NotesQuickDialog from '@/components/shared/NotesQuickDialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface BookingCardProps {
  booking: BookingWithHouse;
  colorVariant: 'green' | 'blue' | 'purple';
  onBookingUpdated?: () => void;
}

const BookingCard = ({ booking, colorVariant, onBookingUpdated }: BookingCardProps) => {
  const { data: stayCounts } = useGuestStayCounts();
  const category = getGuestCategory(stayCounts, booking.guest_email);
  const [editOpen, setEditOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSaveNotes = async (val: string) => {
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ notes: val || null })
        .eq('id', booking.id);
      if (error) throw error;
      (booking as any).notes = val || null;
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      onBookingUpdated?.();
      toast({ title: 'Notiz gespeichert' });
    } catch (err: any) {
      toast({ title: 'Fehler beim Speichern', description: err.message, variant: 'destructive' });
    } finally {
      setSavingNotes(false);
    }
  };

  const nights = differenceInCalendarDays(parseISO(booking.check_out), parseISO(booking.check_in));

  const categoryBadge =
    category === 'returning' ? (
      <Badge variant="default" className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0">Stammgast</Badge>
    ) : (
      <Badge variant="outline" className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0">Neuer Gast</Badge>
    );

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

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Bestätigt';
      case 'checked_in':
        return 'Eingecheckt';
      case 'completed':
        return 'Abgeschlossen';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'checked_in':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'completed':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return '';
    }
  };

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        aria-label={`Buchung von ${getGuestName(booking)} bearbeiten`}
        onClick={(e) => {
          if (!e.currentTarget.contains(e.target as Node)) return;
          setEditOpen(true);
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault();
            setEditOpen(true);
          }
        }}
        className={`border-l-4 ${getBorderColor(colorVariant)} bg-yellow-50 relative cursor-pointer hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden`}
      >
        {/* Kopfbalken */}
        <div
          className="flex items-center gap-2 px-3 py-2 text-white"
          style={{ background: 'linear-gradient(100deg,#d97706,#f59e0b)' }}
        >
          <div
            className="w-7 h-7 rounded-lg grid place-items-center text-[15px] shrink-0"
            style={{ background: 'rgba(255,255,255,.22)' }}
          >
            🗓️
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-wider opacity-90">
              Buchung · {booking.houses?.name || 'Unbekannt'}
            </div>
            <div className="text-[14px] font-extrabold leading-tight truncate">
              Reservierung
            </div>
          </div>
          <button
            type="button"
            aria-label="Notiz anzeigen/bearbeiten"
            onClick={(e) => {
              e.stopPropagation();
              setNotesOpen(true);
            }}
            className="relative grid place-items-center w-7 h-7 rounded-md bg-white/15 hover:bg-white/25 transition-colors shrink-0"
          >
            <StickyNote className="w-4 h-4" />
            {(booking as any).notes && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-300 border border-white" />
            )}
          </button>
          <span
            className="text-[10px] font-extrabold px-2 py-1 rounded-full bg-white/95 shrink-0"
            style={{ color: '#d97706' }}
          >
            {getStatusText(booking.status)}
          </span>
        </div>

        <CardContent className="p-3">
          <div className="space-y-2">
            {/* Guest Name */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base">{getGuestName(booking)}</h3>
              {stayCounts && categoryBadge}
            </div>

            {/* Dates side by side */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Check-in</span>
                <div>{format(parseISO(booking.check_in), 'dd.MM.yy', { locale: de })}</div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Check-out</span>
                <div>{format(parseISO(booking.check_out), 'dd.MM.yy', { locale: de })}</div>
              </div>
            </div>

            {/* Guests */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">👥</span>
              <span>
                {booking.number_of_guests}
                {nights > 0 && (
                  <span className="text-muted-foreground ml-1">({nights} N)</span>
                )}
                {booking.number_of_children !== undefined && booking.number_of_children > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({booking.number_of_adults ?? booking.number_of_guests} Erw., {booking.number_of_children} Ki.)
                  </span>
                )}
              </span>
            </div>

          </div>
        </CardContent>
      </Card>

      <EditBookingDialog
        booking={booking}
        onBookingUpdated={onBookingUpdated}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <NotesQuickDialog
        open={notesOpen}
        onOpenChange={setNotesOpen}
        title="Notiz"
        value={(booking as any).notes ?? ''}
        saving={savingNotes}
        onSave={handleSaveNotes}
      />
    </>
  );
};

export default BookingCard;
