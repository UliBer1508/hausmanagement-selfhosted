import { useMemo } from 'react';
import { format, parseISO, differenceInDays, addDays, startOfMonth, getDaysInMonth, isSameDay, isWithinInterval, startOfDay } from 'date-fns';
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

  // Berechne Position und Breite des Buchungs-Balkens
  const getBarStyle = (booking: Booking) => {
    const checkIn = startOfDay(parseISO(booking.check_in));
    const checkOut = startOfDay(parseISO(booking.check_out));
    const monthStart = startOfDay(startDate);
    const monthEnd = startOfDay(addDays(startDate, daysInMonth - 1));
    
    // Clamp to month boundaries
    const barStart = checkIn < monthStart ? monthStart : checkIn;
    const barEnd = checkOut > monthEnd ? monthEnd : checkOut;
    
    // Berechne Offset vom Monatsanfang
    const startOffset = differenceInDays(barStart, monthStart);
    const duration = differenceInDays(barEnd, barStart);
    
    // Prozentuale Position (jeder Tag = 100/daysInMonth %)
    const dayWidth = 100 / daysInMonth;
    const left = startOffset * dayWidth;
    const width = Math.max(duration * dayWidth, dayWidth); // Mindestens 1 Tag breit
    
    return {
      left: `${left}%`,
      width: `${width}%`
    };
  };

  // Prüfe ob Buchung in diesem Monat sichtbar ist
  const isBookingVisible = (booking: Booking) => {
    const checkIn = startOfDay(parseISO(booking.check_in));
    const checkOut = startOfDay(parseISO(booking.check_out));
    const monthStart = startOfDay(startDate);
    const monthEnd = startOfDay(addDays(startDate, daysInMonth - 1));
    
    // Buchung ist sichtbar wenn sie den Monat überlappt
    return checkIn <= monthEnd && checkOut >= monthStart;
  };

  // Berechne Anzahl Nächte
  const getNights = (booking: Booking) => {
    const checkIn = parseISO(booking.check_in);
    const checkOut = parseISO(booking.check_out);
    return differenceInDays(checkOut, checkIn);
  };

  return (
    <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        {/* Header mit Tagen */}
        <div className="flex border-b sticky top-0 bg-card z-10">
          {/* Haus-Spalte */}
          <div className="w-40 shrink-0 p-3 font-medium border-r bg-muted/50 text-foreground">
            Objekt
          </div>
          {/* Tages-Header */}
          <div className="flex flex-1">
            {Array.from({ length: daysInMonth }, (_, i) => {
              const date = addDays(startDate, i);
              const isToday = isSameDay(date, new Date());
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              
              return (
                <div 
                  key={i} 
                  className={`
                    flex-1 min-w-[32px] text-center text-xs p-1 border-r
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
          const houseBookings = activeBookings.filter(
            b => (b.house_id === house.id || b.houses?.id === house.id) && isBookingVisible(b)
          );
          const colors = HOUSE_COLORS[house.name] || HOUSE_COLORS.default;
          
          return (
            <div 
              key={house.id} 
              className={`flex relative ${houseIndex % 2 === 0 ? 'bg-card' : 'bg-muted/20'}`}
            >
              {/* Haus-Name */}
              <div className="w-40 shrink-0 p-3 font-medium border-r flex items-center gap-2 bg-muted/30">
                <span className="text-lg">{getHouseIcon(house.name)}</span>
                <span className="text-sm text-foreground truncate">
                  {house.name.replace(' Chalet', '')}
                </span>
              </div>
              
              {/* Timeline-Bereich mit Buchungs-Balken */}
              <div className="flex-1 relative h-16 min-h-[64px]">
                {/* Hintergrund-Raster */}
                <div className="absolute inset-0 flex">
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const date = addDays(startDate, i);
                    const isToday = isSameDay(date, new Date());
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    
                    return (
                      <div 
                        key={i}
                        className={`
                          flex-1 min-w-[32px] border-r border-border/50
                          ${isToday ? 'bg-primary/10' : ''}
                          ${isWeekend && !isToday ? 'bg-muted/20' : ''}
                        `}
                      />
                    );
                  })}
                </div>
                
                {/* Buchungs-Balken */}
                {houseBookings.map(booking => {
                  const style = getBarStyle(booking);
                  const nights = getNights(booking);
                  const firstName = booking.guest_name.split(' ')[0];
                  
                  return (
                    <div
                      key={booking.id}
                      className={`
                        absolute top-2 h-12 ${colors.bg} ${colors.text} ${colors.border}
                        rounded-lg px-2 flex items-center text-sm font-medium 
                        cursor-pointer hover:opacity-90 shadow-md border-2
                        transition-all duration-150 hover:scale-[1.02] hover:z-10
                      `}
                      style={{ 
                        left: style.left, 
                        width: style.width,
                        minWidth: '60px'
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
