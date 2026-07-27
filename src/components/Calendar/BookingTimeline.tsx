import { useMemo, useRef, useEffect } from 'react';
import { format, differenceInDays, addDays, addMonths, subMonths, startOfMonth, isSameDay } from 'date-fns';

// Extrahiert lokales Datum aus ISO-String, ignoriert Zeitzone
// "2026-02-22 09:00:00+00" → new Date("2026-02-22T00:00:00") = lokale Mitternacht
const parseLocalDate = (isoString: string): Date => {
  const datePart = isoString.substring(0, 10);
  return new Date(datePart + 'T00:00:00');
};
import { de } from 'date-fns/locale';
import { getHouseIcon, getHouseColors } from '@/lib/utils';

interface Booking {
  id: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  status?: string;
  house_id?: string;
  number_of_guests: number;
  houses?: {
    id: string;
    name: string;
  };
}

interface House {
  id: string;
  name: string;
  rental_type?: string;
}

interface ServiceTask {
  id: string;
  booking_id?: string | null;
  house_id: string;
  service_type: string;
  status: string;
  scheduled_date?: string | null;
  provider_id?: string | null;
}

interface LinenOrder {
  id: string;
  booking_id?: string | null;
  house_id: string;
  status: string;
  delivery_date?: string | null;
}

interface BookingTimelineProps {
  bookings: Booking[];
  houses: House[];
  selectedDate: Date;
  onBookingClick: (booking: Booking) => void;
  serviceTasks?: ServiceTask[];
  linenOrders?: LinenOrder[];
  onCleaningClick?: (task: ServiceTask) => void;
  onLinenClick?: (order: LinenOrder) => void;
}

// Haus-Farben kommen aus getHouseColors() in @/lib/utils — bewusst NICHT mehr
// lokal als Tabelle mit exakten Hausnamen. Genau diese Tabelle war die Ursache
// dafür, dass Venediger still grau blieb (Schlüssel 'Venedigersiedlung Chalet'
// traf den echten Namen "Venediger Chalet" nie).

// Reinigung: draft (Entwurf, noch nicht bestätigt) = blasses Icon, sonst voll blau.
// completed/delayed bekommen eine eigene Farbe für den Rückblick.
const CLEANING_ICON_STYLES: Record<string, string> = {
  draft: 'bg-white/90 border-blue-400 text-blue-600',
  scheduled: 'bg-blue-600 border-blue-700 text-white',
  in_progress: 'bg-blue-600 border-blue-700 text-white',
  completed: 'bg-green-600 border-green-700 text-white',
  delayed: 'bg-amber-500 border-amber-700 text-white',
};
const CLEANING_ICON_DEFAULT = CLEANING_ICON_STYLES.scheduled;

// Wäsche: offen (noch nicht freigegeben) = blasses Icon, ausstehend = bestätigter Liefertermin.
const LINEN_ICON_STYLES: Record<string, string> = {
  offen: 'bg-white/90 border-purple-400 text-purple-600',
  ausstehend: 'bg-purple-600 border-purple-700 text-white',
};
const LINEN_ICON_DEFAULT = LINEN_ICON_STYLES.offen;

const DAY_WIDTH = 28; // px — identisch zu w-7 (7 × 4px = 28px), muss mit Grid übereinstimmen

const BookingTimeline = ({
  bookings,
  houses,
  selectedDate,
  onBookingClick,
  serviceTasks,
  linenOrders,
  onCleaningClick,
  onLinenClick,
}: BookingTimelineProps) => {
  // Rollendes 3-Monats-Fenster (Vormonat / aktueller Monat / Folgemonat) statt
  // eines einzelnen Kalendermonats. Liegt im selben horizontal scrollbaren
  // Container — damit kann frei mit Maus/Trackpad durch die Zeit gescrollt
  // werden, statt bei jedem Klick auf ◀/▶ hart zu springen.
  const viewStart = useMemo(() => startOfMonth(subMonths(selectedDate, 1)), [selectedDate]);
  const viewEnd = useMemo(() => startOfMonth(addMonths(selectedDate, 2)), [selectedDate]); // exklusiv
  const daysInView = differenceInDays(viewEnd, viewStart);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Beim Öffnen / Monatswechsel automatisch zum aktuellen Monat scrollen —
  // der Vormonat bleibt nach links weiter scrollbar erreichbar.
  useEffect(() => {
    if (!scrollRef.current) return;
    const currentMonthStart = startOfMonth(selectedDate);
    const offsetDays = differenceInDays(currentMonthStart, viewStart);
    scrollRef.current.scrollLeft = Math.max(offsetDays * DAY_WIDTH - DAY_WIDTH, 0);
  }, [selectedDate, viewStart]);

  // Nur touristische Häuser
  const touristHouses = useMemo(() => 
    houses.filter(h => h.rental_type === 'tourist'),
    [houses]
  );

  // Aktive Buchungen (nicht storniert)
  const activeBookings = useMemo(() => 
    bookings.filter(b => b.status !== 'cancelled'),
    [bookings]
  );

  // Prüfe ob zwei Buchungen sich überlappen
  const bookingsOverlap = (a: Booking, b: Booking) => {
    const aStart = parseLocalDate(a.check_in);
    const aEnd = parseLocalDate(a.check_out);
    const bStart = parseLocalDate(b.check_in);
    const bEnd = parseLocalDate(b.check_out);
    return aStart < bEnd && bStart < aEnd;
  };

  // Berechne vertikalen Offset für überlappende Buchungen
  const getVerticalOffset = (bookingIndex: number, houseBookings: Booking[]) => {
    let overlaps = 0;
    for (let i = 0; i < bookingIndex; i++) {
      if (bookingsOverlap(houseBookings[i], houseBookings[bookingIndex])) {
        overlaps++;
      }
    }
    return overlaps * 28; // 28px Versatz pro Überlappung
  };

  // Berechne maximale Überlappungen für Container-Höhe
  const getMaxOverlaps = (houseBookings: Booking[]) => {
    let maxOverlaps = 0;
    for (let i = 0; i < houseBookings.length; i++) {
      const offset = getVerticalOffset(i, houseBookings);
      maxOverlaps = Math.max(maxOverlaps, offset);
    }
    return maxOverlaps;
  };

  // Berechne Position und Breite des Buchungs-Balkens — Pixel-basiert mit Halbtag-Logik
  // Check-in 15:00 → Balken startet in der Mitte des Tages (+0.5)
  // Check-out 10:00 → Balken endet in der Mitte des Tages (+0.5)
  const getBarStyle = (booking: Booking) => {
    const checkIn = parseLocalDate(booking.check_in);
    const checkOut = parseLocalDate(booking.check_out);

    const barStart = checkIn < viewStart ? viewStart : checkIn;
    const barEnd = checkOut > viewEnd ? viewEnd : checkOut;

    // +0.5 nur wenn check_in/out innerhalb des sichtbaren Fensters liegt (nicht geclampt)
    const isCheckInInView = checkIn >= viewStart && checkIn < viewEnd;
    const isCheckOutInView = checkOut >= viewStart && checkOut < viewEnd;

    const startOffsetDays = differenceInDays(barStart, viewStart);
    const endOffsetDays = differenceInDays(barEnd, viewStart);

    const startPx = (startOffsetDays + (isCheckInInView ? 0.5 : 0)) * DAY_WIDTH + (isCheckInInView ? 2 : 0);
    const endPx = (endOffsetDays + (isCheckOutInView ? 0.5 : 0)) * DAY_WIDTH - (isCheckOutInView ? 2 : 0);

    // Buchung ist "geclampt" wenn sie über den Fensterrand hinausragt
    const isClamped = checkIn < viewStart || checkOut > viewEnd;

    return {
      left: `${startPx}px`,
      width: `${Math.max(endPx - startPx, DAY_WIDTH * 0.5)}px`,
      isClamped
    };
  };

  // Prüfe ob Buchung im sichtbaren Fenster liegt
  const isBookingVisible = (booking: Booking) => {
    const checkIn = parseLocalDate(booking.check_in);
    const checkOut = parseLocalDate(booking.check_out);
    return checkIn <= viewEnd && checkOut >= viewStart;
  };

  // Berechne Anzahl Nächte
  const getNights = (booking: Booking) => {
    const checkIn = parseLocalDate(booking.check_in);
    const checkOut = parseLocalDate(booking.check_out);
    return differenceInDays(checkOut, checkIn);
  };

  // Reinigung/Wäsche gehören zur ANKOMMENDEN Buchung (booking_id) — sie bereiten
  // das Haus für DIESEN Gast vor und liegen fast immer vor dessen Check-in.
  // Deshalb Zuordnung über booking_id, nicht über das Datum in der Tagesspalte.
  const cleaningByBooking = useMemo(() => {
    const map = new Map<string, ServiceTask>();
    (serviceTasks || []).forEach(t => {
      if (t.service_type === 'cleaning' && t.status !== 'cancelled' && t.booking_id) {
        map.set(t.booking_id, t);
      }
    });
    return map;
  }, [serviceTasks]);

  const linenByBooking = useMemo(() => {
    const map = new Map<string, LinenOrder>();
    (linenOrders || []).forEach(o => {
      if (o.status !== 'cancelled' && o.status !== 'delivered' && o.booking_id) {
        map.set(o.booking_id, o);
      }
    });
    return map;
  }, [linenOrders]);

  return (
    <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
      <div className="overflow-x-auto" ref={scrollRef}>
        {/* Header mit Tagen */}
        <div className="flex w-max border-b sticky top-0 bg-card z-10">
          {/* Haus-Spalte - sticky für horizontales Scrollen */}
          <div className="w-[104px] shrink-0 p-2 md:p-3 font-semibold border-r bg-muted text-foreground sticky left-0 z-20">
            Objekt
          </div>
          {/* Tages-Header mit fester Mindestbreite, Monatsgrenzen leicht hervorgehoben */}
          <div className="flex" style={{ minWidth: `${daysInView * DAY_WIDTH}px` }}>
            {Array.from({ length: daysInView }, (_, i) => {
              const date = addDays(viewStart, i);
              const isToday = isSameDay(date, new Date());
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              const isMonthStart = date.getDate() === 1;
              
              return (
                <div 
                  key={i} 
                  className={`
                    w-7 shrink-0 text-center text-xs p-1 border-r
                    ${isToday ? 'bg-primary/20 font-bold' : ''}
                    ${isWeekend && !isToday ? 'bg-muted/30' : ''}
                    ${isMonthStart ? 'border-l-2 border-l-foreground/20' : ''}
                  `}
                >
                  <div className="font-medium text-foreground">{format(date, 'd')}</div>
                  <div className="text-muted-foreground text-[10px]">
                    {isMonthStart ? format(date, 'MMM', { locale: de }) : format(date, 'EEE', { locale: de })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Haus-Zeilen */}
        {touristHouses.map((house, houseIndex) => {
          const houseBookings = activeBookings
            .filter(b => (b.house_id === house.id || b.houses?.id === house.id) && isBookingVisible(b))
            .sort((a, b) => parseLocalDate(a.check_in).getTime() - parseLocalDate(b.check_in).getTime());
          const colors = getHouseColors(house.name);
          const maxOverlaps = getMaxOverlaps(houseBookings);
          const containerHeight = 64 + maxOverlaps;
          
          return (
            <div 
              key={house.id} 
              className={`flex w-max relative ${houseIndex % 2 === 0 ? 'bg-card' : 'bg-muted/20'}`}
            >
              {/* Haus-Name - sticky für horizontales Scrollen */}
              <div className={`w-[104px] shrink-0 p-2 md:p-3 border-r flex items-center gap-2 sticky left-0 z-10 ${houseIndex % 2 === 0 ? 'bg-card' : 'bg-muted'}`}>
                <span className="text-lg shrink-0">{getHouseIcon(house.name)}</span>
                <span className="text-sm font-semibold text-foreground truncate">
                  {house.name.replace(' Chalet', '')}
                </span>
              </div>
              
              {/* Timeline-Bereich mit Buchungs-Balken */}
              <div 
                className="relative"
                style={{ height: `${containerHeight}px`, minHeight: '64px', minWidth: `${daysInView * DAY_WIDTH}px` }}
              >
                {/* Hintergrund-Raster */}
                <div className="absolute inset-0 flex" style={{ minWidth: `${daysInView * DAY_WIDTH}px` }}>
                  {Array.from({ length: daysInView }, (_, i) => {
                    const date = addDays(viewStart, i);
                    const isToday = isSameDay(date, new Date());
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const isMonthStart = date.getDate() === 1;
                    
                    return (
                      <div 
                        key={i}
                        className={`
                          w-7 shrink-0 border-r border-border/50
                          ${isToday ? 'bg-primary/10' : ''}
                          ${isWeekend && !isToday ? 'bg-muted/20' : ''}
                          ${isMonthStart ? 'border-l-2 border-l-foreground/10' : ''}
                        `}
                      />
                    );
                  })}
                </div>
                
                {/* Buchungs-Balken mit Reinigungs-/Wäsche-Icon im Balken (links) */}
                {houseBookings.map((booking, bookingIndex) => {
                  const style = getBarStyle(booking);
                  const nights = getNights(booking);
                  const firstName = booking.guest_name.split(' ')[0];
                  const verticalOffset = getVerticalOffset(bookingIndex, houseBookings);
                  const cleaningTask = cleaningByBooking.get(booking.id);
                  const linenOrder = linenByBooking.get(booking.id);
                  
                  return (
                    <div
                      key={booking.id}
                      className={`
                        absolute h-10 ${colors.barBg} ${colors.barText} ${colors.barBorder}
                        rounded-lg px-1.5 flex items-center gap-1 text-sm font-medium 
                        cursor-pointer hover:opacity-90 shadow-md border-2
                        transition-all duration-150 hover:scale-[1.02] hover:z-10
                      `}
                      style={{ 
                        left: style.left, 
                        width: style.width,
                        ...(style.isClamped ? {} : { minWidth: '45px' }),
                        top: `${8 + verticalOffset}px`
                      }}
                      onClick={() => onBookingClick(booking)}
                      title={`${booking.guest_name} - ${nights} Nächte (${booking.number_of_guests} Gäste)`}
                    >
                      {(cleaningTask || linenOrder) && (
                        <div className="flex gap-0.5 shrink-0">
                          {cleaningTask && (
                            <span
                              className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center text-[10px] leading-none cursor-pointer shadow-sm ${CLEANING_ICON_STYLES[cleaningTask.status] || CLEANING_ICON_DEFAULT}`}
                              title={`Reinigung (${cleaningTask.status})${cleaningTask.scheduled_date ? ' — ' + format(parseLocalDate(cleaningTask.scheduled_date), 'dd.MM.yyyy', { locale: de }) : ''}`}
                              onClick={(e) => { e.stopPropagation(); onCleaningClick?.(cleaningTask); }}
                            >
                              🧹
                            </span>
                          )}
                          {linenOrder && (
                            <span
                              className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center text-[10px] leading-none cursor-pointer shadow-sm ${LINEN_ICON_STYLES[linenOrder.status] || LINEN_ICON_DEFAULT}`}
                              title={`Wäsche (${linenOrder.status})${linenOrder.delivery_date ? ' — ' + format(parseLocalDate(linenOrder.delivery_date), 'dd.MM.yyyy', { locale: de }) : ''}`}
                              onClick={(e) => { e.stopPropagation(); onLinenClick?.(linenOrder); }}
                            >
                              🧺
                            </span>
                          )}
                        </div>
                      )}
                      <div className="truncate flex items-center gap-1 min-w-0">
                        <span className="font-semibold truncate">{firstName}</span>
                        <span className="text-xs opacity-80 shrink-0">({nights}N)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
};

export default BookingTimeline;
