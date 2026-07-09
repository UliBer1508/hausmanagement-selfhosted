import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  ListChecks,
} from 'lucide-react';

interface MaxActionsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MaxAction {
  id: string;
  action_type: string;
  status: string;
  booking_id: string | null;
  guest_name: string | null;
  details: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Deutsche Klartext-Labels für die action_type-Werte.
// Bei neuen Typen hier ergänzen; Fallback zeigt den Rohwert.
const ACTION_TYPE_LABELS: Record<string, string> = {
  welcome_email: 'Willkommens-E-Mail',
  cleaning_created: 'Reinigung angelegt',
  linen_created: 'Wäsche angelegt',
  linen_updated: 'Wäsche angepasst',
  provider_message: 'Nachricht an Dienstleister',
  termin_frage: 'Terminfrage',
  termin_geaendert: 'Termin geändert',
};

// Status-Werte -> Anzeige (Label, Farbe, Icon). Reine Darstellung, kein Eingriff.
// Fallback (unten) zeigt unbekannte Status als Rohwert mit neutralem Stil.
const STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }
> = {
  zur_pruefung: {
    label: 'Zur Prüfung',
    variant: 'secondary',
    icon: <Clock className="h-3 w-3 mr-1" />,
  },
  gesendet: {
    label: 'Gesendet',
    variant: 'default',
    icon: <CheckCircle className="h-3 w-3 mr-1" />,
  },
  erledigt: {
    label: 'Erledigt',
    variant: 'default',
    icon: <CheckCircle className="h-3 w-3 mr-1" />,
  },
  fehler: {
    label: 'Fehler',
    variant: 'destructive',
    icon: <XCircle className="h-3 w-3 mr-1" />,
  },
  abgebrochen: {
    label: 'Abgebrochen',
    variant: 'destructive',
    icon: <XCircle className="h-3 w-3 mr-1" />,
  },
};

const formatDateTimeDE = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

const getActionLabel = (type: string): string =>
  ACTION_TYPE_LABELS[type] ?? type;

// Baut die dynamische Liste der vorhandenen Status für den Filter,
// damit auch neue Status-Werte automatisch auswählbar sind.
const collectStatuses = (actions: MaxAction[]): string[] => {
  const set = new Set<string>();
  actions.forEach((a) => set.add(a.status));
  return Array.from(set).sort();
};

const MaxActionsPanel = ({ open, onOpenChange }: MaxActionsPanelProps) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const {
    data: actions = [],
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ['max_actions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('max_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MaxAction[];
    },
    enabled: open,
  });

  const statuses = collectStatuses(actions);
  const types = Array.from(new Set(actions.map((a) => a.action_type))).sort();

  const filtered = actions.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (typeFilter !== 'all' && a.action_type !== typeFilter) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col z-[200]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Max: Aktionen
            <Badge variant="outline" className="ml-1">
              {actions.length}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Protokoll aller von Max ausgeführten Vorgänge (E-Mails, Termine,
            Wäsche u. a.) mit ihrem aktuellen Status. Nur zur Ansicht.
          </DialogDescription>
        </DialogHeader>

        {/* Filter + Aktualisieren */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Art" />
            </SelectTrigger>
            <SelectContent className="z-[210]">
              <SelectItem value="all">Alle Arten</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>
                  {getActionLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="z-[210]">
              <SelectItem value="all">Alle Status</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_CONFIG[s]?.label ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            title="Aktualisieren"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Lade Aktionen…
            </div>
          ) : error ? (
            <div className="bg-destructive/10 text-destructive p-3 rounded text-sm">
              Fehler beim Laden: {(error as Error).message}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Keine Aktionen für diese Auswahl.
            </div>
          ) : (
            filtered.map((action) => {
              const statusCfg =
                STATUS_CONFIG[action.status] ?? {
                  label: action.status,
                  variant: 'outline' as const,
                  icon: null,
                };

              return (
                <div key={action.id} className="border rounded-lg p-3 bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {getActionLabel(action.action_type)}
                      </p>
                      {action.guest_name && (
                        <p className="text-xs text-muted-foreground">
                          Gast: {action.guest_name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDateTimeDE(action.created_at)}
                        {action.created_by ? ` · ${action.created_by}` : ''}
                      </p>
                    </div>
                    <Badge variant={statusCfg.variant} className="shrink-0">
                      {statusCfg.icon}
                      {statusCfg.label}
                    </Badge>
                  </div>

                  {/* Details (z. B. Empfänger, Betreff, Haus) */}
                  {action.details && (
                    <pre className="mt-2 bg-muted p-2 rounded text-xs overflow-x-auto">
                      {JSON.stringify(action.details, null, 2)}
                    </pre>
                  )}

                  {/* Wenn zwischenzeitlich aktualisiert: Zeitpunkt zeigen */}
                  {action.updated_at &&
                    action.updated_at !== action.created_at && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Aktualisiert: {formatDateTimeDE(action.updated_at)}
                      </p>
                    )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MaxActionsPanel;
