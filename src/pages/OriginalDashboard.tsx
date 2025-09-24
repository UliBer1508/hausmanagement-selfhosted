import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { 
  Home, 
  Calendar as CalendarIcon, 
  Users, 
  Building, 
  Sparkles, 
  Shirt, 
  Search,
  RefreshCw,
  Clock,
  X,
  Edit,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, isSameDay, parseISO, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import steinbockLogo from '@/assets/steinbock-logo.png';

const OriginalDashboard = () => {
  const [activeTab, setActiveTab] = useState('Übersicht');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');

  const tabs = [
    'Übersicht', 'Kalender', 'Buchungen', 'Gäste', 'Häuser', 'Services', 'Provider', 'Wäsche'
  ];

  const houses = [
    { name: 'Venedig', status: 'Frei', icon: '🏘️' },
    { name: 'Wald', status: 'Frei', icon: '🏔️' }
  ];

  const activeBookings = [
    { house: 'Wald', guest: 'Dr', date: '12.10.', icon: '🏔️' },
    { house: 'Wald', guest: 'Anke', date: '20.12.', icon: '🏔️' }
  ];

  const cleaningTasks = [
    { house: 'Wald', guest: 'Dr', date: '10.10.', count: 1, icon: '🏔️' },
    { house: 'Wald', guest: 'Anke', date: '19.12.', count: 1, icon: '🏔️' }
  ];

  const laundryNeeds = [
    { name: 'Wald Chalet', status: 'Kritisch' },
    { name: 'Venedigersiedlung', status: 'Kritisch' }
  ];

  const bookings = [
    {
      id: 1,
      guest: 'Dr Daniel Mirtschink (DE)',
      house: 'Wald Chalet',
      dates: '12.10.2025 - 18.10.2025',
      checkIn: '2025-10-12',
      checkOut: '2025-10-18',
      status: 'Bestätigt',
      guests: 5,
      cleaning: { date: '2025-10-10', provider: 'Amela', status: 'Geplant' },
      borderColor: 'green'
    },
    {
      id: 2,
      guest: 'Anke Wiggers',
      house: 'Wald Chalet',
      dates: '20.12.2025 - 27.12.2025',
      checkIn: '2025-12-20',
      checkOut: '2025-12-27',
      status: 'Bestätigt',
      guests: 5,
      cleaning: { date: '2025-12-19', provider: 'Amela', status: 'Geplant' },
      borderColor: 'blue'
    },
    {
      id: 3,
      guest: 'Antonio Peñera',
      house: 'Venedigersiedlung Chalet',
      dates: '21.12.2025 - 26.12.2025',
      checkIn: '2025-12-21',
      checkOut: '2025-12-26',
      status: 'Bestätigt',
      guests: 5,
      cleaning: { date: '2025-12-20', provider: 'Amela', status: 'Geplant' },
      borderColor: 'purple'
    }
  ];

  const getEventsForDate = (date: Date) => {
    const events = [];
    
    // Buchungen
    bookings.forEach(booking => {
      const checkIn = parseISO(booking.checkIn);
      const checkOut = parseISO(booking.checkOut);
      
      if (isSameDay(date, checkIn)) {
        events.push({
          type: 'checkin',
          title: `Check-in: ${booking.guest.split(' ')[0]}`,
          booking: booking,
          color: 'bg-green-100 text-green-800'
        });
      }
      
      if (isSameDay(date, checkOut)) {
        events.push({
          type: 'checkout',
          title: `Check-out: ${booking.guest.split(' ')[0]}`,
          booking: booking,
          color: 'bg-red-100 text-red-800'
        });
      }
      
      // Reinigungstermine
      if (booking.cleaning.date && isSameDay(date, parseISO(booking.cleaning.date))) {
        events.push({
          type: 'cleaning',
          title: `🧹 Reinigung ${booking.house.split(' ')[0]}`,
          booking: booking,
          color: 'bg-blue-100 text-blue-800'
        });
      }
    });
    
    return events;
  };

  const renderCalendarView = () => {
    return (
      <div className="space-y-6">
        {/* Calendar Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {format(selectedDate, 'MMMM yyyy', { locale: de })}
            </h2>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, -30))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(new Date())}
              >
                Heute
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedDate(addDays(selectedDate, 30))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex space-x-2">
            <Button
              variant={calendarView === 'month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCalendarView('month')}
            >
              Monat
            </Button>
            <Button
              variant={calendarView === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCalendarView('week')}
            >
              Woche
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-3">
            <Card className="dashboard-card">
              <CardContent className="p-6">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  locale={de}
                  className="pointer-events-auto w-full"
                  classNames={{
                    months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                    month: "space-y-4 w-full",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-lg font-semibold",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-8 w-8 bg-transparent p-0 opacity-50 hover:opacity-100",
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex w-full",
                    head_cell: "text-muted-foreground rounded-md w-full font-normal text-sm",
                    row: "flex w-full mt-2",
                    cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50",
                    day: "h-16 w-full p-1 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex flex-col items-start justify-start",
                    day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground font-semibold",
                    day_outside: "day-outside text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50",
                  }}
                  components={{
                    DayContent: ({ date }) => {
                      const events = getEventsForDate(date);
                      return (
                        <div className="w-full h-full flex flex-col">
                          <div className="font-medium text-sm mb-1">
                            {format(date, 'd')}
                          </div>
                          <div className="flex-1 space-y-1 w-full">
                            {events.slice(0, 2).map((event, index) => (
                              <div
                                key={index}
                                className={`text-xs px-1 py-0.5 rounded ${event.color} truncate w-full`}
                                title={event.title}
                              >
                                {event.title}
                              </div>
                            ))}
                            {events.length > 2 && (
                              <div className="text-xs text-gray-500">
                                +{events.length - 2}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                  }}
                />
              </CardContent>
            </Card>
          </div>

          {/* Events Sidebar */}
          <div className="space-y-4">
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  Termine für {format(selectedDate, 'dd. MMMM', { locale: de })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {getEventsForDate(selectedDate).length > 0 ? (
                  <div className="space-y-2">
                    {getEventsForDate(selectedDate).map((event, index) => (
                      <div key={index} className="p-2 rounded-lg bg-gray-50">
                        <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${event.color}`}>
                          {event.title}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {event.booking.house}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Keine Termine für diesen Tag</p>
                )}
              </CardContent>
            </Card>

            {/* Legend */}
            <Card className="dashboard-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Legende</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-green-100 rounded"></div>
                  <span className="text-sm">Check-in</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-red-100 rounded"></div>
                  <span className="text-sm">Check-out</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-blue-100 rounded"></div>
                  <span className="text-sm">Reinigung</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Übersicht':
        return renderOverviewContent();
      case 'Kalender':
        return renderCalendarView();
      case 'Buchungen':
        return (
          <div className="text-center py-12">
            <Home className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Buchungen</h3>
            <p className="text-gray-600">Buchungsmanagement wird hier angezeigt</p>
          </div>
        );
      case 'Gäste':
        return (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Gäste</h3>
            <p className="text-gray-600">Gästeverwaltung wird hier angezeigt</p>
          </div>
        );
      case 'Häuser':
        return (
          <div className="text-center py-12">
            <Building className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Häuser</h3>
            <p className="text-gray-600">Hausverwaltung wird hier angezeigt</p>
          </div>
        );
      case 'Services':
        return (
          <div className="text-center py-12">
            <Sparkles className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Services</h3>
            <p className="text-gray-600">Service-Management wird hier angezeigt</p>
          </div>
        );
      case 'Provider':
        return (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Provider</h3>
            <p className="text-gray-600">Provider-Verwaltung wird hier angezeigt</p>
          </div>
        );
      case 'Wäsche':
        return (
          <div className="text-center py-12">
            <Shirt className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Wäsche</h3>
            <p className="text-gray-600">Wäscheverwaltung wird hier angezeigt</p>
          </div>
        );
      default:
        return renderOverviewContent();
    }
  };

  const renderOverviewContent = () => {
    return (
      <div>
        {/* Search and Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Nach Gast oder Haus suchen..."
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option>Alle anzeigen</option>
              </select>
              <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option>Alle Status</option>
              </select>
              <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option>Alle Häuser</option>
              </select>
              <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option>Nächsten 3 Monate</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bookings Section */}
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Buchungen mit verknüpften Aufträgen
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Übersicht über Buchungen und ihre zugehörigen Service-Aufträge und Wäschebestellungen (inkl. abgeschlossene)
            </p>
            
            <div className="space-y-4">
              {bookings.map((booking) => (
                <Card key={booking.id} className={`booking-card-${booking.borderColor}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-900">{booking.guest}</h3>
                          <Button variant="ghost" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">{booking.house}</p>
                        <p className="text-sm text-gray-600 mb-1">{booking.dates}</p>
                        <div className="flex items-center gap-4">
                          <Badge className="status-free">{booking.status}</Badge>
                          <span className="text-sm text-gray-600">👤 {booking.guests}</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Bearbeiten
                      </Button>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Badge className="service-badge-cleaning">
                            🧹 Reinigung
                          </Badge>
                          <Badge variant="outline">{booking.cleaning.status}</Badge>
                        </div>
                        <span className="text-sm text-gray-600">{format(parseISO(booking.cleaning.date), 'dd.MM.yyyy')}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <p>Provider: {booking.cleaning.provider}</p>
                        <p>👤 Putzkraft: {booking.cleaning.provider}</p>
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-gray-500">
                      Keine Wäschebestellungen
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Empty States */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Service-Aufträge ohne Buchung</CardTitle>
                <p className="text-sm text-gray-600">
                  Aufträge die keiner Buchung zugeordnet sind (inkl. abgeschlossene)
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-center text-gray-500 py-8">Keine unverbundenen Aufträge</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Wäschebestellungen ohne Buchung</CardTitle>
                <p className="text-sm text-gray-600">
                  Bestellungen die keiner Buchung zugeordnet sind (inkl. abgeschlossene)
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-center text-gray-500 py-8">Keine unverbundenen Bestellungen</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src={steinbockLogo} alt="Steinbock Logo" className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Ferienhaus Management</h1>
              <p className="text-sm text-gray-600">Übersicht über Buchungen, Services und Wäschelogistik</p>
            </div>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Dashboard Cards */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Ferienhäuser */}
          <Card className="dashboard-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <Home className="w-4 h-4 mr-2 text-orange-500" />
                Ferienhäuser (2)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {houses.map((house, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">{house.icon}</span>
                    <span className="text-sm font-medium">{house.name}</span>
                  </div>
                  <span className="status-free">🟢{house.status}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Aktive Buchungen */}
          <Card className="dashboard-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                <Home className="w-4 h-4 mr-2 text-orange-500" />
                Aktive Buchungen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeBookings.map((booking, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm">
                    {booking.icon}{booking.house} • {booking.guest} • {booking.date}
                  </span>
                  <span className="status-pending">📅Anstehend</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Reinigungsaufträge */}
          <Card className="dashboard-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                📋 Reinigungsaufträge
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cleaningTasks.map((task, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm">
                    {task.icon}{task.house} • {task.guest} • {task.date} • {task.count}🧹
                  </span>
                  <Clock className="w-4 h-4 text-orange-500" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Wäschebedarf */}
          <Card className="dashboard-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center">
                🧺 Wäschebedarf
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {laundryNeeds.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm">{item.name}</span>
                  <div className="flex items-center text-red-600">
                    <X className="w-4 h-4 mr-1" />
                    <span className="text-sm font-medium">{item.status}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={tab === activeTab ? 'nav-tab-active' : 'nav-tab'}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="animate-fade-in">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default OriginalDashboard;