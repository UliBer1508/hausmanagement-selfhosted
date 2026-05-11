import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, User, Building } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import EditCleaningTaskDialog from '@/components/Cleaning/EditCleaningTaskDialog';

interface ServiceTaskCardProps {
  task: any;
  colorVariant: 'green' | 'blue' | 'purple';
  onTaskUpdated?: () => void;
}

const ServiceTaskCard = ({ task, colorVariant, onTaskUpdated }: ServiceTaskCardProps) => {
  const [showEditDialog, setShowEditDialog] = useState(false);
  
  // Debug: Check if status_changed_by is present
  console.log('[ServiceTaskCard] Task:', task.id, 'status_changed_by:', task.status_changed_by, 'status_changed_at:', task.status_changed_at);
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
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">📅 Geplant</Badge>;
      case 'in_progress':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300">🔄 Läuft</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 border-green-300">✅ Fertig</Badge>;
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

  const getPaymentStatusBadge = (paymentStatus: string) => {
    switch(paymentStatus) {
      case 'paid':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400">✅ Bezahlt</Badge>;
      case 'unpaid':
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-400">💳 Offen</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400">⏳ Ausstehend</Badge>;
      default:
        return <Badge variant="outline">{paymentStatus}</Badge>;
    }
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`${getServiceLabel(task.service_type)} bearbeiten`}
      onClick={(e) => {
        if (!e.currentTarget.contains(e.target as Node)) return;
        setShowEditDialog(true);
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault();
          setShowEditDialog(true);
        }
      }}
      className={`border-l-4 ${getBorderColor(colorVariant)} bg-blue-50 cursor-pointer hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      <CardContent className="p-3 relative pb-10">
        <div className="space-y-2">
          {/* Header with Title and Edit Button */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-lg shrink-0">{getServiceIcon(task.service_type)}</span>
              <h4 className="font-medium truncate">{getServiceLabel(task.service_type)}</h4>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setShowEditDialog(true);
              }}
              title="Bearbeiten"
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Date */}
          <div className="text-sm">
            <span className="text-muted-foreground">Datum: </span>
            <span>{format(new Date(task.scheduled_date), "dd.MM.yyyy", { locale: de })}</span>
          </div>

          {/* Payment Status */}
          {task.cleaning_cost && (
            <div className="flex items-center gap-2 text-sm">
              <span>💶</span>
              <span className="text-muted-foreground">Kosten:</span>
              <span className="font-semibold text-green-700">{task.cleaning_cost.toFixed(2)} EUR</span>
            </div>
          )}
          {task.payment_status && (
            <div className="flex items-center gap-2 text-sm">
              <span>💳</span>
              <span className="text-muted-foreground">Bezahlung:</span>
              {getPaymentStatusBadge(task.payment_status)}
            </div>
          )}

          {/* Provider */}
          {task.service_providers && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base shrink-0">🏢</span>
              <span className="text-muted-foreground">Provider:</span>
              <span className="font-medium truncate">{task.service_providers.name}</span>
            </div>
          )}

          {/* Staff - prioritize cleaning_assignments data, then direct assigned staff */}
          {task.cleaning_assignments && task.cleaning_assignments.length > 0 ? (
            <div className="space-y-2">
              {task.cleaning_assignments.map((assignment: any, index: number) => (
                <div key={index} className="text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base shrink-0">👤</span>
                    <span className="text-muted-foreground">Putzkraft:</span>
                    <span className="font-medium truncate">{assignment.cleaning_staff?.name || 'Unbekannt'}</span>
                  </div>
                  {assignment.estimated_duration && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Dauer: {assignment.estimated_duration}min</span>
                    </div>
                  )}
                  {assignment.special_instructions && (
                    <div className="text-xs text-muted-foreground break-words">
                      Anweisungen: {assignment.special_instructions}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : task.direct_assigned_staff ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base shrink-0">👤</span>
              <span className="text-muted-foreground">Putzkraft:</span>
              <span className="font-medium truncate">{task.direct_assigned_staff.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-base shrink-0">👤</span>
              <span>Noch keine Putzkraft zugewiesen</span>
            </div>
          )}

        </div>

        {/* Status Badge with Change Info - Bottom Right Corner */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
          {/* Status Changed Info - links vom Badge */}
          {task.status_changed_by && (
            <span 
              className="text-xs text-muted-foreground"
              title={task.status_changed_at ? `Geändert am ${format(new Date(task.status_changed_at), "dd.MM.yyyy 'um' HH:mm", { locale: de })}` : undefined}
            >
              ({task.status_changed_by})
            </span>
          )}
          {/* Status Badge - ganz rechts */}
          {getStatusBadge(task.status)}
        </div>
      </CardContent>

      {/* Edit Dialog */}
      <EditCleaningTaskDialog
        taskId={task.id}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onTaskUpdated={() => {
          setShowEditDialog(false);
          onTaskUpdated?.();
        }}
      />
    </Card>
  );
};

export default ServiceTaskCard;