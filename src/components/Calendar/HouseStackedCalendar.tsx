import { useMemo, useRef, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { getHouseColors } from '@/lib/utils';

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
  /** 'month' (Standard) = Monatsraster, 'year' = Jahresübersicht mit 12 Kacheln. */
  viewMode?: 'month' | 'year';
  /** Klick auf eine Monatskachel in der Jahresübersicht. */
  onSelectMonth?: (monthStart: Date) => void;
  onBookingClick: (booking: Booking) => void;
  onChangeoverClick: (departing: Booking, arriving: Booking) => void;
  onCleaningClick: (task: ServiceTask, guestName?: string) => void;
  onLinenClick: (order: LinenOrder, guestName?: string) => void;
}

// Zellfarben je Haus — Vollton = belegt, diagonal geteilt = An-/Abreise bzw.
// Wechseltag (Muster von der Website übernommen). Die Hausfarbe kommt aus
// getHouseColors() in @/lib/utils, damit Timeline und Monatsansicht IMMER
// dieselbe Farbe zeigen und der Abgleich nur an einer Stelle gepflegt wird.
const getCellStyle = (status: string, base: string, border: string): React.CSSProperties => {
  switch (status) {
    case 'occupied':
      return { background: base, border: `1px solid ${border}` };
    case 'checkin':
      return {
        background: `linear-gradient(135deg, white 0%, white 42%, #9ca3af 42%, #9ca3af 58%, ${base} 58%, ${base} 100%)`,
        border: `1px solid ${border}`,
      };
    case 'checkout':
      return {
        background: `linear-gradient(135deg, ${base} 0%, ${base} 42%, #9ca3af 42%, #9ca3af 58%, white 58%, white 100%)`,
        border: `1px solid ${border}`,
      };
    case 'changeover':
      return {
        background: `linear-gradient(135deg, ${base} 0%, ${base} 42%, #9ca3af 42%, #9ca3af 58%, ${base} 58%, ${base} 100%)`,
        border: `1px solid ${border}`,
      };
    default:
      return {};
  }
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
  viewMode = 'month',
  onSelectMonth,
  onBookingClick,
  onChangeoverClick,
  onCleaningClick,
  onLinenClick,
}: HouseStackedCalendarProps) => {
  const shownYear = selectedDate.getFullYear();

  // Monatsansicht zeigt das GANZE gewählte Jahr (Januar bis Dezember) in einem
  // vertikal scrollbaren Bereich. Vorher waren es drei feste Monate; damit war
  // ein weiter entfernter Monat nur durch wiederholtes Klicken erreichbar.
  // Die Begrenzung auf ein Jahr ist Absicht: kein Nachladen ohne Ende, feste
  // Anzahl Monate im DOM. Ein anderes Jahr wird über die Jahresübersicht bzw.
  // die Jahres-Pfeile in CalendarTab gewählt.
  const monthsToShow = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(shownYear, i, 1)),
    [shownYear]
  );

  const currentMonthRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewMode !== 'month') return;
    currentMonthRef.current?.scrollIntoView({ block: 'start' });
  }, [selectedDate, viewMode]);

  const touristHouses = useMemo(() => houses.filter(h => h.rental_type === 'tourist'), [houses]);
  const activeBookings = useMemo(() => bookings.filter(b => b.status !== 'cancelled'), [bookings]);

  // ZUORDNUNG UEBER DIE BUCHUNG (27.07.2026, Vorgabe Uli):
  // Reinigung und Waesche gehoeren fachlich zu EINER Buchung. Die Reinigung wird
  // automatisch auf den Check-in-Tag gelegt, die Waesche davor geliefert. Beide
  // Icons sitzen deshalb im ERSTEN Kaestchen der Buchung (Anreisetag) — wie am
  // Balken in der Timeline — und NICHT verstreut auf ihren Kalendertagen.
  // Das echte Datum steht im Tooltip und im Popup.
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
      if (o.status !== 'cancelled' && o.booking_id) {
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

  // ---------------------------------------------------------------------------
  // JAHRESÜBERSICHT
  // Zwölf Kacheln, je Kachel ein Streifen pro Haus mit einem Feld pro Tag.
  // Bewusst DIESELBE getDayInfo() wie das Monatsraster — eine zweite
  // Belegungslogik waere ein Doppelgaenger auf Logikebene (CODE-INDEX 9b).
  // ---------------------------------------------------------------------------
  const renderYear = () => {
    const monthLabel = (m: Date) => format(m, 'MMMM', { locale: de });

    return (
      <div className="bg-card rounded-lg border shadow-sm p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {monthsToShow.map(monthDate => {
            const days = eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });
            const isCurrent = isSameMonth(monthDate, selectedDate);

            return (
              <div
                key={monthDate.toISOString()}
                role="button"
                tabIndex={0}
                aria-label={`${monthLabel(monthDate)} ${shownYear} öffnen`}
                onClick={() => onSelectMonth?.(monthDate)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectMonth?.(monthDate);
                  }
                }}
                className={`rounded-lg border p-3 sm:p-4 cursor-pointer transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary ${
                  isCurrent ? 'border-primary bg-primary/5' : 'border-border bg-background'
                }`}
              >
                <div className="text-base sm:text-lg font-bold text-foreground mb-2 sm:mb-3">
                  {monthLabel(monthDate)}
                </div>

                {touristHouses.map(house => {
                  const hc = getHouseColors(house.name);
                  const freeCount = days.filter(d => getDayInfo(house.id, d).status === 'free').length;

                  return (
                    <div key={house.id} className="mb-2 last:mb-0">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                            style={{ background: hc.base }}
                          />
                          {house.name.replace(' Chalet', '')}
                        </span>
                        <span>{freeCount} Tage frei</span>
                      </div>
                      <div className="flex gap-px">
                        {days.map(d => {
                          const status = getDayInfo(house.id, d).status;
                          const isFree = status === 'free';
                          const isPartial = status === 'checkin' || status === 'checkout' || status === 'changeover';
                          return (
                            <div
                              key={d.toISOString()}
                              className={`flex-1 h-4 sm:h-5 rounded-sm ${isFree ? 'border border-border bg-muted/40' : ''}`}
                              style={isFree ? undefined : { background: hc.base, opacity: isPartial ? 0.5 : 1 }}
                              title={`${format(d, 'dd.MM.yyyy')} — ${isFree ? 'frei' : isPartial ? 'An-/Abreise' : 'belegt'}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
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
        <div className="text-base sm:text-lg font-bold text-foreground mb-2 sm:mb-3">
          {format(monthDate, 'MMMM yyyy', { locale: de })}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="mb-2">
            <div className="grid gap-0.5 sm:gap-1 mb-1 grid-cols-[repeat(7,minmax(0,1fr))] sm:grid-cols-[104px_repeat(7,minmax(0,1fr))]">
              <div className="hidden sm:block" />
              {week.map((d, di) => (
                <div key={di} className="text-center leading-tight">
                  <div className={`text-xs font-semibold ${isSameMonth(d, monthDate) ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                    {format(d, 'EEEEEE', { locale: de })}
                  </div>
                  <div className={`text-xs ${isSameMonth(d, monthDate) ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
                    {format(d, 'd')}
                  </div>
                </div>
              ))}
            </div>

            {touristHouses.map(house => {
              const hc = getHouseColors(house.name);
              return (
                <div key={house.id} className="mb-1">
                  {/* Handy: Hausname ueber der Zeile, damit die volle Breite fuer
                      die sieben Tage bleibt (kein Querscrollen, CODING-GUIDE B4). */}
                  <div className="sm:hidden flex items-center gap-1.5 mb-0.5 text-xs font-semibold text-foreground">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                      style={{ background: hc.base }}
                    />
                    <span className="truncate">{house.name.replace(' Chalet', '')}</span>
                  </div>
                  <div className="grid gap-0.5 sm:gap-1 items-center grid-cols-[repeat(7,minmax(0,1fr))] sm:grid-cols-[104px_repeat(7,minmax(0,1fr))]">
                    <div className="hidden sm:flex text-right pr-2 text-sm font-semibold text-foreground truncate items-center justify-end gap-1.5">
                    <span className="truncate">{house.name.replace(' Chalet', '')}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                      style={{ background: hc.base }}
                    />
                  </div>
                  {week.map((date, di) => {
                    if (!isSameMonth(date, monthDate)) {
                      return <div key={di} className="h-9 sm:h-10 rounded border border-border/30" />;
                    }
                    const info = getDayInfo(house.id, date);
                    const style = getCellStyle(info.status, hc.base, hc.border);
                    // Icons NUR im Anreise-Kaestchen (auch am Wechseltag:
                    // dort gehoeren sie zur ankommenden Buchung).
                    const arriving =
                      info.status === 'checkin' ? info.arriving
                      : info.status === 'changeover' ? info.arriving
                      : null;
                    const cleaningTask = arriving ? cleaningByBooking.get(arriving.id) : undefined;
                    const linenOrder = arriving ? linenByBooking.get(arriving.id) : undefined;
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
                        className={`h-9 sm:h-10 rounded relative overflow-hidden ${info.status === 'free' ? 'border border-border' : 'cursor-pointer hover:opacity-90 transition-opacity'}`}
                        style={style}
                        onClick={info.status !== 'free' ? () => handleCellClick(info) : undefined}
                        title={titleText}
                      >
                        {info.status === 'occupied' && (
                          <span
                            className={`absolute inset-0 flex items-center justify-center text-[9px] sm:text-[11px] font-medium truncate ${hasIcons ? 'pl-0.5 pr-8 sm:pl-1 sm:pr-11' : 'px-0.5 sm:px-1'}`}
                            style={{ color: hc.text }}
                          >
                            {info.occupying.guest_name.split(' ')[0]}
                          </span>
                        )}
                        {hasIcons && (
                          <div className="absolute right-0.5 sm:right-1 top-1/2 -translate-y-1/2 flex gap-0.5 z-10">
                            {cleaningTask && (
                              <span
                                className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border flex items-center justify-center text-[9px] sm:text-[11px] leading-none cursor-pointer shadow-sm ${CLEANING_ICON_STYLES[cleaningTask.status] || CLEANING_ICON_DEFAULT}`}
                                onClick={(e) => { e.stopPropagation(); onCleaningClick(cleaningTask, arriving?.guest_name); }}
                                title={`Reinigung · ${arriving?.guest_name ?? ''} · ${cleaningTask.status}${cleaningTask.scheduled_date ? ' · ' + format(parseLocalDate(cleaningTask.scheduled_date), 'dd.MM.yyyy') : ''}`}
                              >
                                🧹
                              </span>
                            )}
                            {linenOrder && (
                              <span
                                className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border flex items-center justify-center text-[9px] sm:text-[11px] leading-none cursor-pointer shadow-sm ${LINEN_ICON_STYLES[linenOrder.status] || LINEN_ICON_DEFAULT}`}
                                onClick={(e) => { e.stopPropagation(); onLinenClick(linenOrder, arriving?.guest_name); }}
                                title={`Wäsche · ${arriving?.guest_name ?? ''} · ${linenOrder.status}${linenOrder.delivery_date ? ' · Lieferung ' + format(parseLocalDate(linenOrder.delivery_date), 'dd.MM.yyyy') : ''}`}
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
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  if (viewMode === 'year') return renderYear();

  return (
    <div className="bg-card rounded-lg border shadow-sm p-3 sm:p-4">
      <div className="overflow-y-auto max-h-[560px] sm:max-h-[720px]">
        {monthsToShow.map(m => renderMonth(m, isSameMonth(m, selectedDate)))}
        <div className="text-center text-xs text-muted-foreground py-2">
          Ende {shownYear} — anderes Jahr über die Jahresübersicht wählen
        </div>
      </div>
    </div>
  );
};

export default HouseStackedCalendar;
