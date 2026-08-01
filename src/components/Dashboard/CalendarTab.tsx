import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { format, addMonths, subMonths, addYears, subYears, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import BookingTimeline from '@/components/Calendar/BookingTimeline';
import HouseStackedCalendar from '@/components/Calendar/HouseStackedCalendar';

interface CalendarTabProps {
  bookingsData: any[] | undefined;
  housesData: any[] | undefined;
  serviceTasks: any[] | undefined;
  linenOrders: any[] | undefined;
}

type CalendarView = 'year' | 'month' | 'timeline';

export const CalendarTab: React.FC<CalendarTabProps> = ({
  bookingsData,
  housesData,
  serviceTasks,
  linenOrders,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarView, setCalendarView] = useState<CalendarView>('year');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // Gemeinsame Klick-Handler — von Monatsansicht UND Timeline genutzt, damit
  // beide Ansichten identisches Popup-Verhalten haben (keine doppelte Logik).
  const handleBookingClick = (booking: any) => {
    setSelectedEvent({
      type: 'occupied',
      title: `Buchung: ${booking.guest_name}`,
      booking: { ...booking, guest: booking.guest_name, house: booking.houses?.name || 'Unbekannt', checkIn: booking.check_in, checkOut: booking.check_out },
      color: 'bg-cyan-400 text-white',
    });
  };

  const handleChangeoverClick = (departing: any, arriving: any) => {
    const houseName = departing.houses?.name || arriving.houses?.name || 'Unbekannt';
    setSelectedEvent({
      type: 'changeover',
      title: `Wechsel: ${departing.guest_name.split(' ')[0]} → ${arriving.guest_name.split(' ')[0]}`,
      departing: { ...departing, guest: departing.guest_name, house: houseName },
      arriving: { ...arriving, guest: arriving.guest_name, house: houseName },
      color: 'bg-amber-500 text-white',
    });
  };

  const handleCleaningClick = (task: any, guestName?: string) => {
    const house = housesData?.find((h) => h.id === task.house_id);
    const houseName = house?.name?.replace(' Chalet', '') || 'Unbekannt';
    setSelectedEvent({
      type: 'cleaning',
      title: `🧹 Reinigung: ${houseName}`,
      cleaning: task,
      booking: { house: house?.name || 'Unbekannt', guest: guestName },
      color: 'bg-blue-500 text-white',
    });
  };

  const handleLinenClick = (order: any, guestName?: string) => {
    const house = housesData?.find((h) => h.id === order.house_id);
    const houseName = house?.name?.replace(' Chalet', '') || 'Unbekannt';
    setSelectedEvent({
      type: 'laundry',
      title: `🧺 Wäsche: ${houseName}`,
      laundry: order,
      booking: { house: house?.name || 'Unbekannt', guest: guestName },
      color: 'bg-purple-500 text-white',
    });
  };

  // Klick auf eine Monatskachel in der Jahresübersicht: Monat merken und in
  // die Monatsansicht wechseln. Dort wird das ganze Jahr gerendert und an
  // diesen Monat gescrollt — von dort ist bis Januar bzw. Dezember scrollbar.
  const handleSelectMonth = (monthStart: Date) => {
    setSelectedDate(monthStart);
    setCalendarView('month');
  };

  // Pfeile blättern je nach Ansicht: in der Jahresübersicht ganze Jahre,
  // sonst einzelne Monate.
  const goBack = () =>
    setSelectedDate(calendarView === 'year' ? subYears(selectedDate, 1) : subMonths(selectedDate, 1));
  const goForward = () =>
    setSelectedDate(calendarView === 'year' ? addYears(selectedDate, 1) : addMonths(selectedDate, 1));

  const headline =
    calendarView === 'year'
      ? format(selectedDate, 'yyyy', { locale: de })
      : calendarView === 'timeline'
        ? `${format(subMonths(selectedDate, 1), 'MMM', { locale: de })} – ${format(addMonths(selectedDate, 1), 'MMM yyyy', { locale: de })}`
        : format(selectedDate, 'MMMM yyyy', { locale: de });

  // Gemeinsamer Detail-Inhalt fürs Popup — für alle Event-Typen (Buchung,
  // Wechseltag, Reinigung, Wäsche), egal aus welcher Ansicht der Klick kam.
  const renderEventDetailsContent = (event: any) => {
    if (event.type === 'changeover') {
      return (
        <div className="space-y-4 text-sm">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Abreise</div>
            <div><span className="font-medium">Gast:</span> {event.departing.guest}</div>
            <div><span className="font-medium">Haus:</span> {event.departing.house}</div>
          </div>
          <div className="space-y-1 pt-2 border-t">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anreise</div>
            <div><span className="font-medium">Gast:</span> {event.arriving.guest}</div>
            <div><span className="font-medium">Haus:</span> {event.arriving.house}</div>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${event.color}`}>
          {event.title}
        </div>

        {event.type === 'occupied' ? (
          <div className="space-y-2 text-sm">
            {event.booking?.guest && (<div><span className="font-medium">Gast:</span> {event.booking.guest}</div>)}
            {event.booking?.house && (<div><span className="font-medium">Haus:</span> {event.booking.house}</div>)}
            {event.booking?.status && (<div><span className="font-medium">Status:</span> {event.booking.status}</div>)}
            {event.booking?.checkIn && (<div><span className="font-medium">Check-in:</span> {format(parseISO(event.booking.checkIn), 'dd.MM.yyyy HH:mm', { locale: de })}</div>)}
            {event.booking?.checkOut && (<div><span className="font-medium">Check-out:</span> {format(parseISO(event.booking.checkOut), 'dd.MM.yyyy HH:mm', { locale: de })}</div>)}
          </div>
        ) : event.type === 'cleaning' ? (
          <div className="space-y-2 text-sm">
            {event.booking?.guest && (<div><span className="font-medium">Buchung:</span> {event.booking.guest}</div>)}
            {event.booking?.house && (<div><span className="font-medium">Haus:</span> {event.booking.house}</div>)}
            {event.cleaning?.scheduled_date && (<div><span className="font-medium">Datum:</span> {format(parseISO(event.cleaning.scheduled_date), 'dd.MM.yyyy', { locale: de })}</div>)}
            {event.cleaning?.status && (<div><span className="font-medium">Status:</span> {event.cleaning.status}</div>)}
          </div>
        ) : event.type === 'laundry' ? (
          <div className="space-y-2 text-sm">
            {event.booking?.guest && (<div><span className="font-medium">Buchung:</span> {event.booking.guest}</div>)}
            {event.booking?.house && (<div><span className="font-medium">Haus:</span> {event.booking.house}</div>)}
            {event.laundry?.delivery_date && (<div><span className="font-medium">Lieferdatum:</span> {format(parseISO(event.laundry.delivery_date), 'dd.MM.yyyy', { locale: de })}</div>)}
            {event.laundry?.status && (<div><span className="font-medium">Status:</span> {event.laundry.status}</div>)}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card p-4 rounded-lg border">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            {calendarView === 'month' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCalendarView('year')}
                aria-label="Zurück zur Jahresübersicht"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                {format(selectedDate, 'yyyy', { locale: de })}
              </Button>
            )}
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">{headline}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={goBack} aria-label={calendarView === 'year' ? 'Ein Jahr zurück' : 'Ein Monat zurück'}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>Heute</Button>
            <Button variant="outline" size="sm" onClick={goForward} aria-label={calendarView === 'year' ? 'Ein Jahr vor' : 'Ein Monat vor'}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={calendarView === 'year' ? 'default' : 'outline'} size="sm" onClick={() => setCalendarView('year')}>Jahr</Button>
          <Button variant={calendarView === 'month' ? 'default' : 'outline'} size="sm" onClick={() => setCalendarView('month')}>Monat</Button>
          <Button variant={calendarView === 'timeline' ? 'default' : 'outline'} size="sm" onClick={() => setCalendarView('timeline')}>📊 Timeline</Button>
        </div>
      </div>

      <div>
        {calendarView === 'timeline' ? (
          <BookingTimeline
            bookings={bookingsData || []}
            houses={housesData || []}
            selectedDate={selectedDate}
            serviceTasks={serviceTasks}
            linenOrders={linenOrders}
            onBookingClick={handleBookingClick}
            onCleaningClick={handleCleaningClick}
            onLinenClick={handleLinenClick}
          />
        ) : (
          <HouseStackedCalendar
            bookings={bookingsData || []}
            houses={housesData || []}
            selectedDate={selectedDate}
            serviceTasks={serviceTasks}
            linenOrders={linenOrders}
            viewMode={calendarView === 'year' ? 'year' : 'month'}
            onSelectMonth={handleSelectMonth}
            onBookingClick={handleBookingClick}
            onChangeoverClick={handleChangeoverClick}
            onCleaningClick={handleCleaningClick}
            onLinenClick={handleLinenClick}
          />
        )}
      </div>

      {/* Detail-Popup — für beide Ansichten gemeinsam genutzt. */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedEvent?.type === 'cleaning' ? 'Reinigungsdetails'
                : selectedEvent?.type === 'laundry' ? 'Wäschedetails'
                : selectedEvent?.type === 'changeover' ? 'Gästewechsel'
                : 'Buchungsdetails'}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && renderEventDetailsContent(selectedEvent)}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarTab;
