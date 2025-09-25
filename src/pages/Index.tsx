import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { BottomNavigation } from '@/components/mobile/BottomNavigation';
import { TaskCard } from '@/components/cleaning/TaskCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, Calendar, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const Index = () => {
  const [activeTab, setActiveTab] = useState('tasks');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'in_progress' | 'completed'>('all');

  // Fetch cleaning tasks for Amela provider
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['amela-cleaning-tasks', searchTerm, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('service_tasks')
        .select(`
          *,
          houses:house_id (
            id,
            name,
            address
          ),
          bookings:booking_id (
            id,
            guest_name,
            number_of_guests,
            check_in,
            check_out
          ),
          cleaning_staff:assigned_staff_id (
            id,
            name
          )
        `)
        .eq('service_type', 'cleaning')
        .order('scheduled_date', { ascending: true });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (searchTerm) {
        query = query.or(`houses.name.ilike.%${searchTerm}%,bookings.guest_name.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data?.map(task => ({
        id: task.id,
        scheduled_date: task.scheduled_date,
        scheduled_time: task.scheduled_time,
        status: task.status,
        house: task.houses || { name: 'Unbekanntes Haus', address: '' },
        booking: task.bookings || { 
          guest_name: 'Unbekannter Gast', 
          number_of_guests: 0, 
          check_in: '', 
          check_out: '' 
        },
        assigned_staff: (task.cleaning_staff as any)?.name 
          ? { name: (task.cleaning_staff as any).name }
          : null
      })) || [];
    },
  });

  const handleTaskClick = (taskId: string) => {
    console.log('Task clicked:', taskId);
    // TODO: Navigate to task details
  };

  const renderDashboard = () => (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">12</p>
              <p className="text-sm text-gray-500">Heute geplant</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-2xl font-bold">8</p>
              <p className="text-sm text-gray-500">Abgeschlossen</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Schnellzugriff</h3>
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setActiveTab('tasks')}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Alle Aufträge anzeigen
          </Button>
        </div>
      </Card>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-4">
      {/* Search and Filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Suche nach Gast, Haus oder Adresse..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <Select value={statusFilter} onValueChange={(value: 'all' | 'scheduled' | 'in_progress' | 'completed') => setStatusFilter(value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Status filtern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="scheduled">Geplant</SelectItem>
              <SelectItem value="in_progress">In Bearbeitung</SelectItem>
              <SelectItem value="completed">Abgeschlossen</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Results count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {tasks?.length || 0} Aufträge gefunden
          </p>
          <Button variant="ghost" size="sm" onClick={() => {
            setSearchTerm('');
            setStatusFilter('all');
          }}>
            Filter zurücksetzen
          </Button>
        </div>
      </div>

      {/* Tasks List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-32 bg-gray-200 rounded-lg"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {tasks?.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onTaskClick={handleTaskClick}
            />
          ))}
          {tasks?.length === 0 && (
            <Card className="p-8 text-center">
              <p className="text-gray-500">Keine Aufträge gefunden</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return renderDashboard();
      case 'tasks':
        return renderTasks();
      case 'staff':
        return (
          <Card className="p-8 text-center">
            <p className="text-gray-500">Personal-Verwaltung</p>
          </Card>
        );
      case 'settings':
        return (
          <Card className="p-8 text-center">
            <p className="text-gray-500">Einstellungen</p>
          </Card>
        );
      default:
        return renderTasks();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <MobileHeader
        title="Amela"
        subtitle="Reinigungsservice"
      />

      {/* Main Content */}
      <div className="px-4 py-6 pb-20">
        {renderContent()}
      </div>

      {/* Bottom Navigation */}
      <BottomNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
};

export default Index;
