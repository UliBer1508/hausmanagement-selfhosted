import { useMemo, useRef, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';

// Extrahiert lokales Datum aus ISO-String, ignoriert Zeitzone — identisches
// Muster wie in BookingTimeline.tsx (bewusst lokal dupliziert, keine geteilte
// Helper-Datei für dieses Format im Bestand vorhanden).
const parseLocalDate = (isoString: string): Date => {
  const datePart = isoString.substring(0, 10);
  return new Date(datePart + 'T00:00:00');
};

const dateKey = (houseId: string, isoString: string) => `${houseId}|${isoString.substring(0, 10)}`;

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

// Dieselben Haus-Farben wie in BookingTimeline.tsx — macht beide Ansichten
// optisch konsistent und ist unabhängig von Emoji-Unterstützung des Systems.
const HOUSE_DOT_COLOR: Record<string, string> = {
  'Wald Chalet': '#22d3ee',
  'Venedigersiedlung Chalet': '#fbbf24',
};
const HOUSE_DOT_DEFAULT = '#9ca3af';

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

// Reinigung: draft = blasses Icon, sonst voll blau — identisch zu BookingTimeline.tsx.
const CLEANING_ICON_STYLES: Record<string, string> = {
  draft: 'bg-white border-blue-400',
  scheduled: 'bg-blue-600 border-blue-800',
  in_progress: 'bg-blue-600 border-blue-800',
  completed: 'bg-green-600 border-green-800',
  delayed: 'bg-amber-500 border-amber-700',
};
const CLEANING_ICON_DEFAULT = CLEANING_ICON_STYLES.scheduled;

// Wäsche: 'delivered' wird bewusst ANGEZEIGT (grün), nicht ausgeblendet —
// sonst verschwindet jede bereits gelieferte Bestellung aus dem Kalender und
// man kann im Rückblick nicht mehr prüfen, ob rechtzeitig geliefert wurde.
const LINEN_ICON_STYLES: Record<string, string> = {
  offen: 'bg-white border-purple-400',
  ausstehend: 'bg-purple-600 border-purple-800',
  delivered: 'bg-green-600 border-green-800',
};
const LINEN_ICON_DEFAULT = LINEN_ICON_STYLES.offen;

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
  // Drei Monate übereinander (Vormonat/aktueller/Folgemonat) im selben
  // vertikal scrollbaren Bereich — dieselbe Lösung wie im Gantt-Chart, nur
  // auf der senkrechten statt waagerechten Achse.
  const monthsToShow = useMemo(
    () => [subMonths(selectedDate, 1), selectedDate, addMonths(selectedDate, 1)],
    [selectedDate]
  );

  const currentMonthRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentMonthRef.current?.scrollIntoView({ block: 'start' });
  }, [selectedDate]);

  const touristHouses = useMemo(() => houses.filter(h => h.rental_type === 'tourist'), [houses]);
  const activeBookings = useMemo(() => bookings.filter(b => b.status !== 'cancelled'), [bookings]);

  // Anders als im Gantt-Chart (Balken ohne Tagesbezug) hat hier JEDE Zelle
  // genau einen Tag. Reinigung und Wäsche werden deshalb auf ihrem ECHTEN
  // Termin gezeigt (scheduled_date / delivery_date) — die Wäsche kommt
  // typischerweise am Vortag der Anreise, nicht am Anreisetag selbst.
  const cleaningByDay = useMemo(() => {
    const map = new Map<string, ServiceTask>();
    (serviceTasks || []).forEach(t => {
      if (t.service_type === 'cleaning' && t.status !== 'cancelled' && t.scheduled_date) {
        map.set(dateKey(t.house_id, t.scheduled_date), t);
      }
    });
    return map;
  }, [serviceTasks]);

  const linenByDay = useMemo(() => {
    const map = new Map<string, LinenOrder>();
    (linenOrders || []).forEach(o => {
      if (o.status !== 'cancelled' && o.delivery_date) {
        map.set(dateKey(o.house_id, o.delivery_date), o);
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

  const renderMonth = (monthDate: Date, isCurrent: boolean) => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    return (
      <div key={monthDate.toISOString()} ref={isCurrent ? currentMonthRef : undefined} className="mb-6">
        <div className="text-sm font-semibold text-foreground mb-2">
          {format(monthDate, 'MMMM yyyy')}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="mb-2">
            {wi === 0 && (
              <div className="grid gap-1 mb-0.5" style={{ gridTemplateColumns: '72px repeat(7, 1fr)' }}>
                <div />
                {WEEKDAY_LABELS.map(l => (
                  <div key={l} className="text-center text-xs font-medium text-muted-foreground">{l}</div>
                ))}
              </div>
            )}
            <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: '72px repeat(7, 1fr)' }}>
              <div />
              {week.map((d, di) => (
                <div
                  key={di}
                  className={`text-center text-xs ${isSameMonth(d, monthDate) ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}
                >
                  {format(d, 'd')}
                </div>
              ))}
            </div>

            {touristHouses.map(house => {
              const dotColor = HOUSE_DOT_COLOR[house.name] || HOUSE_DOT_DEFAULT;
              return (
                <div key={house.id} className="grid gap-1 items-center mb-1" style={{ gridTemplateColumns: '72px repeat(7, 1fr)' }}>
                  <div className="text-right pr-1.5 text-xs font-semibold text-foreground truncate flex items-center justify-end gap-1.5">
                    <span className="hidden sm:inline">{house.name.replace(' Chalet', '')}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                      style={{ background: dotColor }}
                    />
                  </div>
                  {week.map((date, di) => {
                    if (!isSameMonth(date, monthDate)) {
                      return <div key={di} className="h-9 rounded border border-border/30" />;
                    }
                    const info = getDayInfo(house.id, date);
                    const style = info.status === 'free' ? {} : CELL_STYLE[info.status];
                    const key = dateKey(house.id, format(date, 'yyyy-MM-dd'));
                    const cleaningTask = cleaningByDay.get(key);
                    const linenOrder = linenByDay.get(key);
                    const hasIcons = !!(cleaningTask || linenOrder);

                    const titleText =
                      info.status === 'occupied' ? info.occupying.guest_name
                      : info.status === 'checkin' ? `Anreise: ${info.arriving.guest_name}`
                      : info.status === 'checkout' ? `Abreise: ${info.departing.guest_name}`
                      : info.status === 'changeover' ? `Abreise: ${info.departing.guest_name} / Anreise: ${info.arriving.guest_name}`
                      : 'Frei';

                    return (
                      <div
                        key={di}
                        className={`h-9 rounded relative overflow-hidden ${info.status === 'free' ? 'border border-border' : 'cursor-pointer hover:opacity-90 transition-opacity'}`}
                        style={style}
                        onClick={info.status !== 'free' ? () => handleCellClick(info) : undefined}
                        title={titleText}
                      >
                        {info.status === 'occupied' && (
                          <span
                            className={`absolute inset-0 flex items-center justify-center text-white text-[10px] font-medium truncate ${hasIcons ? 'pl-1 pr-9' : 'px-1'}`}
                          >
                            {info.occupying.guest_name.split(' ')[0]}
                          </span>
                        )}
                        {hasIcons && (
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 z-10">
                            {cleaningTask && (
                              <span
                                className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] leading-none cursor-pointer shadow-sm ${CLEANING_ICON_STYLES[cleaningTask.status] || CLEANING_ICON_DEFAULT}`}
                                onClick={(e) => { e.stopPropagation(); onCleaningClick(cleaningTask); }}
                                title={`Reinigung (${cleaningTask.status}) — ${format(parseLocalDate(cleaningTask.scheduled_date!), 'dd.MM.yyyy')}`}
                              >
                                🧹
                              </span>
                            )}
                            {linenOrder && (
                              <span
                                className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] leading-none cursor-pointer shadow-sm ${LINEN_ICON_STYLES[linenOrder.status] || LINEN_ICON_DEFAULT}`}
                                onClick={(e) => { e.stopPropagation(); onLinenClick(linenOrder); }}
                                title={`Wäsche (${linenOrder.status}) — ${format(parseLocalDate(linenOrder.delivery_date!), 'dd.MM.yyyy')}`}
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
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-card rounded-lg border shadow-sm p-3 sm:p-4">
      <div className="overflow-x-auto overflow-y-auto max-h-[720px]">
        <div style={{ minWidth: '640px' }}>
          {monthsToShow.map((m, i) => renderMonth(m, i === 1))}
        </div>
      </div>
    </div>
  );
};

export default HouseStackedCalendar;
