import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Clock, Sparkles, Droplets } from 'lucide-react';
import { ServiceTask, LinenOrder } from '@/types';

interface TaskOverviewProps {
  cleaningTasks: ServiceTask[];
  linenOrders: LinenOrder[];
}

const TaskOverview = ({ cleaningTasks, linenOrders }: TaskOverviewProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-primary-green/20 text-primary-green';
      case 'in-progress':
        return 'bg-primary-blue/20 text-primary-blue';
      case 'pending':
        return 'bg-warm-orange/20 text-warm-orange';
      default:
        return 'bg-muted/50 text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Abgeschlossen';
      case 'in-progress':
        return 'In Bearbeitung';
      case 'pending':
        return 'Ausstehend';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return CheckCircle;
      case 'in-progress':
        return Clock;
      case 'pending':
        return Clock;
      default:
        return Clock;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Cleaning Tasks */}
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary-blue/10">
              <Sparkles className="w-4 h-4 text-primary-blue" />
            </div>
            Reinigungsaufgaben
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cleaningTasks.map((task) => {
            const StatusIcon = getStatusIcon(task.status);
            
            return (
              <div key={task.id} className="p-4 rounded-lg bg-accent/30 hover:bg-accent/50 transition-all duration-200 group">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {task.title}
                  </h4>
                  <Badge className={getStatusColor(task.status)}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {getStatusText(task.status)}
                  </Badge>
                </div>
                
                {task.progress !== undefined && (
                  <div className="mb-2">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Fortschritt</span>
                      <span className="text-primary font-medium">{task.progress}%</span>
                    </div>
                    <Progress 
                      value={task.progress} 
                      className="h-2"
                    />
                  </div>
                )}
                
                {task.items && task.items.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium">{task.items.length} Aufgaben:</span>
                    <span className="ml-1">{task.items.slice(0, 2).join(', ')}</span>
                    {task.items.length > 2 && <span>, +{task.items.length - 2} mehr</span>}
                  </div>
                )}
                
                <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                  <span>{task.scheduled_date} um {task.scheduled_time}</span>
                  <span>Amela Reinigungsservice</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Linen Orders */}
      <Card className="card-glow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary-green/10">
              <Droplets className="w-4 h-4 text-primary-green" />
            </div>
            Wäschebestellungen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {linenOrders.map((order) => {
            const StatusIcon = getStatusIcon(order.status);
            const totalItems = order.items?.reduce((sum, item) => sum + item.count, 0) || 0;
            
            return (
              <div key={order.id} className="p-4 rounded-lg bg-accent/30 hover:bg-accent/50 transition-all duration-200 group">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    Wäschebestellung #{order.id}
                  </h4>
                  <Badge className={getStatusColor(order.status)}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {getStatusText(order.status)}
                  </Badge>
                </div>
                
                <div className="text-sm text-muted-foreground mb-2">
                  <span className="font-medium">{totalItems} Artikel:</span>
                  {order.items?.map((item, index) => (
                    <span key={item.id} className="ml-1">
                      {item.count}x {item.type}
                      {index < (order.items?.length || 0) - 1 && ', '}
                    </span>
                  ))}
                </div>
                
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Bestellt: {order.order_date}</span>
                  <span>Lieferung: {order.delivery_date}</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default TaskOverview;