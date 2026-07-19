import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StickyNote, ShieldCheck, ShieldAlert } from 'lucide-react';
import { parseISO, differenceInCalendarDays } from 'date-fns';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import EditBookingDialog from './EditBookingDialog';
import { BookingWithHouse } from '@/types';
import { getGuestName } from '@/lib/guestHelpers';
import { useGuestStayCounts, getGuestCategory } from '@/hooks/useGuestStayCounts';
import NotesQuickDialog from '@/components/shared/NotesQuickDialog';
import ChangedByLine from '@/components/shared/ChangedByLine';
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

  // ---- Portal-Prüfung bei Direktbuchungen --------------------------------
  //
  // WARUM ES DIESES HÄKCHEN GIBT (siehe docs/Konzept-iCal-Kollisionswarnung.md
  // Abschnitt 8.10): Direktbuchungen gehen über ical-export an Airbnb,
  // Booking.com und VRBO, und die blocken sie auch. Über ihren eigenen
  // iCal-Export geben die Portale importierte Blocks aber NICHT zurück — jedes
  // Portal exportiert nur seine eigenen Buchungen.
  //
  // Belegt am 19.07.2026: Die Direktbuchung "Luca" war in allen drei
  // Portal-Kalendern sichtbar geblockt und tauchte in KEINEM Portal-Feed auf.
  // Eine automatische Prüfung ist damit unmöglich — deshalb quittiert Uli hier
  // von Hand, und Max erinnert daran, bis das geschehen ist.
  const istDirektbuchung = !booking.platform || booking.platform === 'direct';
  const geprueftAm = (booking as any).portale_geprueft_am as string | null;
  const istStorniert = booking.status === 'cancelled';
  const [speicherePortale, setSpeicherePortale] = useState(false);

  const handlePortaleGeprueft = async () => {
    setSpeicherePortale(true);
    try {
      const jetzt = new Date().toISOString();
      const { error } = await supabase
        .from('bookings')
        .update({
          portale_geprueft_am: jetzt,
          portale_geprueft_von: 'Uli',
          // Merkt, WOFÜR quittiert wurde. Nach einem Storno setzt der
          // DB-Trigger trg_reset_portale_geprueft alles zurück, damit die
          // Gegenrichtung (Blockade zurücknehmen) erneut erinnert wird.
          portale_geprueft_art: istStorniert ? 'freigegeben' : 'blockiert',
        })
        .eq('id', booking.id);
      if (error) throw error;
      (booking as any).portale_geprueft_am = jetzt;
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      onBookingUpdated?.();
      toast({ title: istStorniert ? 'Freigabe bestätigt' : 'Portal-Blockade bestätigt' });
    } catch (err: any) {
      toast({ title: 'Fehler beim Speichern', description: err.message, variant: 'destructive' });
    } finally {
      setSpeicherePortale(false);
    }
  };

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
        className={`border-l-4 ${getBorderColor(colorVariant)} bg-yellow-50 relative cursor-pointer hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden flex flex-col h-full`}
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

        <CardContent className="p-3 flex-1 flex flex-col">
          <div className="space-y-2 flex-1 flex flex-col min-h-[150px]">
            {/* Guest name + count */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold">{getGuestName(booking)}</h3>
              <span className="text-sm font-bold">
                {booking.number_of_guests} {booking.number_of_guests === 1 ? 'Gast' : 'Gäste'}
                {nights > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">({nights} N)</span>
                )}
                {booking.number_of_children !== undefined && booking.number_of_children > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    ({booking.number_of_adults ?? booking.number_of_guests} Erw., {booking.number_of_children} Ki.)
                  </span>
                )}
              </span>
              {stayCounts && categoryBadge}
              {(booking as any).booked_guests != null &&
                (booking as any).booked_guests < booking.number_of_guests && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                  ⚠️ gebucht {(booking as any).booked_guests} → {booking.number_of_guests}
                  {(booking as any).guest_surcharge_amount
                    ? ` · +${Number((booking as any).guest_surcharge_amount).toLocaleString('de-DE')} €`
                    : ''}
                </span>
              )}
            </div>

            {/* Felder-Raster: Chalet, Check-in, Check-out */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Chalet</div>
                <div className="text-sm truncate">{booking.houses?.name || 'Unbekannt'}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Check-in</div>
                <div className="text-sm truncate">{format(parseISO(booking.check_in), 'dd.MM.yy', { locale: de })}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Check-out</div>
                <div className="text-sm truncate">{format(parseISO(booking.check_out), 'dd.MM.yy', { locale: de })}</div>
              </div>
            </div>

            {/* Portal-Prüfung — nur bei Direktbuchungen (siehe Kommentar oben) */}
            {istDirektbuchung && (
              geprueftAm ? (
                <div className="flex items-center gap-1.5 text-[11px] text-green-700 pt-2">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Portale geprüft am {format(parseISO(geprueftAm), 'dd.MM.yy', { locale: de })}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 mt-2">
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-800">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>
                      {istStorniert
                        ? 'Storniert — Blockade in Airbnb, Booking.com und VRBO zurücknehmen.'
                        : 'Direktbuchung — in Airbnb, Booking.com und VRBO als geblockt prüfen.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={speicherePortale}
                    onClick={(e) => {
                      // Verhindert, dass der Klick die Karte öffnet.
                      e.stopPropagation();
                      handlePortaleGeprueft();
                    }}
                    className="self-start text-[11px] font-medium px-2 py-1 rounded border border-amber-400 bg-white hover:bg-amber-100 disabled:opacity-50"
                  >
                    {speicherePortale
                      ? 'Speichert…'
                      : istStorniert ? 'Freigabe bestätigen' : 'Geprüft — ist geblockt'}
                  </button>
                </div>
              )
            )}

            {/* Einheitliche "Geändert von"-Zeile (mit Datum aus updated_at) */}
            <ChangedByLine
              by={(booking as any).status_changed_by}
              at={(booking as any).updated_at}
              className="mt-auto pt-2"
            />
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
