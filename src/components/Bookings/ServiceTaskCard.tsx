import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, User, Building } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface ServiceTaskCardProps {
  task: any;
  colorVariant: 'green' | 'blue' | 'purple';
}

const ServiceTaskCard = ({ task, colorVariant }: ServiceTaskCardProps) => {
  const getBorderColor = (variant: string) => {
    switch (variant) {
      case 'green':
        return 'border-l-green-500';
      case 'blue':
        return 'border-l-blue-500';
      case 'purple':
        return 'border-l-purple-500';
      default:
        return 'border-l-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Geplant</Badge>;
      case 'in_progress':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300">Läuft</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Fertig</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getServiceIcon = (type: string) => {
    return type === 'cleaning' ? '🧹' : '👕';
  };

  const getServiceLabel = (type: string) => {
    return type === 'cleaning' ? 'Reinigung' : 'Wäscherei';
  };

  return (
    <Card className={`border-l-4 ${getBorderColor(colorVariant)} bg-blue-50 relative`}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Service Type */}
          <div className="flex items-center gap-2">
            <span className="text-lg">{getServiceIcon(task.service_type)}</span>
            <h4 className="font-medium">{getServiceLabel(task.service_type)}</h4>
            {getStatusBadge(task.status)}
          </div>

          {/* Date */}
          <div className="text-sm">
            <span className="text-muted-foreground">Datum: </span>
            <span>{format(new Date(task.scheduled_date), "dd.MM.yyyy", { locale: de })}</span>
          </div>

          {/* Provider */}
          {task.service_providers && (
            <div className="flex items-center gap-2 text-sm">
              <Building className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Provider:</span>
              <span className="font-medium">{task.service_providers.name}</span>
            </div>
          )}

          {/* Staff - prioritize cleaning_assignments data, then direct assigned staff */}
          {task.cleaning_assignments && task.cleaning_assignments.length > 0 ? (
            <div className="space-y-2">
              {task.cleaning_assignments.map((assignment: any, index: number) => (
                <div key={index} className="text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Putzkraft:</span>
                    <span className="font-medium">{assignment.cleaning_staff?.name || 'Unbekannt'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Status: {assignment.status}</span>
                    {assignment.estimated_duration && (
                      <span>• Dauer: {assignment.estimated_duration}min</span>
                    )}
                  </div>
                  {assignment.special_instructions && (
                    <div className="text-xs text-muted-foreground">
                      Anweisungen: {assignment.special_instructions}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : task.direct_assigned_staff ? (
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Putzkraft:</span>
              <span className="font-medium">{task.direct_assigned_staff.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span>Noch keine Putzkraft zugewiesen</span>
            </div>
          )}
        </div>

        {/* Edit Button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-8 w-8 p-0"
        >
          <Edit className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
};

export default ServiceTaskCard;