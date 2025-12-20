import { Bell, Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCleaningStatusNotifications } from '@/hooks/useCleaningStatusNotifications';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

const CleaningStatusAlertBanner = () => {
  const { 
    unacknowledgedNotifications, 
    unacknowledgedCount,
    acknowledge,
    acknowledgeAll,
    getStatusLabel
  } = useCleaningStatusNotifications();

  if (unacknowledgedCount === 0) {
    return null;
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-500 p-4 mb-6 rounded-lg shadow-sm">
      <div className="flex items-start gap-3">
        <Bell className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-blue-800 dark:text-blue-200 text-base sm:text-lg">
              🔔 {unacknowledgedCount} Status-{unacknowledgedCount === 1 ? 'Änderung' : 'Änderungen'}
            </h3>
            {unacknowledgedCount > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={acknowledgeAll}
                className="text-blue-700 border-blue-300 hover:bg-blue-100 dark:text-blue-300 dark:border-blue-700 dark:hover:bg-blue-900"
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Alle gesehen
              </Button>
            )}
          </div>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
            Reinigungsaufträge wurden von Teuni, Amela oder Boris aktualisiert.
          </p>
          
          <div className="mt-4 space-y-3">
            {unacknowledgedNotifications.map(notification => (
              <div 
                key={notification.id} 
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-background/50 p-3 rounded-lg border border-blue-200 dark:border-blue-800"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      {notification.changedBy}
                    </Badge>
                    <span className="text-foreground">
                      hat <strong>{notification.houseName}</strong> auf
                    </span>
                    <Badge 
                      variant={notification.newStatus === 'completed' ? 'default' : 'outline'}
                      className={notification.newStatus === 'completed' 
                        ? 'bg-green-600 text-white' 
                        : notification.newStatus === 'in_progress'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                          : ''
                      }
                    >
                      {getStatusLabel(notification.newStatus)}
                    </Badge>
                    <span className="text-foreground">gesetzt</span>
                  </div>
                  
                  <div className="text-sm text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notification.changedAt), { 
                      addSuffix: true, 
                      locale: de 
                    })}
                  </div>
                </div>
                
                <Button
                  size="sm"
                  onClick={() => acknowledge(notification.id)}
                  className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Gesehen
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CleaningStatusAlertBanner;
