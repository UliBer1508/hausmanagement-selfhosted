import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, Plus } from 'lucide-react';
import { useState } from 'react';
import CreateCleaningTaskDialog from '@/components/Cleaning/CreateCleaningTaskDialog';
import { CleaningData } from '@/hooks/useOperationsDashboard';
import { format, isToday, isPast } from 'date-fns';
import { de } from 'date-fns/locale';

interface CleaningsCardProps {
  cleanings: CleaningData[];
}

function getStatusBadge(status: string, scheduledDate: Date) {
  if (status === 'completed') {
    return <Badge className="bg-green-500 text-white text-xs">Erledigt</Badge>;
  }
  if (status === 'in_progress') {
    return <Badge className="bg-blue-500 text-white text-xs">In Arbeit</Badge>;
  }
  if (status === 'cancelled') {
    return <Badge variant="destructive" className="text-xs">Storniert</Badge>;
  }
  if (isToday(scheduledDate)) {
    return <Badge className="bg-yellow-500 text-white text-xs">Heute</Badge>;
  }
  if (isPast(scheduledDate)) {
    return <Badge variant="destructive" className="text-xs">Überfällig</Badge>;
  }
  return <Badge variant="secondary" className="text-xs">Geplant</Badge>;
}

export function CleaningsCard({ cleanings }: CleaningsCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-500" />
          Reinigungen
          <Badge variant="secondary" className="ml-auto">
            {cleanings.length}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Neuer Reinigungsauftrag"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
        {cleanings.length === 0 ? (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="w-full text-sm text-muted-foreground text-center py-4 hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
          >
            Keine Reinigungen in diesem Zeitraum
            <span className="block mt-1 text-xs text-primary text-slate-400">Klicken um Reinigungsauftrag zu erstellen</span>
          </button>
        ) : (
          cleanings.map((cleaning) => (
            <div
              key={cleaning.id}
              className={`p-3 rounded-lg border ${
                cleaning.status === 'completed'
                  ? 'bg-green-500/10 border-green-500/30'
                  : isToday(cleaning.scheduledDate)
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-muted/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-sm">{cleaning.houseName}</p>
                  {cleaning.assignedTo && (
                    <p className="text-xs text-muted-foreground">{cleaning.assignedTo}</p>
                  )}
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs font-medium">
                    {format(cleaning.scheduledDate, 'EEE, dd.MM.', { locale: de })}
                  </p>
                  {cleaning.scheduledTime && (
                    <p className="text-xs text-muted-foreground">{cleaning.scheduledTime}</p>
                  )}
                </div>
              </div>
              <div className="mt-2">
                {getStatusBadge(cleaning.status, cleaning.scheduledDate)}
              </div>
            </div>
          ))
        )}
      </CardContent>
      <CreateCleaningTaskDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
}
