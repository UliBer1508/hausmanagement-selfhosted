import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { getHouseIcon } from '@/lib/utils';

// Extrahiert lokales Datum aus ISO-String, ignoriert Zeitzone — identisches
// Muster wie in BookingTimeline.tsx (bewusst lokal dupliziert, keine geteilte
// Helper-Datei für dieses Format im Bestand vorhanden).
const parseLocalDate = (isoString: string): Date => {
  const datePart = isoString.substring(0, 10);
  return new Date(datePart + 'T00:00:00');
};

interface Booking {
  id: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  status?: string;
  house_id?: string;
  houses?: { id: string; name: string };
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
}

interface LinenOrder {
  id: string;
  booking_id?: string | null;
  house_id: string;
  status: string;
  delivery_date?: string | null;
}

interface HouseStackedCalendarProps {
  bookings: Booking[];
  houses: House[];
  selectedDate: Date;
  serviceTasks?: ServiceTask[];
  linenOrders?: LinenOrder[];
  onBookingClick: (booking: Booking) => void;
  onChangeoverClick: (departing: Booking, arriving: Booking) => void;
  onCleaningClick: (task: ServiceTask) => void;
  onLinenClick: (order: LinenOrder) => void;
}

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const CELL_STYLE: Record<string, React.CSSProperties> = {
  occupied: { background: '#ef4444' },
  checkin: {
    background: 'linear-gradient(135deg, white 0%, white 42%, #9ca3af 42%, #9ca3af 58%, #ef4444 58%, #ef4444 100%)',
    border: '1px solid #d1d5db',
  },
  checkout: {
    background: 'linear-gradient(135deg, #ef4444 0%, #ef4444 42%, #9ca3af 42%, #9ca3af 58%, white 58%, white 100%)',
    border: '1px solid #d1d5db',
  },
  changeover: {
    background: 'linear-gradient(135deg, #ef4444 0%, #ef4444 42%, #9ca3af 42%, #9ca3af 58%, #ef4444 58%, #ef4444 100%)',
    border: '1px solid #d1d5db',
  },
};

type DayInfo =
  | { status: 'free' }
  | { status: 'occupied'; occupying: Booking }
  | { status: 'checkin'; arriving: Booking }
  | { status: 'checkout'; departing: Booking }
  | { status: 'changeover'; arriving: Booking; departing: Booking };

const HouseStackedCalendar = ({
  bookings,
  houses,
  selectedDate,
  serviceTasks,
  linenOrders,
  onBookingClick,
  onChangeoverClick,
  onCleaningClick,
  onLinenClick,
}: HouseStackedCalendarProps) => {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const weeks = useMemo(() => {
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    return result;
  }, [gridStart, gridEnd]);

  const touristHouses = useMemo(() => houses.filter(h => h.rental_type === 'tourist'), [houses]);
  const activeBookings = useMemo(() => bookings.filter(b => b.status !== 'cancelled'), [bookings]);

  // Reinigung/Wäsche gehören zur ANKOMMENDEN Buchung (booking_id) — dieselbe
  // Zuordnungslogik wie in BookingTimeline.tsx, aus demselben Grund: sie
  // bereiten das Haus für DIESEN Gast vor, nicht während seines Aufenthalts.
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

  const getHouseBookings = (houseId: string) =>
    activeBookings.filter(b => b.house_id === houseId || b.houses?.id === houseId);

  const getDayInfo = (houseId: string, date: Date): DayInfo => {
    const houseBookings = getHouseBookings(houseId);
    const arriving = houseBookings.find(b => isSameDay(parseLocalDate(b.check_in), date));
    const departing = houseBookings.find(b => isSameDay(parseLocalDate(b.check_out), date));
    if (arriving && departing) return { status: 'changeover', arriving, departing };
    if (arriving) return { status: 'checkin', arriving };
    if (departing) return { status: 'checkout', departing };
    const occupying = houseBookings.find(b => {
      const ci = parseLocalDate(b.check_in);
      const co = parseLocalDate(b.check_out);
      return date > ci && date < co;
    });
    if (occupying) return { status: 'occupied', occupying };
    return { status: 'free' };
  };

  const handleCellClick = (info: DayInfo) => {
    if (info.status === 'occupied') onBookingClick(info.occupying);
    else if (info.status === 'checkin') onBookingClick(info.arriving);
    else if (info.status === 'checkout') onBookingClick(info.departing);
    else if (info.status === 'changeover') onChangeoverClick(info.departing, info.arriving);
  };

  return (
    <div className="bg-card rounded-lg border shadow-sm p-3 sm:p-4">
      <div className="overflow-x-auto">
        <div style={{ minWidth: '640px' }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="mb-2">
              {wi === 0 && (
                <div className="grid gap-1 mb-0.5" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
                  <div />
                  {WEEKDAY_LABELS.map(l => (
                    <div key={l} className="text-center text-xs font-medium text-muted-foreground">{l}</div>
                  ))}
                </div>
              )}
              <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
                <div />
                {week.map((d, di) => (
                  <div
                    key={di}
                    className={`text-center text-xs ${isSameMonth(d, selectedDate) ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
                  >
                    {format(d, 'd')}
                  </div>
                ))}
              </div>

              {touristHouses.map(house => (
                <div key={house.id} className="grid gap-1 items-center mb-1" style={{ gridTemplateColumns: '64px repeat(7, 1fr)' }}>
                  <div className="text-right pr-1.5 text-xs text-muted-foreground truncate flex items-center justify-end gap-1">
                    <span>{getHouseIcon(house.name)}</span>
                    <span className="hidden sm:inline">{house.name.replace(' Chalet', '')}</span>
                  </div>
                  {week.map((date, di) => {
                    if (!isSameMonth(date, selectedDate)) {
                      return <div key={di} className="h-8 rounded border border-border/30" />;
                    }
                    const info = getDayInfo(house.id, date);
                    const style = info.status === 'free' ? {} : CELL_STYLE[info.status];
                    const arrivingId = info.status === 'checkin' || info.status === 'changeover' ? info.arriving.id : null;
                    const cleaningTask = arrivingId ? cleaningByBooking.get(arrivingId) : undefined;
                    const linenOrder = arrivingId ? linenByBooking.get(arrivingId) : undefined;

                    const titleText =
                      info.status === 'occupied' ? info.occupying.guest_name
                      : info.status === 'checkin' ? `Anreise: ${info.arriving.guest_name}`
                      : info.status === 'checkout' ? `Abreise: ${info.departing.guest_name}`
                      : info.status === 'changeover' ? `Abreise: ${info.departing.guest_name} / Anreise: ${info.arriving.guest_name}`
                      : 'Frei';

                    return (
                      <div
                        key={di}
                        className={`h-8 rounded relative ${info.status === 'free' ? 'border border-border' : 'cursor-pointer hover:opacity-90 transition-opacity'}`}
                        style={style}
                        onClick={info.status !== 'free' ? () => handleCellClick(info) : undefined}
                        title={titleText}
                      >
                        {info.status === 'occupied' && (
                          <span className="absolute inset-0 flex items-center justify-center text-white text-[9px] font-medium truncate px-0.5">
                            {info.occupying.guest_name.split(' ')[0]}
                          </span>
                        )}
                        {(cleaningTask || linenOrder) && (
                          <div className="absolute top-0 right-0 flex flex-col leading-none z-10">
                            {cleaningTask && (
                              <span
                                className="text-[8px] bg-white rounded-sm px-px cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); onCleaningClick(cleaningTask); }}
                                title={`Reinigung (${cleaningTask.status})`}
                              >
                                🧹
                              </span>
                            )}
                            {linenOrder && (
                              <span
                                className="text-[8px] bg-white rounded-sm px-px cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); onLinenClick(linenOrder); }}
                                title={`Wäsche (${linenOrder.status})`}
                              >
                                🧺
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HouseStackedCalendar;
