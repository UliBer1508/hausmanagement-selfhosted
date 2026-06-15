import { useState } from 'react';
import { CardContent } from '@/components/ui/card';
import { ClickableCard } from '@/components/ui/clickable-card';
import { Badge } from '@/components/ui/badge';
import { StickyNote } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import EditCleaningTaskDialog from '@/components/Cleaning/EditCleaningTaskDialog';
import NotesQuickDialog from '@/components/shared/NotesQuickDialog';
import { getGuestName } from '@/lib/guestHelpers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface ServiceTaskCardProps {
  task: any;
  colorVariant: 'green' | 'blue' | 'purple';
  onTaskUpdated?: () => void;
  houseName?: string;
}

const ServiceTaskCard = ({ task, colorVariant, onTaskUpdated, houseName: houseNameProp }: ServiceTaskCardProps) => {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSaveNotes = async (val: string) => {
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('service_tasks')
        .update({ notes: val || null })
        .eq('id', task.id);
      if (error) throw error;
      task.notes = val || null;
      queryClient.invalidateQueries({ queryKey: ['cleaning-tasks'] });
      onTaskUpdated?.();
      toast({ title: 'Notiz gespeichert' });
    } catch (err: any) {
      toast({ title: 'Fehler beim Speichern', description: err.message, variant: 'destructive' });
    } finally {
      setSavingNotes(false);
    }
  };

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

  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'Geplant';
      case 'in_progress':
        return 'Läuft';
      case 'completed':
        return 'Fertig';
      default:
        return status;
    }
  };

  const getServiceIcon = (type: string) => {
    return type === 'cleaning' ? '🧹' : '👕';
  };

  const getServiceLabel = (type: string) => {
    return type === 'cleaning' ? 'Reinigung' : 'Wäscherei-Auftrag';
  };

  const getServiceShortLabel = (type: string) => {
    return type === 'cleaning' ? 'Endreinigung' : 'Wäsche';
  };

  const getPaymentStatusBadge = (paymentStatus: string) => {
    switch (paymentStatus) {
      case 'paid':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/20 dark:text-green-400 text-[10px]">Bezahlt</Badge>;
      case 'unpaid':
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-400 text-[10px]">Offen</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400 text-[10px]">Ausstehend</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{paymentStatus}</Badge>;
    }
  };

  const houseName = houseNameProp || task.houses?.name || task.bookings?.houses?.name || 'Unbekannt';

  return (
    <>
      <ClickableCard
        aria-label={`${getServiceLabel(task.service_type)} bearbeiten`}
        onActivate={() => setShowEditDialog(true)}
        className={`border-l-4 ${getBorderColor(colorVariant)} bg-blue-50 overflow-hidden`}
      >
        {/* Kopfbalken */}
        <div
          className="flex items-center gap-2 px-3 py-2 text-white"
          style={{ background: 'linear-gradient(100deg,#2563eb,#3b82f6)' }}
        >
          <div
            className="w-7 h-7 rounded-lg grid place-items-center text-[15px] shrink-0"
            style={{ background: 'rgba(255,255,255,.22)' }}
          >
            {getServiceIcon(task.service_type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-wider opacity-90">
              {getServiceLabel(task.service_type)} · {houseName}
            </div>
            <div className="text-[14px] font-extrabold leading-tight truncate">
              {getServiceShortLabel(task.service_type)}
            </div>
          </div>
          <button
            type="button"
            aria-label="Notiz anzeigen/bearbeiten"
            onClick={(e) => {
              e.stopPropagation();
              setNotesOpen(true);
            }}
            className="relative grid place-items-center w-7 h-7 rounded-md bg-white/15 hover:bg-white/25 transition-colors shrink-0"
          >
            <StickyNote className="w-4 h-4" />
            {task.notes && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-300 border border-white" />
            )}
          </button>
          <span
            className="text-[10px] font-extrabold px-2 py-1 rounded-full bg-white/95 shrink-0"
            style={{ color: '#2563eb' }}
          >
            {getStatusText(task.status)}
          </span>
        </div>

        <CardContent className="p-3">
          <div className="space-y-2">
            {/* Gast (Verbindung zur Buchung) + Datum */}
            {task.bookings && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-base shrink-0">👤</span>
                <span className="text-muted-foreground text-xs">Gast:</span>
                <span className="font-medium truncate">
                  {getGuestName(task.bookings)}
                  {task.bookings?.number_of_guests != null && (
                    <span className="text-muted-foreground"> ({task.bookings.number_of_guests})</span>
                  )}
                </span>
                <span className="ml-auto text-muted-foreground text-xs whitespace-nowrap">
                  {format(new Date(task.scheduled_date), 'dd.MM.yy', { locale: de })}
                </span>
              </div>
            )}
            {/* Provider */}
            {task.service_providers && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-base shrink-0">🏢</span>
                <span className="text-muted-foreground text-xs">Provider:</span>
                <span className="truncate">{task.service_providers.name}</span>
              </div>
            )}

            {/* Payment */}
            {task.cleaning_cost && (
              <div className="flex items-center gap-2 text-sm">
                <span>💶</span>
                <span className="text-muted-foreground text-xs">Kosten:</span>
                <span className="font-semibold text-green-700">{task.cleaning_cost.toFixed(2)} EUR</span>
              </div>
            )}
            {task.payment_status && (
              <div className="flex items-center gap-2 text-sm">
                <span>💳</span>
                <span className="text-muted-foreground text-xs">Bezahlung:</span>
                {getPaymentStatusBadge(task.payment_status)}
              </div>
            )}

            {/* Staff */}
            {task.cleaning_assignments && task.cleaning_assignments.length > 0 ? (
              <div className="space-y-1">
                {task.cleaning_assignments.map((assignment: any, index: number) => (
                  <div key={index} className="text-sm space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base shrink-0">👤</span>
                      <span className="text-muted-foreground text-xs">Putzkraft:</span>
                      <span className="font-medium truncate">{assignment.cleaning_staff?.name || 'Amlea'}</span>
                    </div>
                    {assignment.estimated_duration && (
                      <div className="text-xs text-muted-foreground">
                        Dauer: {assignment.estimated_duration}min
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
                <span className="text-muted-foreground text-xs">Putzkraft:</span>
                <span className="font-medium truncate">{task.direct_assigned_staff.name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-base shrink-0">👤</span>
                <span className="text-muted-foreground text-xs">Putzkraft:</span>
                <span className="font-medium truncate">Amlea</span>
              </div>
            )}

            {/* Status changed by */}
            {task.status_changed_by && (
              <div className="text-[10px] text-muted-foreground">
                Geändert von: {task.status_changed_by}
                {task.status_changed_at && (
                  <span> · {format(new Date(task.status_changed_at), 'dd.MM.yy HH:mm', { locale: de })}</span>
                )}
              </div>
            )}

          </div>
        </CardContent>
      </ClickableCard>

      <EditCleaningTaskDialog
        taskId={task.id}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onTaskUpdated={() => {
          setShowEditDialog(false);
          onTaskUpdated?.();
        }}
      />
      <NotesQuickDialog
        open={notesOpen}
        onOpenChange={setNotesOpen}
        title="Notiz"
        value={task.notes ?? ''}
        saving={savingNotes}
        onSave={handleSaveNotes}
      />
    </>
  );
};

export default ServiceTaskCard;
