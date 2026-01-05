import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useDashboardData } from '@/hooks/useDashboard';
import { format, parseISO, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarIcon, Home, Users, Building } from 'lucide-react';
import LinenApprovalAlertBanner from './LinenApprovalAlertBanner';

const RealDataDashboard = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { data, isLoading, error } = useDashboardData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2 text-muted-foreground">Daten werden geladen...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-red-500">Fehler beim Laden der Daten</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { houses, bookings, tasks, stats } = data;

  // Get events for selected date
  const getEventsForDate = (date: Date) => {
    const events = [];
    
    // Check-ins and check-outs for all bookings (including completed ones)
    bookings.forEach(booking => {
      // Skip cancelled bookings
      if (booking.status === 'cancelled') return;
      
      const checkIn = new Date(booking.check_in);
      const checkOut = new Date(booking.check_out);
      
      // Use date only comparison (ignore time)
      const selectedDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const checkInDateOnly = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate());
      const checkOutDateOnly = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate());
      
      if (selectedDateOnly.getTime() === checkInDateOnly.getTime()) {
        events.push({
          type: 'checkin',
          title: `Check-in: ${booking.guest_name}`,
          booking: booking,
          color: 'bg-green-100 text-green-800'
        });
      }
      
      if (selectedDateOnly.getTime() === checkOutDateOnly.getTime()) {
        events.push({
          type: 'checkout',
          title: `Check-out: ${booking.guest_name}`,
          booking: booking,
          color: 'bg-red-100 text-red-800'
        });
      }
    });

    // Service tasks
    tasks.forEach(task => {
      if (task.scheduled_date && isSameDay(date, parseISO(task.scheduled_date))) {
        events.push({
          type: 'service',
          title: `${task.service_type === 'cleaning' ? '🧹' : '👕'} Service`,
          task: task,
          color: 'bg-blue-100 text-blue-800'
        });
      }
    });
    
    return events;
  };

  return (
    <div className="space-y-6">
      {/* Alert Banner für ausstehende Wäsche-Genehmigungen */}
      <LinenApprovalAlertBanner />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Häuser</p>
                <p className="text-2xl font-bold">{stats.totalHouses}</p>
              </div>
              <Building className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Aktive Buchungen</p>
                <p className="text-2xl font-bold">{stats.activeBookings}</p>
              </div>
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Offene Aufgaben</p>
                <p className="text-2xl font-bold">{stats.pendingTasks}</p>
              </div>
              <CalendarIcon className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Umsatz</p>
                <p className="text-2xl font-bold">€{stats.totalRevenue.toLocaleString()}</p>
              </div>
              <Home className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Bookings */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Aktuelle Buchungen</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {bookings.slice(0, 5).map((booking) => {
                  const house = houses.find(h => h.id === booking.house_id);
                  return (
                    <div key={booking.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <h4 className="font-semibold">{booking.guest_name}</h4>
                        <p className="text-sm text-muted-foreground">{house?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(parseISO(booking.check_in), 'dd.MM.yyyy')} - {format(parseISO(booking.check_out), 'dd.MM.yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">
                          {booking.status}
                        </Badge>
                        <p className="text-sm text-muted-foreground mt-1">
                          {booking.number_of_guests} Gäste
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calendar */}
        <Card>
          <CardHeader>
            <CardTitle>Kalender</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              locale={de}
              className="rounded-md border"
            />
            
            {selectedDate && (
              <div className="mt-4 space-y-2">
                <h4 className="font-medium text-sm">
                  {format(selectedDate, 'dd. MMMM yyyy', { locale: de })}
                </h4>
                {getEventsForDate(selectedDate).map((event, index) => (
                  <div key={index} className={`text-xs p-2 rounded ${event.color}`}>
                    {event.title}
                  </div>
                ))}
                {getEventsForDate(selectedDate).length === 0 && (
                  <p className="text-xs text-muted-foreground">Keine Termine</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Service Tasks */}
      <Card>
        <CardHeader>
          <CardTitle>Service Aufgaben</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['scheduled', 'in_progress', 'completed'].map(status => {
              const statusTasks = tasks.filter(t => t.status === status);
              const statusLabels = {
                scheduled: 'Geplant',
                in_progress: 'In Bearbeitung', 
                completed: 'Abgeschlossen'
              };
              
              return (
                <div key={status} className="space-y-2">
                  <h4 className="font-medium text-sm flex items-center justify-between">
                    {statusLabels[status as keyof typeof statusLabels]}
                    <Badge variant="secondary">{statusTasks.length}</Badge>
                  </h4>
                  <div className="space-y-2">
                    {statusTasks.slice(0, 3).map(task => {
                      const house = houses.find(h => h.id === task.house_id);
                      return (
                        <div key={task.id} className="p-2 border rounded text-sm">
                          <p className="font-medium">
                            {task.service_type === 'cleaning' ? '🧹' : '👕'} {house?.name}
                          </p>
                          {task.scheduled_date && (
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(task.scheduled_date), 'dd.MM.yyyy')}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RealDataDashboard;