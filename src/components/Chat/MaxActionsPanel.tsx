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
  MessageSquare,
  ArrowRight,
  Trash2,
} from 'lucide-react';

interface MaxActionsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface WorkflowStep {
  schritt: string;
  zeitpunkt: string;
  akteur?: string;
}

interface MaxAction {
  id: string;
  action_type: string;
  status: string;
  booking_id: string | null;
  guest_name: string | null;
  details: (Record<string, unknown> & { verlauf?: WorkflowStep[] }) | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_step: string | null;
  waiting_for: string | null;
  due_at: string | null;
  related_task_id: string | null;
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
  reschedule_cleaning: 'Reinigung verschoben',
  accept_booking_inquiry: 'Buchungsanfrage angenommen',
  reject_booking_inquiry: 'Buchungsanfrage abgelehnt',
  create_cleaning_for_booking: 'Reinigung angelegt',
  create_linen_for_booking: 'Wäsche angelegt',
  update_linen_for_booking: 'Wäsche angepasst',
  create_bulk_cleaning_tasks: 'Reinigungen (Sammel)',
  create_bulk_linen_orders: 'Wäsche (Sammel)',
  cleaning_termin_check: 'Reinigung: Terminfrage an Dienstleister',
  linen_termin_check: 'Wäsche: Liefer-Erinnerung an Teuni',
  auto_linen_created: 'Wäsche automatisch angelegt',
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
  wartet_uli: {
    label: 'Wartet auf dich',
    variant: 'secondary',
    icon: <Clock className="h-3 w-3 mr-1" />,
  },
  wartet_provider: {
    label: 'Wartet auf Dienstleister',
    variant: 'secondary',
    icon: <Clock className="h-3 w-3 mr-1" />,
  },
  wartet_gast: {
    label: 'Wartet auf Gast',
    variant: 'secondary',
    icon: <Clock className="h-3 w-3 mr-1" />,
  },
  beantwortet: {
    label: 'Beantwortet',
    variant: 'default',
    icon: <CheckCircle className="h-3 w-3 mr-1" />,
  },
  ueberfaellig: {
    label: 'Überfällig',
    variant: 'destructive',
    icon: <Clock className="h-3 w-3 mr-1" />,
  },
  abgeschlossen: {
    label: 'Abgeschlossen',
    variant: 'default',
    icon: <CheckCircle className="h-3 w-3 mr-1" />,
  },
  abgelehnt: {
    label: 'Abgelehnt',
    variant: 'outline',
    icon: <XCircle className="h-3 w-3 mr-1" />,
  },
  problem: {
    label: 'Problem',
    variant: 'destructive',
    icon: <XCircle className="h-3 w-3 mr-1" />,
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

// Farbe/Icon eines Kettenschritts anhand von Schlüsselwörtern im Text.
// Grün = erledigt, Gelb = wartend/offen, Rot = Problem/überfällig.
const stepStyle = (schritt: string): { cls: string; icon: React.ReactNode } => {
  const s = schritt.toLowerCase();
  if (/(überfällig|ueberfaellig|keine antwort|fehler|problem|abgelehnt|nicht möglich)/.test(s)) {
    return {
      cls: 'bg-destructive/10 text-destructive',
      icon: <XCircle className="h-3 w-3 mr-1 shrink-0" />,
    };
  }
  if (/(wartet|offen|nötig|freigabe|prüfen|ausstehend)/.test(s)) {
    return {
      cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
      icon: <Clock className="h-3 w-3 mr-1 shrink-0" />,
    };
  }
  if (/(geantwortet|antwort)/.test(s)) {
    return {
      cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
      icon: <MessageSquare className="h-3 w-3 mr-1 shrink-0" />,
    };
  }
  return {
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    icon: <CheckCircle className="h-3 w-3 mr-1 shrink-0" />,
  };
};

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
  // Lösch-Steuerung: welche Zeile fragt gerade nach ("Löschen?"), welche wird gelöscht.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<boolean>(false);
  const [bulkDeleting, setBulkDeleting] = useState<boolean>(false);

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

  // Einzelnen Eintrag löschen.
  const handleDelete = async (id: string) => {
    setActionError(null);
    setDeletingId(id);
    const { error: delErr } = await supabase.from('max_actions').delete().eq('id', id);
    setDeletingId(null);
    setConfirmId(null);
    if (delErr) {
      setActionError(`Löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }
    await refetch();
  };

  // Alle aktuell gefilterten Einträge löschen (schnelles Aufräumen vieler Fehl-Einträge).
  const handleBulkDelete = async () => {
    setActionError(null);
    setBulkDeleting(true);
    const ids = filtered.map((a) => a.id);
    const { error: delErr } = await supabase.from('max_actions').delete().in('id', ids);
    setBulkDeleting(false);
    setBulkConfirm(false);
    if (delErr) {
      setActionError(`Löschen fehlgeschlagen: ${delErr.message}`);
      return;
    }
    await refetch();
  };

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
            Wäsche u. a.) mit ihrem aktuellen Status. Einträge lassen sich löschen.
          </DialogDescription>
        </DialogHeader>

        {/* Filter + Aktualisieren + gefilterte löschen */}
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

          {/* Gefilterte löschen — nur sinnvoll, wenn etwas gefiltert/vorhanden ist */}
          {filtered.length > 0 &&
            (bulkConfirm ? (
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-xs text-muted-foreground">
                  {filtered.length} löschen?
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 px-2 text-xs"
                  disabled={bulkDeleting}
                  onClick={handleBulkDelete}
                >
                  {bulkDeleting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'Ja, löschen'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setBulkConfirm(false)}
                >
                  Abbrechen
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 ml-auto text-xs text-destructive hover:text-destructive"
                onClick={() => setBulkConfirm(true)}
                title="Alle aktuell angezeigten (gefilterten) Einträge löschen"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Gefilterte löschen ({filtered.length})
              </Button>
            ))}
        </div>

        {actionError && (
          <div className="bg-destructive/10 text-destructive p-2 rounded text-xs">
            {actionError}
          </div>
        )}

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

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={statusCfg.variant} className="shrink-0">
                        {statusCfg.icon}
                        {statusCfg.label}
                      </Badge>

                      {/* Löschen pro Eintrag (mit kurzer Rückfrage) */}
                      {confirmId === action.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 px-2 text-xs"
                            disabled={deletingId === action.id}
                            onClick={() => handleDelete(action.id)}
                          >
                            {deletingId === action.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              'Löschen'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => setConfirmId(null)}
                          >
                            Abbrechen
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          title="Eintrag löschen"
                          onClick={() => setConfirmId(action.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Workflow-Kette: alle Schritte von Anfang bis Ende in einer Zeile */}
                  {Array.isArray(action.details?.verlauf) &&
                    action.details!.verlauf!.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                        {action.details!.verlauf!.map((step, i) => {
                          const st = stepStyle(step.schritt);
                          return (
                            <span key={i} className="flex items-center gap-1.5">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 ${st.cls}`}
                                title={formatDateTimeDE(step.zeitpunkt)}
                              >
                                {st.icon}
                                {step.schritt}
                              </span>
                              {i < action.details!.verlauf!.length - 1 && (
                                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}

                  {/* Falls (noch) keine Kette vorhanden: letzten Schritt zeigen */}
                  {(!action.details?.verlauf ||
                    action.details.verlauf.length === 0) &&
                    action.last_step && (
                      <p className="mt-2 text-sm">
                        <span className="text-muted-foreground">
                          Letzter Schritt:{' '}
                        </span>
                        {action.last_step}
                      </p>
                    )}

                  {/* Auf wen gewartet wird (+ Fälligkeit) */}
                  {action.waiting_for && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Wartet auf:{' '}
                      {action.waiting_for === 'uli'
                        ? 'dich'
                        : action.waiting_for === 'amela'
                        ? 'Amela'
                        : action.waiting_for === 'teuni'
                        ? 'Teuni'
                        : action.waiting_for === 'gast'
                        ? 'Gast'
                        : action.waiting_for}
                      {action.due_at
                        ? ` · fällig bis ${formatDateTimeDE(action.due_at)}`
                        : ''}
                    </p>
                  )}

                  {/* Details (z. B. Empfänger, Betreff, Haus) — ohne verlauf (steht schon als Kette) */}
                  {action.details &&
                    (() => {
                      const rest: Record<string, unknown> = { ...action.details };
                      delete (rest as { verlauf?: unknown }).verlauf;
                      return Object.keys(rest).length > 0 ? (
                        <pre className="mt-2 bg-muted p-2 rounded text-xs overflow-x-auto">
                          {JSON.stringify(rest, null, 2)}
                        </pre>
                      ) : null;
                    })()}

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
