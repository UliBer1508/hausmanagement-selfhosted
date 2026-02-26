import { useMemo } from 'react';
import { format, differenceInDays, addDays, startOfMonth, getDaysInMonth, isSameDay } from 'date-fns';

// Extrahiert lokales Datum aus ISO-String, ignoriert Zeitzone
// "2026-02-22 09:00:00+00" → new Date("2026-02-22T00:00:00") = lokale Mitternacht
const parseLocalDate = (isoString: string): Date => {
  const datePart = isoString.substring(0, 10);
  return new Date(datePart + 'T00:00:00');
};
import { de } from 'date-fns/locale';
import { getHouseIcon } from '@/lib/utils';

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

interface BookingTimelineProps {
  bookings: Booking[];
  houses: House[];
  selectedDate: Date;
  onBookingClick: (booking: Booking) => void;
}

// Haus-spezifische Farben
const HOUSE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Wald Chalet': { 
    bg: 'bg-cyan-400', 
    border: 'border-cyan-600',
    text: 'text-white'
  },
  'Venedigersiedlung Chalet': { 
    bg: 'bg-amber-400', 
    border: 'border-amber-600',
    text: 'text-white'
  },
  'default': {
    bg: 'bg-gray-400',
    border: 'border-gray-600',
    text: 'text-white'
  }
};

const DAY_WIDTH = 28; // px — identisch zu w-7 (7 × 4px = 28px), muss mit Grid übereinstimmen

const BookingTimeline = ({ bookings, houses, selectedDate, onBookingClick }: BookingTimelineProps) => {
  const startDate = startOfMonth(selectedDate);
  const daysInMonth = getDaysInMonth(selectedDate);
  
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
    const monthStart = new Date(format(startDate, 'yyyy-MM-dd') + 'T00:00:00');
    const monthEnd = new Date(format(addDays(startDate, daysInMonth), 'yyyy-MM-dd') + 'T00:00:00');

    const barStart = checkIn < monthStart ? monthStart : checkIn;
    const barEnd = checkOut > monthEnd ? monthEnd : checkOut;

    // +0.5 nur wenn check_in/out innerhalb des sichtbaren Monats liegt (nicht geclampt)
    const isCheckInInMonth = checkIn >= monthStart && checkIn < monthEnd;
    const isCheckOutInMonth = checkOut > monthStart && checkOut < monthEnd;

    const startOffsetDays = differenceInDays(barStart, monthStart);
    const endOffsetDays = differenceInDays(barEnd, monthStart);

    const startPx = (startOffsetDays + (isCheckInInMonth ? 0.5 : 0)) * DAY_WIDTH + (isCheckInInMonth ? 2 : 0);
    const endPx = (endOffsetDays + (isCheckOutInMonth ? 0.5 : 0)) * DAY_WIDTH - (isCheckOutInMonth ? 2 : 0);

    return {
      left: `${startPx}px`,
      width: `${Math.max(endPx - startPx, DAY_WIDTH * 0.5)}px`
    };
  };

  // Prüfe ob Buchung in diesem Monat sichtbar ist
  const isBookingVisible = (booking: Booking) => {
    const checkIn = parseLocalDate(booking.check_in);
    const checkOut = parseLocalDate(booking.check_out);
    const monthStart = new Date(format(startDate, 'yyyy-MM-dd') + 'T00:00:00');
    // monthEnd = Anfang des nächsten Monats = Ende des letzten Tages
    const monthEnd = new Date(format(addDays(startDate, daysInMonth), 'yyyy-MM-dd') + 'T00:00:00');
    
    // Buchung ist sichtbar wenn sie den Monat überlappt
    return checkIn <= monthEnd && checkOut >= monthStart;
  };

  // Berechne Anzahl Nächte
  const getNights = (booking: Booking) => {
    const checkIn = parseLocalDate(booking.check_in);
    const checkOut = parseLocalDate(booking.check_out);
    return differenceInDays(checkOut, checkIn);
  };

  return (
    <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        {/* Header mit Tagen */}
        <div className="flex border-b sticky top-0 bg-card z-10">
          {/* Haus-Spalte - sticky für horizontales Scrollen */}
          <div className="w-32 md:w-40 shrink-0 p-2 md:p-3 font-medium border-r bg-muted/50 text-foreground sticky left-0 z-20">
            Objekt
          </div>
          {/* Tages-Header mit fester Mindestbreite */}
          <div className="flex" style={{ minWidth: `${daysInMonth * 28}px` }}>
            {Array.from({ length: daysInMonth }, (_, i) => {
              const date = addDays(startDate, i);
              const isToday = isSameDay(date, new Date());
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              
              return (
                <div 
                  key={i} 
                  className={`
                    w-7 shrink-0 text-center text-xs p-1 border-r
                    ${isToday ? 'bg-primary/20 font-bold' : ''}
                    ${isWeekend ? 'bg-muted/30' : ''}
                  `}
                >
                  <div className="font-medium text-foreground">{format(date, 'd')}</div>
                  <div className="text-muted-foreground text-[10px]">
                    {format(date, 'EEE', { locale: de })}
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
          const colors = HOUSE_COLORS[house.name] || HOUSE_COLORS.default;
          const maxOverlaps = getMaxOverlaps(houseBookings);
          const containerHeight = 64 + maxOverlaps; // Basis 64px + Überlappungen
          
          return (
            <div 
              key={house.id} 
              className={`flex relative ${houseIndex % 2 === 0 ? 'bg-card' : 'bg-muted/20'}`}
            >
              {/* Haus-Name - sticky für horizontales Scrollen */}
              <div className="w-32 md:w-40 shrink-0 p-2 md:p-3 font-medium border-r flex items-center gap-2 bg-muted/30 sticky left-0 z-10">
                <span className="text-lg">{getHouseIcon(house.name)}</span>
                <span className="text-sm text-foreground truncate">
                  {house.name.replace(' Chalet', '')}
                </span>
              </div>
              
              {/* Timeline-Bereich mit Buchungs-Balken */}
              <div 
                className="relative"
                style={{ height: `${containerHeight}px`, minHeight: '64px', minWidth: `${daysInMonth * 28}px` }}
              >
                {/* Hintergrund-Raster */}
                <div className="absolute inset-0 flex" style={{ minWidth: `${daysInMonth * 28}px` }}>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const date = addDays(startDate, i);
                    const isToday = isSameDay(date, new Date());
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    
                    return (
                      <div 
                        key={i}
                        className={`
                          w-7 shrink-0 border-r border-border/50
                          ${isToday ? 'bg-primary/10' : ''}
                          ${isWeekend && !isToday ? 'bg-muted/20' : ''}
                        `}
                      />
                    );
                  })}
                </div>
                
                {/* Buchungs-Balken */}
                {houseBookings.map((booking, bookingIndex) => {
                  const style = getBarStyle(booking);
                  const nights = getNights(booking);
                  const firstName = booking.guest_name.split(' ')[0];
                  const verticalOffset = getVerticalOffset(bookingIndex, houseBookings);
                  
                  return (
                    <div
                      key={booking.id}
                      className={`
                        absolute h-10 ${colors.bg} ${colors.text} ${colors.border}
                        rounded-lg px-2 flex items-center text-sm font-medium 
                        cursor-pointer hover:opacity-90 shadow-md border-2
                        transition-all duration-150 hover:scale-[1.02] hover:z-10
                      `}
                      style={{ 
                        left: style.left, 
                        width: style.width,
                        minWidth: '45px',
                        top: `${8 + verticalOffset}px`
                      }}
                      onClick={() => onBookingClick(booking)}
                      title={`${booking.guest_name} - ${nights} Nächte (${booking.number_of_guests} Gäste)`}
                    >
                      <div className="truncate flex items-center gap-1">
                        <span className="font-semibold">{firstName}</span>
                        <span className="text-xs opacity-80">({nights}N)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Legende */}
        <div className="flex flex-wrap gap-4 p-4 border-t bg-muted/30">
          <div className="text-sm text-muted-foreground font-medium">Legende:</div>
          {touristHouses.map(house => {
            const colors = HOUSE_COLORS[house.name] || HOUSE_COLORS.default;
            return (
              <div key={house.id} className="flex items-center gap-2">
                <div className={`w-6 h-4 ${colors.bg} rounded border ${colors.border}`} />
                <span className="text-sm text-foreground">{house.name}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-2 ml-4">
            <div className="w-6 h-4 bg-primary/20 rounded border border-primary" />
            <span className="text-sm text-muted-foreground">Heute</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingTimeline;
