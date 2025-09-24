import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Home, 
  Calendar, 
  Users, 
  Building, 
  Sparkles, 
  Shirt, 
  Search,
  RefreshCw,
  Clock,
  X,
  Edit
} from 'lucide-react';
import steinbockLogo from '@/assets/steinbock-logo.png';

const OriginalDashboard = () => {
  const [activeTab, setActiveTab] = useState('Übersicht');

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
      status: 'Bestätigt',
      guests: 5,
      cleaning: { date: '10.10.2025', provider: 'Amela', status: 'Geplant' },
      borderColor: 'green'
    },
    {
      id: 2,
      guest: 'Anke Wiggers',
      house: 'Wald Chalet',
      dates: '20.12.2025 - 27.12.2025',
      status: 'Bestätigt',
      guests: 5,
      cleaning: { date: '19.12.2025', provider: 'Amela', status: 'Geplant' },
      borderColor: 'blue'
    },
    {
      id: 3,
      guest: 'Antonio Peñera',
      house: 'Venedigersiedlung Chalet',
      dates: '21.12.2025 - 26.12.2025',
      status: 'Bestätigt',
      guests: 5,
      cleaning: { date: '20.12.2025', provider: 'Amela', status: 'Geplant' },
      borderColor: 'purple'
    }
  ];

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
                        <span className="text-sm text-gray-600">{booking.cleaning.date}</span>
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
    </div>
  );
};

export default OriginalDashboard;