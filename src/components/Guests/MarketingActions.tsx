import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Target, Users, CheckCircle, Clock, MoreVertical, Pencil, Trash2, Eye, ClipboardList, BarChart3, MessageSquareText } from 'lucide-react';
import { useMarketingActions, useActionStats, TargetCriteria } from '@/hooks/useMarketingActions';
import CreateActionDialog from './CreateActionDialog';
import ActionDetailsDialog from './ActionDetailsDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const MarketingActions = () => {
  const { actions, isLoadingActions, deleteAction } = useMarketingActions();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const selectedAction = actions?.find(a => a.id === selectedActionId);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Aktiv</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pausiert</Badge>;
      case 'completed':
        return <Badge className="bg-muted text-muted-foreground">Beendet</Badge>;
      default:
        return null;
    }
  };

  const getCriteriaLabels = (criteria: TargetCriteria) => {
    const labels: string[] = [];
    if (criteria.has_children) labels.push('👨‍👩‍👧 Familien mit Kindern');
    if (criteria.min_stays && criteria.min_stays > 1) labels.push(`🔄 Stammgäste (≥${criteria.min_stays} Aufenthalte)`);
    if (criteria.nationality) labels.push(`🌍 ${criteria.nationality}`);
    if (criteria.min_nights) labels.push(`🌙 Min. ${criteria.min_nights} Nächte`);
    return labels.length > 0 ? labels : ['📋 Alle Buchungen'];
  };

  const handleDelete = async () => {
    if (deleteConfirmId) {
      await deleteAction.mutateAsync(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  if (isLoadingActions) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5" />
            Marketing-Aktionen
          </h2>
          <p className="text-sm text-muted-foreground">
            Dokumentieren und verfolgen Sie Ihre Marketing-Aktionen
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Aktion
        </Button>
      </div>

      {/* Actions Grid */}
      {actions && actions.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {actions.map(action => (
            <ActionCard
              key={action.id}
              action={action}
              onView={() => setSelectedActionId(action.id)}
              onEdit={() => setEditingAction(action)}
              onDelete={() => setDeleteConfirmId(action.id)}
              getStatusBadge={getStatusBadge}
              getCriteriaLabels={getCriteriaLabels}
            />
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Keine Marketing-Aktionen</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Erstellen Sie Ihre erste Marketing-Aktion, um<br />
              Gästeaktionen zu dokumentieren und zu verfolgen.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Erste Aktion erstellen
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <CreateActionDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />

      <CreateActionDialog
        open={!!editingAction}
        onOpenChange={(open) => !open && setEditingAction(null)}
        editAction={editingAction}
      />

      {selectedAction && (
        <ActionDetailsDialog
          open={!!selectedActionId}
          onOpenChange={(open) => !open && setSelectedActionId(null)}
          action={selectedAction}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aktion löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion und alle zugehörigen Tracking-Daten werden unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface ActionCardProps {
  action: any;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  getStatusBadge: (status: string) => React.ReactNode;
  getCriteriaLabels: (criteria: TargetCriteria) => string[];
}

const ActionCard = ({ action, onView, onEdit, onDelete, getStatusBadge, getCriteriaLabels }: ActionCardProps) => {
  const { data: stats, isLoading: isLoadingStats } = useActionStats(action.id, action.target_criteria);

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onView}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{action.name}</CardTitle>
            <CardDescription className="line-clamp-2 mt-1">
              {action.description || 'Keine Beschreibung'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 ml-2" onClick={e => e.stopPropagation()}>
            {getStatusBadge(action.status)}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onView}>
                  <Eye className="h-4 w-4 mr-2" />
                  Details anzeigen
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Bearbeiten
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Target Criteria */}
        <div className="flex flex-wrap gap-1">
          {getCriteriaLabels(action.target_criteria).map((label, i) => (
            <Badge key={i} variant="outline" className="text-xs font-normal">
              {label}
            </Badge>
          ))}
        </div>

        {/* Stats - Two sections: Planning and Evaluation */}
        {isLoadingStats ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-12" />
          </div>
        ) : stats ? (
          <div className="space-y-2">
            {/* Planning Section */}
            <div className="bg-muted/30 rounded-lg p-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <ClipboardList className="h-3 w-3" />
                <span>Planung</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-medium">{stats.planningTotal}</div>
                  <div className="text-[10px] text-muted-foreground">Kommend</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-green-600">{stats.planningApplied}</div>
                  <div className="text-[10px] text-muted-foreground">Angewendet</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-yellow-600">{stats.planningPending}</div>
                  <div className="text-[10px] text-muted-foreground">Offen</div>
                </div>
              </div>
            </div>

            {/* Evaluation Section */}
            <div className="bg-blue-500/5 rounded-lg p-2 border border-blue-500/10">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <BarChart3 className="h-3 w-3" />
                <span>Auswertung</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <MessageSquareText className="h-4 w-4 text-blue-500" />
                  <span className="text-lg font-semibold text-blue-600">
                    {stats.avgRating ? stats.avgRating.toFixed(1) : '-'}
                  </span>
                  <span className="text-xs text-muted-foreground">/10</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {stats.evaluationWithRating > 0 
                    ? `${stats.evaluationWithRating} Bewertung${stats.evaluationWithRating !== 1 ? 'en' : ''}`
                    : 'Noch keine Daten'
                  }
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default MarketingActions;
