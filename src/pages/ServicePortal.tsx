import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Clock, Shirt, Bed, Bath, Plus, ArrowRight } from 'lucide-react';
import ServiceHeader from '@/components/ServicePortal/ServiceHeader';
import { mockProviders, mockCleaningTasks, mockLinenOrders } from '@/data/mockData';

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
    // Here you would update the task status
    console.log(`Moving task ${draggedTask} to ${status}`);
    setDraggedTask(null);
  };

  const renderCleaningTasks = () => {
    const tasksByStatus = {
      pending: mockCleaningTasks.filter(t => t.status === 'pending'),
      'in-progress': mockCleaningTasks.filter(t => t.status === 'in-progress'),
      completed: mockCleaningTasks.filter(t => t.status === 'completed')
    };

    const statusConfig = {
      pending: { title: 'Ausstehend', color: 'bg-warm-orange/10 border-warm-orange/30' },
      'in-progress': { title: 'In Bearbeitung', color: 'bg-primary-blue/10 border-primary-blue/30' },
      completed: { title: 'Abgeschlossen', color: 'bg-primary-green/10 border-primary-green/30' }
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Object.entries(tasksByStatus).map(([status, tasks]) => (
          <Card 
            key={status}
            className={`${statusConfig[status as keyof typeof statusConfig].color} card-glow`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status)}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{statusConfig[status as keyof typeof statusConfig].title}</span>
                <Badge variant="secondary">{tasks.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => handleDragStart(task.id)}
                  className="p-4 bg-card rounded-lg border border-border/50 cursor-move hover:shadow-lg transition-all duration-200 group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {task.title}
                    </h4>
                    {task.status === 'completed' ? (
                      <CheckCircle className="w-5 h-5 text-primary-green" />
                    ) : (
                      <Clock className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>

                  {task.progress !== undefined && (
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Fortschritt</span>
                        <span className="text-primary font-medium">{task.progress}%</span>
                      </div>
                      <Progress value={task.progress} className="h-2" />
                    </div>
                  )}

                  {task.items && (
                    <div className="space-y-2">
                      {task.items.map((item, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <div className="w-2 h-2 rounded-full bg-primary-blue/50" />
                          <span className="text-muted-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                    <span>{task.scheduled_date}</span>
                    <span>{task.scheduled_time}</span>
                  </div>
                </div>
              ))}

              <Button 
                variant="ghost" 
                className="w-full border-2 border-dashed border-border/50 hover:border-primary/50 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Aufgabe hinzufügen
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderLinenOrders = () => {
    const laundryItems = [
      { id: '1', type: 'Bettwäsche', count: 4, icon: Bed, status: 'pending' },
      { id: '2', type: 'Handtücher', count: 8, icon: Bath, status: 'in-progress' },
      { id: '3', type: 'Küchentücher', count: 6, icon: Shirt, status: 'completed' }
    ];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="card-glow">
          <CardHeader>
            <CardTitle>Aktuelle Bestellungen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mockLinenOrders.map((order) => (
              <div key={order.id} className="p-4 bg-accent/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Bestellung #{order.id}</h4>
                  <Badge className={
                    order.status === 'completed' ? 'bg-primary-green/20 text-primary-green' :
                    order.status === 'in-progress' ? 'bg-primary-blue/20 text-primary-blue' :
                    'bg-warm-orange/20 text-warm-orange'
                  }>
                    {order.status === 'completed' ? 'Abgeschlossen' :
                     order.status === 'in-progress' ? 'In Bearbeitung' : 'Ausstehend'}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {order.items?.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span>{item.count}x {item.type}</span>
                      <Badge variant="outline" className="text-xs">
                        {item.status === 'completed' ? 'Fertig' :
                         item.status === 'in-progress' ? 'In Arbeit' : 'Wartend'}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                  <span>Bestellt: {order.order_date}</span>
                  <span>Lieferung: {order.delivery_date}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="card-glow">
          <CardHeader>
            <CardTitle>Wäscheartikel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {laundryItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="flex items-center justify-between p-4 bg-accent/30 rounded-lg hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary-green/10">
                      <Icon className="w-4 h-4 text-primary-green" />
                    </div>
                    <div>
                      <p className="font-medium">{item.type}</p>
                      <p className="text-sm text-muted-foreground">{item.count} Stück</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge className={
                      item.status === 'completed' ? 'bg-primary-green/20 text-primary-green' :
                      item.status === 'in-progress' ? 'bg-primary-blue/20 text-primary-blue' :
                      'bg-warm-orange/20 text-warm-orange'
                    }>
                      {item.status === 'completed' ? 'Fertig' :
                       item.status === 'in-progress' ? 'In Arbeit' : 'Wartend'}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <ServiceHeader 
        selectedService={selectedService}
        onServiceChange={setSelectedService}
        provider={currentProvider}
      />

      {selectedService === 'cleaning' ? renderCleaningTasks() : renderLinenOrders()}
    </div>
  );
};

export default ServicePortal;