import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format, isSameDay, parseISO, addDays, addMonths, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import BookingTimeline from '@/components/Calendar/BookingTimeline';

interface CalendarTabProps {
  bookingsData: any[] | undefined;
  housesData: any[] | undefined;
  serviceTasks: any[] | undefined;
  linenOrders: any[] | undefined;
}

const getHouseOccupiedColor = (houseName: string): string => {
  const houseColors: Record<string, string> = {
    'Venedigersiedlung Chalet': 'bg-orange-500 text-white',
    'Wald Chalet': 'bg-cyan-200 text-cyan-800',
  };
  return houseColors[houseName] || 'bg-orange-200 text-orange-900';
};

export const CalendarTab: React.FC<CalendarTabProps> = ({
  bookingsData,
  housesData,
  serviceTasks,
  linenOrders,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'timeline'>('month');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [openPopoverDate, setOpenPopoverDate] = useState<string | null>(null);

  const getEventsForDate = (date: Date) => {
    const events: any[] = [];
    const realBookings = bookingsData || [];

    realBookings.forEach((booking) => {
      if (booking.status === 'cancelled') return;
      const checkIn = parseISO(booking.check_in);
      const checkOut = parseISO(booking.check_out);
      const guestDisplayName = booking.guest_name.split(' ')[0];
      const houseDisplayName = booking.houses?.name || 'Unbekanntes Haus';

      if (isSameDay(date, checkIn)) {
        events.push({
          type: 'checkin',
          title: `Check-in: ${guestDisplayName}`,
          booking: { ...booking, guest: booking.guest_name, house: houseDisplayName, checkIn: booking.check_in, checkOut: booking.check_out },
          color: 'bg-green-500 text-white',
        });
      }
      if (isSameDay(date, checkOut)) {
        events.push({
          type: 'checkout',
          title: `Check-out: ${guestDisplayName}`,
          booking: { ...booking, guest: booking.guest_name, house: houseDisplayName, checkIn: booking.check_in, checkOut: booking.check_out },
          color: 'bg-red-500 text-white',
        });
      }
    });

    (serviceTasks || []).forEach((task) => {
      if (task.service_type !== 'cleaning' || task.status === 'cancelled') return;
      if (task.scheduled_date) {
        const taskDate = parseISO(task.scheduled_date);
        if (isSameDay(date, taskDate)) {
          const house = housesData?.find((h) => h.id === task.house_id);
          const houseName = house?.name?.replace(' Chalet', '') || 'Unbekannt';
          events.push({ type: 'cleaning', title: `🧹 Reinigung: ${houseName}`, task, color: 'bg-blue-500 text-white' });
        }
      }
    });

    (linenOrders || []).forEach((order) => {
      if (order.status === 'cancelled' || order.status === 'delivered') return;
      if (order.delivery_date) {
        const deliveryDate = parseISO(order.delivery_date);
        if (isSameDay(date, deliveryDate)) {
          const house = housesData?.find((h) => h.id === order.house_id);
          const houseName = house?.name?.replace(' Chalet', '') || 'Unbekannt';
          events.push({ type: 'laundry', title: `🧺 Wäsche: ${houseName}`, order, color: 'bg-purple-500 text-white' });
        }
      }
    });

    realBookings.forEach((booking) => {
      if (booking.status === 'cancelled' || booking.status === 'completed') return;
      const checkIn = parseISO(booking.check_in);
      const checkOut = parseISO(booking.check_out);
      const guestDisplayName = booking.guest_name.split(' ')[0];
      const houseDisplayName = booking.houses?.name || 'Unbekanntes Haus';
      const currentDate = new Date(date);
      if (currentDate > checkIn && currentDate < checkOut) {
        events.push({
          type: 'occupied',
          title: `Belegt: ${guestDisplayName}`,
          booking: { ...booking, guest: booking.guest_name, house: houseDisplayName, checkIn: booking.check_in, checkOut: booking.check_out },
          color: getHouseOccupiedColor(houseDisplayName),
        });
      }
    });

    (housesData || []).forEach((house) => {
      const hasBookingOnThisDay = realBookings.some((booking) => {
        if (booking.status === 'cancelled') return false;
        if (booking.houses?.id !== house.id) return false;
        const checkIn = parseISO(booking.check_in);
        const checkOut = parseISO(booking.check_out);
        const currentDate = new Date(date);
        return currentDate >= checkIn && currentDate <= checkOut;
      });
      if (!hasBookingOnThisDay) {
        const shortHouseName = house.name.replace(' Chalet', '');
        events.push({
          type: 'free',
          title: `Frei: ${shortHouseName}`,
          houseName: house.name,
          booking: { house: house.name, guest: '', checkIn: '', checkOut: '' },
          color: 'bg-white',
          borderColor: 'border-green-500',
          isFreeDayEvent: true,
        });
      }
    });

    return events;
  };

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const getWeekDates = (weekStart: Date) => {
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const renderWeekView = () => {
    const weekStart = getWeekStart(selectedDate);
    const weekDates = getWeekDates(weekStart);
    return (
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="p-3 sm:p-6">
          <div className="hidden sm:grid grid-cols-7 gap-2 mb-4">
            {['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'].map((day) => (
              <div key={day} className="text-center font-medium text-sm text-muted-foreground p-2">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:hidden mb-4">
            {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
              <div key={day} className="text-center font-medium text-xs text-muted-foreground p-1">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {weekDates.map((date) => {
              const events = getEventsForDate(date);
              const isToday = isSameDay(date, new Date());
              const isSelected = isSameDay(date, selectedDate);
              return (
                <div
                  key={date.toISOString()}
                  className={`relative p-1 sm:p-3 border border-border min-h-[80px] sm:min-h-[120px] cursor-pointer transition-colors hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground ${isSelected ? 'bg-primary text-primary-foreground' : ''} ${isToday ? 'bg-accent text-accent-foreground font-semibold border-2 border-primary' : ''}`}
                  onClick={() => setSelectedDate(date)}
                >
                  <div className="font-medium text-xs sm:text-sm mb-1 sm:mb-2">{format(date, 'd')}</div>
                  <div className="space-y-0.5 sm:space-y-1">
                    {events.slice(0, 3).map((event, index) => (
                      <div
                        key={index}
                        className={`text-[10px] sm:text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded-md ${event.color} ${event.isFreeDayEvent ? `border-2 ${event.borderColor}` : ''} truncate font-medium cursor-pointer hover:opacity-80`}
                        title={`${event.title}${event.booking?.house ? ` - ${event.booking.house}` : ''}`}
                        onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); }}
                      >
                        {event.isFreeDayEvent ? <span className="text-green-600 font-semibold">{event.title}</span> : event.title}
                      </div>
                    ))}
                    {events.length > 3 && (
                      <div className="text-[10px] sm:text-xs text-muted-foreground font-medium">+{events.length - 3}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderMonthView = () => (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="p-3 sm:p-6">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => date && setSelectedDate(date)}
          month={selectedDate}
          onMonthChange={setSelectedDate}
          locale={de}
          className="pointer-events-auto w-full bg-white"
          classNames={{
            months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 w-full",
            month: "space-y-4 w-full",
            caption: "hidden",
            caption_label: "hidden",
            nav: "hidden",
            nav_button: "hidden",
            nav_button_previous: "hidden",
            nav_button_next: "hidden",
            table: "w-full border-collapse",
            head_row: "flex w-full mb-1 sm:mb-2",
            head_cell: "text-muted-foreground rounded-md w-full font-medium text-[9px] sm:text-sm p-0.5 sm:p-2 text-center",
            row: "flex w-full",
            cell: "relative p-0 text-center text-sm w-full border border-border min-h-[70px] sm:min-h-[90px]",
            day: "h-full w-full p-1 sm:p-2 font-normal aria-selected:opacity-100 hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground flex flex-col items-start justify-start cursor-pointer transition-colors",
            day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
            day_today: "bg-accent text-accent-foreground font-semibold border-2 border-primary",
            day_outside: "text-muted-foreground opacity-50",
            day_disabled: "text-muted-foreground opacity-30 cursor-not-allowed",
          }}
          components={{
            DayContent: ({ date }) => {
              const events = getEventsForDate(date);
              return (
                <div className="w-full h-full flex flex-col gap-0.5 sm:gap-1">
                  <div className="font-medium text-[9px] sm:text-sm text-foreground shrink-0">{format(date, 'd')}</div>
                  <div className="flex-1 space-y-0.5 w-full overflow-hidden">
                    {events.slice(0, 2).map((event, index) => (
                      <div
                        key={index}
                        className={`text-[7px] sm:text-xs px-0.5 sm:px-2 py-0.5 rounded-sm sm:rounded-md ${event.color} ${event.isFreeDayEvent ? `border-2 ${event.borderColor}` : ''} w-full font-medium cursor-pointer hover:opacity-80 leading-tight overflow-hidden`}
                        style={{ wordBreak: 'break-word' }}
                        title={`${event.title}${event.booking?.house ? ` - ${event.booking.house}` : ''}`}
                        onClick={() => setSelectedEvent(event)}
                      >
                        {event.isFreeDayEvent ? <span className="text-green-600 font-semibold">{event.title}</span> : event.title}
                      </div>
                    ))}
                    {events.length > 2 && (
                      <Popover
                        open={openPopoverDate === format(date, 'yyyy-MM-dd')}
                        onOpenChange={(isOpen) => setOpenPopoverDate(isOpen ? format(date, 'yyyy-MM-dd') : null)}
                      >
                        <PopoverTrigger asChild>
                          <div
                            className="text-[7px] sm:text-xs text-muted-foreground font-medium cursor-pointer hover:text-foreground hover:underline"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpenPopoverDate(format(date, 'yyyy-MM-dd')); }}
                          >
                            +{events.length - 2} mehr
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                          <div className="text-xs font-semibold mb-2 text-muted-foreground">
                            Alle Events am {format(date, 'd. MMMM', { locale: de })}
                          </div>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {events.map((event, index) => (
                              <div
                                key={index}
                                className={`text-xs px-2 py-1.5 rounded ${event.color} cursor-pointer hover:opacity-80 font-medium`}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSelectedEvent(event); setOpenPopoverDate(null); }}
                              >
                                {event.title}
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
              );
            },
          }}
        />
      </div>
    </div>
  );

  const renderTimelineView = () => (
    <BookingTimeline
      bookings={bookingsData || []}
      houses={housesData || []}
      selectedDate={selectedDate}
      onBookingClick={(booking) => setSelectedEvent({
        type: 'occupied',
        title: `Buchung: ${booking.guest_name}`,
        booking: { ...booking, guest: booking.guest_name, house: booking.houses?.name || 'Unbekannt', checkIn: booking.check_in, checkOut: booking.check_out },
        color: 'bg-cyan-400 text-white',
      })}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card p-4 rounded-lg border">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            {calendarView === 'week'
              ? `${format(getWeekStart(selectedDate), 'dd. MMM', { locale: de })} - ${format(addDays(getWeekStart(selectedDate), 6), 'dd. MMM yyyy', { locale: de })}`
              : format(selectedDate, 'MMMM yyyy', { locale: de })}
          </h2>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(calendarView === 'week' ? addDays(selectedDate, -7) : subMonths(selectedDate, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>Heute</Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(calendarView === 'week' ? addDays(selectedDate, 7) : addMonths(selectedDate, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button variant={calendarView === 'month' ? 'default' : 'outline'} size="sm" onClick={() => setCalendarView('month')}>Monat</Button>
          <Button variant={calendarView === 'week' ? 'default' : 'outline'} size="sm" onClick={() => setCalendarView('week')}>Woche</Button>
          <Button variant={calendarView === 'timeline' ? 'default' : 'outline'} size="sm" onClick={() => setCalendarView('timeline')}>📊 Timeline</Button>
        </div>
      </div>

      {calendarView === 'timeline' ? (
        <div className="overflow-x-auto">{renderTimelineView()}</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3 overflow-x-auto">
            {calendarView === 'week' ? renderWeekView() : renderMonthView()}
          </div>

          <div className="space-y-4">
            <Card className="bg-card border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-foreground">
                  Termine für {format(selectedDate, 'dd. MMMM', { locale: de })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedEvent ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${selectedEvent.color}`}>
                        {selectedEvent.title}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    {selectedEvent.type === 'free' ? (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-foreground">Verfügbarkeit</h4>
                        <div className="space-y-2 text-sm">
                          <div><span className="font-medium">Haus:</span> {selectedEvent.houseName}</div>
                          <div><span className="font-medium">Status:</span> <span className="text-green-600 font-semibold">Verfügbar</span></div>
                        </div>
                      </div>
                    ) : selectedEvent.type === 'checkin' || selectedEvent.type === 'checkout' || selectedEvent.type === 'occupied' ? (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-foreground">Buchungsdetails</h4>
                        <div className="space-y-2 text-sm">
                          {selectedEvent.booking?.guest && (<div><span className="font-medium">Gast:</span> {selectedEvent.booking.guest}</div>)}
                          {selectedEvent.booking?.house && (<div><span className="font-medium">Haus:</span> {selectedEvent.booking.house}</div>)}
                          {selectedEvent.booking?.dates && (<div><span className="font-medium">Zeitraum:</span> {selectedEvent.booking.dates}</div>)}
                          {selectedEvent.booking?.guests && (<div><span className="font-medium">Gäste:</span> {selectedEvent.booking.guests}</div>)}
                          {selectedEvent.booking?.status && (<div><span className="font-medium">Status:</span> {selectedEvent.booking.status}</div>)}
                          {selectedEvent.booking?.checkIn && (<div><span className="font-medium">Check-in:</span> {format(parseISO(selectedEvent.booking.checkIn), 'dd.MM.yyyy HH:mm', { locale: de })}</div>)}
                          {selectedEvent.booking?.checkOut && (<div><span className="font-medium">Check-out:</span> {format(parseISO(selectedEvent.booking.checkOut), 'dd.MM.yyyy HH:mm', { locale: de })}</div>)}
                        </div>
                      </div>
                    ) : selectedEvent.type === 'cleaning' ? (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-foreground">Reinigungsdetails</h4>
                        <div className="space-y-2 text-sm">
                          {selectedEvent.booking?.house && (<div><span className="font-medium">Haus:</span> {selectedEvent.booking.house}</div>)}
                          {selectedEvent.cleaning?.date && (<div><span className="font-medium">Datum:</span> {format(parseISO(selectedEvent.cleaning.date), 'dd.MM.yyyy', { locale: de })}</div>)}
                          {selectedEvent.cleaning?.provider && (<div><span className="font-medium">Anbieter:</span> {selectedEvent.cleaning.provider}</div>)}
                          {selectedEvent.cleaning?.status && (<div><span className="font-medium">Status:</span> {selectedEvent.cleaning.status}</div>)}
                          {selectedEvent.booking?.guest && (<div><span className="font-medium">Buchung:</span> {selectedEvent.booking.guest}</div>)}
                        </div>
                      </div>
                    ) : selectedEvent.type === 'laundry' ? (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-foreground">Wäschedetails</h4>
                        <div className="space-y-2 text-sm">
                          {selectedEvent.booking?.house && (<div><span className="font-medium">Haus:</span> {selectedEvent.booking.house}</div>)}
                          {selectedEvent.laundry?.status && (<div><span className="font-medium">Status:</span> {selectedEvent.laundry.status}</div>)}
                          {selectedEvent.laundry?.provider && (<div><span className="font-medium">Anbieter:</span> {selectedEvent.laundry.provider}</div>)}
                          {selectedEvent.laundry?.items && (<div><span className="font-medium">Artikel:</span> {selectedEvent.laundry.items.join(', ')}</div>)}
                          {selectedEvent.booking?.guest && (<div><span className="font-medium">Buchung:</span> {selectedEvent.booking.guest}</div>)}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : getEventsForDate(selectedDate).length > 0 ? (
                  <div className="space-y-3">
                    {getEventsForDate(selectedDate).map((event, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg bg-muted/50 border cursor-pointer hover:bg-muted/70 transition-colors"
                        onClick={() => setSelectedEvent(event)}
                      >
                        <div className={`inline-block px-2 py-1 rounded-md text-xs font-medium ${event.color} mb-2`}>
                          {event.title}
                        </div>
                        {event.booking?.house && (<p className="text-sm text-muted-foreground">{event.booking.house}</p>)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Keine Termine für diesen Tag</p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-foreground">Legende</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center space-x-3"><div className="w-4 h-4 bg-green-500 rounded-md"></div><span className="text-sm text-foreground">Check-in</span></div>
                <div className="flex items-center space-x-3"><div className="w-4 h-4 bg-red-500 rounded-md"></div><span className="text-sm text-foreground">Check-out</span></div>
                <div className="flex items-center space-x-3"><div className="w-4 h-4 bg-orange-500 rounded-md border border-orange-600"></div><span className="text-sm text-foreground">Venedigersiedlung Belegt</span></div>
                <div className="flex items-center space-x-3"><div className="w-4 h-4 bg-cyan-200 rounded-md border border-cyan-300"></div><span className="text-sm text-foreground">Wald Chalet Belegt</span></div>
                <div className="flex items-center space-x-3"><div className="w-4 h-4 bg-blue-500 rounded-md"></div><span className="text-sm text-foreground">Reinigung</span></div>
                <div className="flex items-center space-x-3"><div className="w-4 h-4 bg-purple-500 rounded-md"></div><span className="text-sm text-foreground">Wäsche</span></div>
                <div className="flex items-center space-x-3 pt-2 border-t"><div className="w-4 h-4 bg-white rounded-md border-2 border-green-500"></div><span className="text-sm text-green-600 font-semibold">Frei (beide Häuser)</span></div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarTab;