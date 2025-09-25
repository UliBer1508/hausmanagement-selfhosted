import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Clock, Shirt, Bed, Bath, Plus, ArrowRight } from 'lucide-react';
import ServiceHeader from '@/components/ServicePortal/ServiceHeader';
import { mockProviders, mockCleaningTasks, mockLinenOrders } from '@/data/mockData';
import AppLayout from '@/components/Layout/AppLayout';

const ServicePortal = () => {
  const [selectedService, setSelectedService] = useState<'cleaning' | 'laundry'>('cleaning');
  const [draggedTask, setDraggedTask] = useState<string | null>(null);

  const currentProvider = mockProviders.find(p => p.service_type === selectedService);

  const handleDragStart = (taskId: string) => {
    setDraggedTask(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDraggedTask(null);
  };

  const renderCleaningTasks = () => {
    const todoTasks = mockCleaningTasks.filter(task => task.status === 'scheduled');
    const inProgressTasks = mockCleaningTasks.filter(task => task.status === 'in_progress');
    const completedTasks = mockCleaningTasks.filter(task => task.status === 'completed');

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* To Do Column */}
        <Card className="bg-red-50 border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-red-700">
              <span>Zu erledigen</span>
              <Badge variant="secondary" className="bg-red-100 text-red-600">
                {todoTasks.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {todoTasks.map((task) => (
              <Card key={task.id} className="bg-white border-red-200 cursor-move hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm">{task.title}</h4>
                    <Clock className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="text-xs text-gray-600 mb-3">
                    {task.scheduled_date} • {task.scheduled_time}
                  </div>
                  <div className="space-y-2">
                    {task.items?.map((item, index) => (
                      <div key={index} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" className="w-full mt-3 bg-red-600 hover:bg-red-700">
                    Beginnen
                  </Button>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        {/* In Progress Column */}
        <Card className="bg-yellow-50 border-yellow-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-yellow-700">
              <span>In Bearbeitung</span>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-600">
                {inProgressTasks.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {inProgressTasks.map((task) => (
              <Card key={task.id} className="bg-white border-yellow-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm">{task.title}</h4>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4 text-yellow-500" />
                    </div>
                  </div>
                  <Progress value={task.progress || 0} className="mb-3" />
                  <div className="text-xs text-gray-600 mb-3">
                    {task.progress}% abgeschlossen
                  </div>
                  <Button size="sm" className="w-full bg-yellow-600 hover:bg-yellow-700">
                    Fortsetzen
                  </Button>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        {/* Completed Column */}
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-green-700">
              <span>Abgeschlossen</span>
              <Badge variant="secondary" className="bg-green-100 text-green-600">
                {completedTasks.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {completedTasks.map((task) => (
              <Card key={task.id} className="bg-white border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm">{task.title}</h4>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="text-xs text-gray-600 mb-3">
                    Abgeschlossen am {task.scheduled_date}
                  </div>
                  <Progress value={100} className="mb-3" />
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderLinenOrders = () => {
    const pendingOrders = mockLinenOrders.filter(order => order.status === 'pending');
    const inProgressOrders = mockLinenOrders.filter(order => order.status === 'in-progress');
    const completedOrders = mockLinenOrders.filter(order => order.status === 'completed');

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pending Orders Column */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-blue-700">
              <span>Ausstehend</span>
              <Badge variant="secondary" className="bg-blue-100 text-blue-600">
                {pendingOrders.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingOrders.map((order) => (
              <Card key={order.id} className="bg-white border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm">Bestellung #{order.id.slice(0, 8)}</h4>
                    <Clock className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-xs text-gray-600 mb-3">
                    Lieferung: {order.delivery_date}
                  </div>
                  <div className="space-y-1 mb-3">
                    {order.items?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <span>{item.type}</span>
                        <Badge variant="outline" className="text-xs">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700">
                    Bearbeiten
                  </Button>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        {/* In Progress Orders Column */}
        <Card className="bg-purple-50 border-purple-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-purple-700">
              <span>In Bearbeitung</span>
              <Badge variant="secondary" className="bg-purple-100 text-purple-600">
                {inProgressOrders.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {inProgressOrders.map((order) => (
              <Card key={order.id} className="bg-white border-purple-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm">Bestellung #{order.id.slice(0, 8)}</h4>
                    <ArrowRight className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="space-y-1 mb-3">
                    {order.items?.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <span>{item.type}</span>
                        <Badge variant={item.status === 'completed' ? 'default' : 'outline'} className="text-xs">
                          {item.status === 'completed' ? '✓' : item.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" className="w-full bg-purple-600 hover:bg-purple-700">
                    Fortsetzen
                  </Button>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        {/* Completed Orders Column */}
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-green-700">
              <span>Abgeschlossen</span>
              <Badge variant="secondary" className="bg-green-100 text-green-600">
                {completedOrders.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {completedOrders.map((order) => (
              <Card key={order.id} className="bg-white border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-sm">Bestellung #{order.id.slice(0, 8)}</h4>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                  <div className="text-xs text-gray-600 mb-3">
                    Geliefert: {order.delivery_date}
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <ServiceHeader 
          selectedService={selectedService}
          onServiceChange={setSelectedService}
          provider={currentProvider}
        />

        {selectedService === 'cleaning' ? renderCleaningTasks() : renderLinenOrders()}
      </div>
    </AppLayout>
  );
};

export default ServicePortal;