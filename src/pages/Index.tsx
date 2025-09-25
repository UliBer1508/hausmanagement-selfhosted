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
import { Search, Filter, Calendar, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const Index = () => {
  const [activeTab, setActiveTab] = useState('tasks');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'in_progress' | 'completed'>('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');

  // Fetch cleaning staff for filter
  const { data: cleaningStaff } = useQuery({
    queryKey: ['cleaning-staff'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleaning_staff')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch cleaning tasks for Amela provider
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['amela-cleaning-tasks', searchTerm, statusFilter, staffFilter, timeFilter],
    queryFn: async () => {
      // First get all service tasks
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
          )
        `)
        .eq('service_type', 'cleaning')
        .order('scheduled_date', { ascending: true });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Apply staff filter
      if (staffFilter !== 'all') {
        query = query.eq('assigned_staff_id', staffFilter);
      }

      // Apply time filter
      const now = new Date();
      if (timeFilter === 'today') {
        const today = now.toISOString().split('T')[0];
        query = query.eq('scheduled_date', today);
      } else if (timeFilter === 'week') {
        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(now.getDate() + 7);
        query = query
          .gte('scheduled_date', now.toISOString().split('T')[0])
          .lte('scheduled_date', oneWeekFromNow.toISOString().split('T')[0]);
      } else if (timeFilter === 'next_week') {
        const nextWeekStart = new Date();
        nextWeekStart.setDate(now.getDate() + 7);
        const nextWeekEnd = new Date();
        nextWeekEnd.setDate(now.getDate() + 14);
        query = query
          .gte('scheduled_date', nextWeekStart.toISOString().split('T')[0])
          .lte('scheduled_date', nextWeekEnd.toISOString().split('T')[0]);
      } else if (timeFilter === '3_months') {
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(now.getMonth() + 3);
        query = query
          .gte('scheduled_date', now.toISOString().split('T')[0])
          .lte('scheduled_date', threeMonthsFromNow.toISOString().split('T')[0]);
      } else if (timeFilter === '6_months') {
        const sixMonthsFromNow = new Date();
        sixMonthsFromNow.setMonth(now.getMonth() + 6);
        query = query
          .gte('scheduled_date', now.toISOString().split('T')[0])
          .lte('scheduled_date', sixMonthsFromNow.toISOString().split('T')[0]);
      } else if (timeFilter === '12_months') {
        const twelveMonthsFromNow = new Date();
        twelveMonthsFromNow.setFullYear(now.getFullYear() + 1);
        query = query
          .gte('scheduled_date', now.toISOString().split('T')[0])
          .lte('scheduled_date', twelveMonthsFromNow.toISOString().split('T')[0]);
      } else if (timeFilter === 'past') {
        query = query.lt('scheduled_date', now.toISOString().split('T')[0]);
      }

      const { data: tasksData, error } = await query;
      if (error) throw error;

      if (!tasksData) return [];

      // Get cleaning staff for assigned tasks
      const staffIds = tasksData
        .filter(task => task.assigned_staff_id)
        .map(task => task.assigned_staff_id);

      let staffData: any[] = [];
      if (staffIds.length > 0) {
        const { data: staff, error: staffError } = await supabase
          .from('cleaning_staff')
          .select('id, name')
          .in('id', staffIds);
        
        if (!staffError) {
          staffData = staff || [];
        }
      }

      // Combine tasks with staff data
      const tasksWithStaff = tasksData.map(task => {
        const assignedStaff = staffData.find(staff => staff.id === task.assigned_staff_id);
        
        return {
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
          assigned_staff: assignedStaff ? { name: assignedStaff.name } : null
        };
      });

      // Apply search filter if provided
      if (searchTerm) {
        return tasksWithStaff.filter(task => 
          task.house.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          task.booking.guest_name.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      return tasksWithStaff;
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
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={() => {
              setActiveTab('tasks');
              setTimeFilter('today');
            }}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Heute
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={() => {
              setActiveTab('tasks');
              setTimeFilter('3_months');
            }}
          >
            <Calendar className="h-4 w-4 mr-2" />
            3 Monate
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={() => {
              setActiveTab('tasks');
              setStatusFilter('scheduled');
            }}
          >
            <Clock className="h-4 w-4 mr-2" />
            Geplant
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={() => {
              setActiveTab('tasks');
              setStatusFilter('in_progress');
            }}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Aktiv
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
        
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-gray-400" />
          <div className="grid grid-cols-1 gap-2 flex-1">
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(value: 'all' | 'scheduled' | 'in_progress' | 'completed') => setStatusFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Status filtern" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border shadow-lg z-50">
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="scheduled">Geplant</SelectItem>
                <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                <SelectItem value="completed">Abgeschlossen</SelectItem>
              </SelectContent>
            </Select>

            {/* Staff Filter */}
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Putzkraft filtern" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border shadow-lg z-50">
                <SelectItem value="all">Alle Putzkräfte</SelectItem>
                {cleaningStaff?.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {staff.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Time Filter */}
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Zeitraum filtern" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800 border shadow-lg z-50">
                <SelectItem value="all">Alle Zeiten</SelectItem>
                <SelectItem value="today">Heute</SelectItem>
                <SelectItem value="week">Diese Woche</SelectItem>
                <SelectItem value="next_week">Nächste Woche</SelectItem>
                <SelectItem value="3_months">3 Monate</SelectItem>
                <SelectItem value="6_months">6 Monate</SelectItem>
                <SelectItem value="12_months">12 Monate</SelectItem>
                <SelectItem value="past">Vergangene</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Results count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {tasks?.length || 0} Aufträge gefunden
          </p>
          <Button variant="ghost" size="sm" onClick={() => {
            setSearchTerm('');
            setStatusFilter('all');
            setStaffFilter('all');
            setTimeFilter('all');
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
