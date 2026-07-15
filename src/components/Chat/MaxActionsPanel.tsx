import { useState, Component, type ReactNode } from 'react';
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

// Eine Station der SOLL-Kette (aus max_ablaeufe).
interface AblaufSchritt {
  aktion: string;
  variante: string | null;
  schritt_nr: number;
  akteur: string | null;
  schritt: string | null;
  ergebnis_status: string | null;
}

// Kurze, lesbare Titel für die Stationen der Workflow-Kette. Die langen
// Original-Texte aus max_ablaeufe passen nicht in eine waagerechte Kette —
// sie erscheinen beim Draufzeigen als Tooltip. Schlüssel: "aktion#schritt_nr".
const STATION_KURZ: Record<string, string> = {
  // Reinigung verschieben
  'reschedule_cleaning#1': 'Änderungswunsch',
  'reschedule_cleaning#2': 'Max ordnet zu',
  'reschedule_cleaning#3': 'Entwurf angelegt',
  'reschedule_cleaning#4': 'Button „öffnen"',
  'reschedule_cleaning#5': 'Uli prüft & „geplant"',
  'reschedule_cleaning#6': 'Amela informiert',

  // Buchungsanfrage annehmen
  'accept_booking_inquiry#1': 'Befehl annehmen',
  'accept_booking_inquiry#2': 'Details zeigen',
  'accept_booking_inquiry#3': 'Uli bestätigt',
  'accept_booking_inquiry#4': 'Buchung angelegt',

  // Buchungsanfrage ablehnen
  'reject_booking_inquiry#1': 'Befehl ablehnen',
  'reject_booking_inquiry#2': 'Anfrage zeigen',
  'reject_booking_inquiry#3': 'Uli bestätigt',
  'reject_booking_inquiry#4': 'Absage gesendet',

  // Terminänderung ablehnen (Amela wollte neuen Termin)
  'reject_reschedule#1': 'Amela: neuer Termin',
  'reject_reschedule#2': 'Max fragt Uli',
  'reject_reschedule#3': 'Uli lehnt ab',
  'reject_reschedule#4': 'Amela: nicht möglich',

  // Wäsche bestellen
  'create_linen_for_booking#1': 'Befehl: Wäsche',
  'create_linen_for_booking#2': 'Buchung suchen',
  'create_linen_for_booking#3': 'Uli wählt Buchung',
  'create_linen_for_booking#4': 'Bestellung „offen"',
  'create_linen_for_booking#5': 'Uli prüft & „ausstehend"',
  'create_linen_for_booking#6': 'Teuni informiert',

  // Wäsche anpassen
  'update_linen_for_booking#1': 'Befehl: anpassen',
  'update_linen_for_booking#2': 'Neue Menge',
  'update_linen_for_booking#3': 'Uli prüft & speichert',
  'update_linen_for_booking#4': 'Teuni informiert',

  // Reinigung anlegen (Normalfall — bei „existiert schon" greift Variante 2)
  'create_cleaning_for_booking#1': 'Befehl: Reinigung',
  'create_cleaning_for_booking#2': 'Buchung suchen',
  'create_cleaning_for_booking#3': 'Uli wählt Buchung',
  'create_cleaning_for_booking#4': 'Karte zeigen',
  'create_cleaning_for_booking#5': 'Entwurf angelegt',
  'create_cleaning_for_booking#6': 'Uli prüft & „geplant"',
  'create_cleaning_for_booking#7': 'Abgeschlossen',

  // Erinnerungen / Rückfragen an Dienstleister
  'max_cleaning_reminders#1': 'Amela: Passt der Termin?',
  'max_linen_reminders#1': 'Teuni: Wäsche liefern',

  // Automatische Prüfungen
  'check_upcoming_bookings#1': 'Prüft & meldet Uli',
  'get_morning_summary#1': 'Tagesübersicht',
  'overdue_watch#1': 'Überfällig → Übersicht',
};

// Wer ist am Zug? Für die kleine Akteur-Markierung an der Station.
const AKTEUR_KURZ: Record<string, string> = {
  uli: 'Uli',
  max: 'Max',
  amela: 'Amela',
  teuni: 'Teuni',
  system: 'System',
};

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
  reject_reschedule: 'Terminänderung abgelehnt',
  create_cleaning_for_booking: 'Reinigung angelegt',
  create_linen_for_booking: 'Wäsche angelegt',
  update_linen_for_booking: 'Wäsche angepasst',
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

// Wandelt ein ISO-Datum (YYYY-MM-DD) in TT.MM.JJJJ. Andere Werte unverändert.
const dateOnlyDE = (v: unknown): string => {
  if (typeof v !== 'string') return String(v ?? '');
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
};

// Technische Felder, die den Nutzer nie interessieren (IDs, Rohflags).
const HIDE_KEYS = new Set([
  'task_id', 'order_id', 'booking_id', 'linen_order_id', 'quelle',
  'success', 'already_existed', 'order_created', 'zurueckgesetzt',
]);

// Deutsche Labels für generisch angezeigte Detail-Felder (Fallback-Fall).
const DETAIL_LABELS: Record<string, string> = {
  haus: 'Haus',
  house_name: 'Haus',
  gast: 'Gast',
  guest_name: 'Gast',
  check_in: 'Anreise',
  check_out: 'Abreise',
  delivery_date: 'Lieferung',
  altes_datum: 'Altes Datum',
  neues_datum: 'Neues Datum',
  termin_bleibt: 'Termin bleibt',
  grund: 'Grund',
  an: 'An',
  nachricht: 'Nachricht',
  art: 'Art',
  alte_menge: 'Alte Menge',
  neue_menge: 'Neue Menge',
  gaeste: 'Gäste',
  total_items: 'Artikel',
  estimated_cost: 'Kosten',
  notes: 'Notiz',
};

// Baut aus den Roh-details eine oder mehrere lesbare Zeilen (statt JSON).
// Pro Aktionstyp die wichtigsten Felder in Klartext; alles Technische fällt weg.
const detailsLesbar = (
  actionType: string,
  details: Record<string, unknown> | null,
): string[] => {
  if (!details) return [];
  const d = details as Record<string, unknown>;
  const zeilen: string[] = [];
  const haus = (d.haus ?? d.house_name) as string | undefined;

  switch (actionType) {
    case 'reschedule_cleaning':
      if (haus) zeilen.push(`${haus}`);
      if (d.altes_datum && d.neues_datum)
        zeilen.push(`${dateOnlyDE(d.altes_datum)} → ${dateOnlyDE(d.neues_datum)}`);
      break;

    case 'reject_reschedule':
      if (haus) zeilen.push(`${haus}`);
      if (d.gast) zeilen.push(`Gast: ${d.gast}`);
      if (d.termin_bleibt) zeilen.push(`Termin bleibt: ${dateOnlyDE(d.termin_bleibt)}`);
      break;

    case 'accept_booking_inquiry':
      if (haus) zeilen.push(`${haus}`);
      if (d.check_in && d.check_out)
        zeilen.push(`${dateOnlyDE(d.check_in)} – ${dateOnlyDE(d.check_out)}`);
      break;

    case 'reject_booking_inquiry':
      if (haus) zeilen.push(`${haus}`);
      if (d.grund) zeilen.push(`Grund: ${d.grund}`);
      break;

    case 'provider_message':
      if (d.an) zeilen.push(`An: ${d.an}`);
      if (d.nachricht) zeilen.push(`${d.nachricht}`);
      break;

    case 'update_linen_for_booking':
      if (haus) zeilen.push(`${haus}`);
      if (d.alte_menge != null && d.neue_menge != null)
        zeilen.push(`Menge: ${d.alte_menge} → ${d.neue_menge}`);
      else if (d.neue_menge != null) zeilen.push(`Menge: ${d.neue_menge}`);
      if (d.gaeste != null) zeilen.push(`Gäste: ${d.gaeste}`);
      break;

    case 'create_cleaning_for_booking':
    case 'create_linen_for_booking':
    case 'auto_linen_created':
      if (haus) zeilen.push(`${haus}`);
      if (d.guest_name) zeilen.push(`Gast: ${d.guest_name}`);
      if (d.delivery_date) zeilen.push(`Lieferung: ${dateOnlyDE(d.delivery_date)}`);
      if (d.total_items != null) zeilen.push(`${d.total_items} Artikel`);
      break;

    default: {
      // Unbekannter Typ: Felder generisch als „Label: Wert", IDs/Flags weglassen.
      for (const [k, v] of Object.entries(d)) {
        if (HIDE_KEYS.has(k) || v == null || typeof v === 'object') continue;
        const label = DETAIL_LABELS[k] ?? k;
        const wert = /datum|date|check_/.test(k) ? dateOnlyDE(v) : String(v);
        zeilen.push(`${label}: ${wert}`);
      }
    }
  }
  return zeilen;
};

// Farbe/Icon eines Kettenschritts anhand von Schlüsselwörtern im Text.
// Grün = erledigt, Gelb = wartend/offen, Rot = Problem/überfällig.
const stepStyle = (schritt: string): { cls: string; icon: React.ReactNode } => {
  const s = (schritt ?? '').toLowerCase();
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

/**
 * Bestimmt für einen Vorgang, bei welcher Station der Workflow gerade steht.
 * Rückgabe: Index der AKTUELLEN Station (0-basiert), oder anzahl = fertig.
 *
 * Beste Quelle ist waiting_for: Es sagt, WER als Nächstes handeln muss.
 * Wartet der Vorgang z.B. auf Uli, ist die aktuelle Station die erste
 * uli-Station, die noch nicht erledigt ist. Fällt das aus (kein waiting_for),
 * zählen wir ersatzweise die protokollierten Schritte.
 */
function aktuelleStation(action: MaxAction, stationen: AblaufSchritt[]): number {
  const anzahl = stationen.length;
  if (anzahl === 0) return -1;

  if (['abgeschlossen', 'abgelehnt'].includes(action.status)) return anzahl;

  // waiting_for sagt, wer als Nächstes handeln muss. Kommt der Akteur mehrfach
  // in der Kette vor (z.B. Uli am Anfang als Auslöser UND später als Prüfer),
  // ist die SPÄTERE Station gemeint — der Anfang ist längst erledigt.
  if (action.waiting_for) {
    const indizes = stationen
      .map((s, i) => ((s.akteur ?? '') === action.waiting_for ? i : -1))
      .filter((i) => i >= 0);
    if (indizes.length > 0) return indizes[indizes.length - 1];
  }

  // Fallback ohne waiting_for: so weit wie protokolliert.
  const verlaufLen = Array.isArray(action.details?.verlauf)
    ? action.details!.verlauf!.length
    : action.last_step
    ? 1
    : 0;
  return Math.min(verlaufLen, anzahl - 1);
}

// Sicherheitsnetz: Fängt einen Render-Fehler der Workflow-Kette ab, damit ein
// einzelner kaputter Vorgang NICHT das ganze Panel (und damit den Chat-Button)
// mitreißt. Zeigt stattdessen einen dezenten Hinweis in der Karte.
class KettenBoundary extends Component<
  { children: ReactNode },
  { fehler: string | null }
> {
  state = { fehler: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { fehler: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.fehler) {
      return (
        <div className="mt-3 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
          Workflow-Anzeige nicht verfügbar ({this.state.fehler})
        </div>
      );
    }
    return this.props.children;
  }
}

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

  // Die SOLL-Ketten (Workflow-Definitionen) aus max_ablaeufe.
  // Damit zeichnen wir pro Vorgang den ganzen Ablauf von Anfang bis Ende und
  // markieren, wie weit er ist.
  const { data: ablaeufe = [] } = useQuery({
    queryKey: ['max_ablaeufe_fuer_ketten'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('max_ablaeufe')
        .select('aktion, variante, schritt_nr, akteur, schritt, ergebnis_status')
        .order('schritt_nr', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AblaufSchritt[];
    },
    enabled: open,
  });

  // Schritte nach action_type gruppieren (Variante 'standard' bevorzugt).
  const ablaufNachAktion = new Map<string, AblaufSchritt[]>();
  for (const sch of ablaeufe) {
    const arr = ablaufNachAktion.get(sch.aktion) ?? [];
    arr.push(sch);
    ablaufNachAktion.set(sch.aktion, arr);
  }

  // Auswahllisten für die Filter-Dropdowns. Diese beiden Zeilen waren beim
  // Umbau der Workflow-Kette versehentlich entfernt worden — ohne sie wirft
  // die Komponente "types is not defined" und reißt den ganzen Chat mit.
  const statuses = collectStatuses(actions);
  const types = Array.from(new Set(actions.map((a) => a.action_type))).sort();

  const filtered = actions.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (typeFilter !== 'all' && a.action_type !== typeFilter) return false;
    return true;
  });

  // ---- Gruppierung: Vorgänge derselben Reinigung/Wäsche zusammenfassen ----
  // Mehrere Einträge mit derselben related_task_id gehören zur SELBEN Reinigung
  // (z.B. zweimal verschoben = zwei Vorgänge, aber eine Reinigung). Sie werden
  // unter einer gemeinsamen Überschrift gebündelt. Jeder Vorgang bleibt seine
  // eigene Karte mit eigener Kette und eigenem Status (Entscheidung Uli: Option 2 —
  // jede Verschiebung ist ein eigener Vorgang, nur sichtbar als zusammengehörig).
  // Einträge ohne task_id (z.B. Willkommens-E-Mail) bleiben je für sich.
  type ActionGroup = {
    key: string;
    guest_name: string | null;
    action_type: string;
    entries: MaxAction[];
  };

  const groups: ActionGroup[] = [];
  const byKey = new Map<string, ActionGroup>();

  for (const a of filtered) {
    // Nur bündeln, wenn eine task_id existiert UND mehr als ein Filter-neutraler
    // Blick sinnvoll ist. Schlüssel = task_id (dieselbe Reinigung).
    const groupKey = a.related_task_id
      ? `task:${a.related_task_id}`
      : `single:${a.id}`; // ohne task_id: eigene Gruppe pro Eintrag

    let g = byKey.get(groupKey);
    if (!g) {
      g = {
        key: groupKey,
        guest_name: a.guest_name,
        action_type: a.action_type,
        entries: [],
      };
      byKey.set(groupKey, g);
      groups.push(g);
    }
    g.entries.push(a);
  }

  // Innerhalb einer Gruppe: neueste Vorgänge zuerst (wie die Gesamtliste).
  for (const g of groups) {
    g.entries.sort(
      (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime(),
    );
  }

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
            groups.map((group) => {
              const mehrere = group.entries.length > 1;
              return (
                <div key={group.key} className={mehrere ? 'space-y-2' : ''}>
                  {/* Überschrift NUR, wenn mehrere Vorgänge zur selben Reinigung
                      gehören — dann sieht man: eine Reinigung, mehrere Vorgänge. */}
                  {mehrere && (
                    <div className="flex items-center gap-2 px-1 pt-1">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                        {getActionLabel(group.action_type)}
                        {group.guest_name ? ` · ${group.guest_name}` : ''}
                        {` · ${group.entries.length} Vorgänge`}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div className={mehrere ? 'space-y-2 pl-2 border-l-2 border-muted' : ''}>
                  {group.entries.map((action) => {
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

                  <KettenBoundary>
                  {/* WORKFLOW-KETTE: der ganze Ablauf von Anfang bis Ende.
                      Stationen aus max_ablaeufe; erledigte grün, aktuelle
                      hervorgehoben, kommende blass. So sieht man auf einen
                      Blick, wo der Vorgang steht. */}
                  {(() => {
                    const stationen = ablaufNachAktion.get(action.action_type) ?? [];
                    if (stationen.length === 0) return null;
                    const aktuell = aktuelleStation(action, stationen);

                    return (
                      <div className="mt-3 flex flex-wrap items-stretch gap-1 text-xs">
                        {stationen.map((st, i) => {
                          const erledigt = i < aktuell;
                          const istAktuell = i === aktuell;
                          const kurz =
                            STATION_KURZ[`${action.action_type}#${st.schritt_nr}`] ??
                            (st.schritt ?? '').slice(0, 22);
                          const akteur = AKTEUR_KURZ[st.akteur] ?? (st.akteur ?? '');

                          // Farben je Zustand: erledigt = grün, aktuell = blau,
                          // kommend = blass. Akteur-Zeile nimmt jeweils den
                          // passenden gedämpften Ton.
                          const cls = erledigt
                            ? 'bg-green-100 text-green-800 border-green-200'
                            : istAktuell
                            ? 'bg-blue-600 text-white border-blue-700 font-medium shadow-sm'
                            : 'bg-muted text-muted-foreground/60 border-transparent';
                          const akteurCls = erledigt
                            ? 'text-green-700/80'
                            : istAktuell
                            ? 'text-blue-100'
                            : 'text-muted-foreground/60';

                          return (
                            <span key={st.schritt_nr} className="flex items-center gap-1">
                              <span
                                className={`inline-flex flex-col gap-0.5 rounded-lg border px-2 py-1 ${cls}`}
                                title={`${akteur}: ${st.schritt ?? ''}`}
                              >
                                <span className={`text-[10px] uppercase tracking-wide ${akteurCls}`}>
                                  {akteur || '—'}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  {erledigt && <CheckCircle className="h-3 w-3" />}
                                  {kurz}
                                </span>
                              </span>
                              {i < stationen.length - 1 && (
                                <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0 self-center" />
                              )}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Fallback: Vorgang OHNE definierten Ablauf (z.B. Willkommens-
                      E-Mail) — zeigt die tatsächlichen Schritte aus verlauf. */}
                  {!ablaufNachAktion.get(action.action_type) &&
                    Array.isArray(action.details?.verlauf) &&
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
                  </KettenBoundary>

                  {/* Falls gar nichts vorhanden: letzten Schritt zeigen */}
                  {!ablaufNachAktion.get(action.action_type) &&
                    (!action.details?.verlauf ||
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

                  {/* Details in Klartext (statt Roh-JSON): pro Aktionstyp die
                      wichtigsten Felder, technische IDs ausgeblendet. */}
                  {action.details &&
                    (() => {
                      const zeilen = detailsLesbar(action.action_type, action.details);
                      return zeilen.length > 0 ? (
                        <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                          {zeilen.map((z, i) => (
                            <p key={i} className={i === 0 ? 'font-medium text-foreground' : ''}>
                              {z}
                            </p>
                          ))}
                        </div>
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
                  })}
                  </div>
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
