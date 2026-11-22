import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Plus, Scale, CalendarClock, AlertTriangle, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { LegalCase, LegalCaseEntry, LegalEntryType } from "@/types";
import {
  CASE_STATUS_LABELS, CASE_TYPE_LABELS, ENTRY_TYPE_LABELS, ENTRY_FIELDS, KUENDIGUNG_SUBTYPES, PARTY_LABELS,
  hasGracePeriod, isCaseActive,
  useDeleteLegalCase, useDeleteLegalEntry, useSaveLegalEntry,
} from "@/hooks/useLegalCases";
import { useTenantPayments } from "@/hooks/useTenantPayments";
import { calculateArrears } from "@/lib/tenantArrears";
import LegalEntryDialog from "./LegalEntryDialog";
import LegalCaseDocuments from "./LegalCaseDocuments";

interface Props {
  legalCase: LegalCase;
  onEdit: (c: LegalCase) => void;
}

// 'yyyy-MM-dd' als lokalen Tag lesen (nicht UTC-Mitternacht) — wie EditPaymentDialog.tsx
const fmt = (d?: string | null) => (d ? format(parseISO(d), 'dd.MM.yyyy', { locale: de }) : '–');
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
const todayStr = () => format(new Date(), 'yyyy-MM-dd');

// ---------------------------------------------------------------------------
// Auf-/Zuklapp-Zustand je Verfahren und Fenster merken (nur dieser Browser).
// localStorage kann fehlen oder werfen (privater Modus) → dann nur im Speicher.
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'legal-collapse-v1';
const readCollapse = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
};
const writeCollapse = (state: Record<string, boolean>) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* egal */ }
};

const usePersistentOpen = (key: string, defaultOpen: boolean): [boolean, (v: boolean) => void] => {
  const [open, setOpenState] = useState<boolean>(() => readCollapse()[key] ?? defaultOpen);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    writeCollapse({ ...readCollapse(), [key]: v });
  };
  return [open, setOpen];
};

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

/** Mietrückstand eines festvermieteten Objekts, live aus tenant_payments. */
const CaseArrears = ({ houseId }: { houseId: string }) => {
  const { data: payments = [] } = useTenantPayments(houseId);

  // Rechnung liegt seit 22.11.2026 in lib/tenantArrears.ts (eine Stelle für
  // Rechtliches, Häuser-Tab und Übersichtskarte „Mietobjekte").
  const result = useMemo(() => calculateArrears(payments, todayStr()), [payments]);

  if (!result) return null;

  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <div className="font-semibold mb-1">Mietrückstand (live aus Zahlungen)</div>
      <div>{result.months} offene Monate seit {fmt(result.earliest)}: {eur(result.openTotal)}</div>
      {result.specialTotal > 0 && <div>abzüglich Sonderzahlungen: −{eur(result.specialTotal)}</div>}
      <div className="font-semibold mt-1">Rest: {eur(result.rest)}</div>
    </div>
  );
};

/** Schonfrist § 569 Abs. 3 Nr. 2 BGB: zwei Monate ab Zustellung (Rechtshängigkeit). */
const GracePeriod = ({ servedDate }: { servedDate?: string | null }) => {
  if (!servedDate) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="font-semibold mb-1">Schonfrist (§ 569 Abs. 3 Nr. 2 BGB)</div>
        Zustelldatum der Klage fehlt — beim Anwalt erfragen und unter „Bearbeiten" eintragen.
        Dann berechnet die App das Fristende.
      </div>
    );
  }
  const end = addMonths(parseISO(servedDate), 2);
  const daysLeft = differenceInCalendarDays(end, new Date());
  const over = daysLeft < 0;

  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${over ? 'border-gray-300 bg-gray-50 text-gray-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
      <div className="font-semibold mb-1">Schonfrist (§ 569 Abs. 3 Nr. 2 BGB)</div>
      <div>Zugestellt {fmt(servedDate)} → Fristende <strong>{format(end, 'dd.MM.yyyy', { locale: de })}</strong></div>
      <div className="mt-1">
        {over
          ? 'Abgelaufen. Eine Nachzahlung heilt die fristlose Kündigung nicht mehr.'
          : `Noch ${daysLeft} Tage. Zahlt der Mieter bis dahin den GESAMTEN Rückstand, wird die fristlose Kündigung unwirksam (nicht eine hilfsweise ordentliche).`}
      </div>
      <div className="mt-1 text-xs opacity-75">Rechnerischer Wert — Fristende vom Anwalt bestätigen lassen.</div>
    </div>
  );
};

const EntryRow = ({ entry, onEdit }: {
  entry: LegalCaseEntry; onEdit: (e: LegalCaseEntry) => void;
}) => {
  const saveEntry = useSaveLegalEntry();
  const deleteEntry = useDeleteLegalEntry();
  const fields = ENTRY_FIELDS[entry.entry_type];
  const overdue = !entry.done && entry.due_date && entry.due_date < todayStr();
  const upcomingTermin = entry.entry_type === 'termin' && !entry.done && entry.entry_date >= todayStr();
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-b-0">
      {fields.checkable ? (
        <Checkbox className="mt-1" checked={entry.done}
          onCheckedChange={(v) => saveEntry.mutate({ id: entry.id, done: v === true })}
          aria-label="Erledigt" />
      ) : <span className="w-4 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs text-muted-foreground">{fmt(entry.entry_date)}</span>
          {entry.subtype && <Badge variant="outline" className="text-xs">{KUENDIGUNG_SUBTYPES[entry.subtype] ?? entry.subtype}</Badge>}
          {entry.party && <Badge variant="secondary" className="text-xs">{PARTY_LABELS[entry.party] ?? entry.party}</Badge>}
          {entry.reference && <Badge variant="outline" className="text-xs font-mono">{entry.reference}</Badge>}
          {upcomingTermin && <Badge className="text-xs bg-blue-600">bevorstehend</Badge>}
        </div>
        <div className={`text-sm mt-0.5 ${entry.done ? 'line-through text-muted-foreground' : 'font-medium'}`}>{entry.title}</div>
        {entry.details && <div className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">{entry.details}</div>}
        {entry.due_date && (
          <div className={`text-xs mt-0.5 ${overdue ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
            fällig bis {fmt(entry.due_date)}{overdue ? ' — überfällig' : ''}
          </div>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={() => onEdit(entry)} title="Bearbeiten / ergänzen">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} title="Löschen"
        className="text-destructive hover:text-destructive hover:bg-destructive/10">
        <Trash2 className="h-4 w-4" />
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>„{entry.title}" wird gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteEntry.mutate(entry.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** Ein- und ausklappbares Fenster mit Kopfzeile, Zähler und optionalem Plus-Knopf. */
const Section = ({ storageKey, title, count, badge, defaultOpen, onAdd, addLabel, children }: {
  storageKey: string; title: string; count?: number; badge?: React.ReactNode; defaultOpen: boolean;
  onAdd?: () => void; addLabel?: string; children: React.ReactNode;
}) => {
  const [open, setOpen] = usePersistentOpen(storageKey, defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40">
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-left flex-1 min-w-0">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="truncate">{title}</span>
          {count !== undefined && <span className="text-xs font-normal text-muted-foreground">({count})</span>}
          {badge}
        </CollapsibleTrigger>
        {onAdd && (
          <Button variant="ghost" size="sm" onClick={() => { setOpen(true); onAdd(); }}>
            <Plus className="h-4 w-4 mr-1" /> {addLabel}
          </Button>
        )}
      </div>
      <CollapsibleContent className="px-3 py-2">{children}</CollapsibleContent>
    </Collapsible>
  );
};

// Fenster in dieser Reihenfolge. Leere Fenster starten zugeklappt.
const SECTIONS: { key: string; types: LegalEntryType[]; title: string; addType: LegalEntryType; addLabel: string; sort: 'asc' | 'desc' | 'open' }[] = [
  { key: 'kuendigung',  types: ['kuendigung'],        title: 'Kündigungen',               addType: 'kuendigung',  addLabel: 'Kündigung', sort: 'asc' },
  { key: 'termin',      types: ['termin'],            title: 'Termine',                   addType: 'termin',      addLabel: 'Termin',    sort: 'desc' },
  { key: 'aufgabe',     types: ['frist', 'aufgabe'],  title: 'Fristen & Aufgaben',        addType: 'aufgabe',     addLabel: 'Aufgabe',   sort: 'open' },
  { key: 'frage',       types: ['frage'],             title: 'Fragen an den Anwalt',      addType: 'frage',       addLabel: 'Frage',     sort: 'open' },
  { key: 'schriftsatz', types: ['schriftsatz'],       title: 'Schriftsätze & Schreiben',  addType: 'schriftsatz', addLabel: 'Schriftsatz', sort: 'desc' },
  { key: 'beweis',      types: ['beweis'],            title: 'Beweise & Anlagen',         addType: 'beweis',      addLabel: 'Beweis',    sort: 'asc' },
  { key: 'ereignis',    types: ['ereignis'],          title: 'Chronik',                   addType: 'ereignis',    addLabel: 'Ereignis',  sort: 'desc' },
];

const LegalCaseCard = ({ legalCase, onEdit }: Props) => {
  const deleteCase = useDeleteLegalCase();
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; entry?: LegalCaseEntry | null; type: LegalEntryType }>({ open: false, type: 'ereignis' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Ganze Karte ein-/ausklappen; laufende Verfahren starten offen
  const [cardOpen, setCardOpen] = usePersistentOpen(`${legalCase.id}:card`, isCaseActive(legalCase));
  // Zähler, damit „alle auf/zu" die Fenster neu mountet
  const [sectionReset, setSectionReset] = useState(0);

  const entries = legalCase.legal_case_entries ?? [];
  const isLongTerm = legalCase.houses?.rental_type === 'long_term';
  const active = isCaseActive(legalCase);
  const openTasks = entries.filter(e => ENTRY_FIELDS[e.entry_type]?.checkable && e.entry_type !== 'termin' && !e.done).length;
  const overdueTasks = entries.filter(e => !e.done && e.due_date && e.due_date < todayStr()).length;

  const sorted = (types: LegalEntryType[], mode: 'asc' | 'desc' | 'open') => {
    const list = entries.filter(e => types.includes(e.entry_type));
    if (mode === 'asc') return [...list].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    if (mode === 'desc') return [...list].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    // offene zuerst, dann nach Fälligkeit
    return [...list].sort((a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
      a.entry_date.localeCompare(b.entry_date));
  };

  const setAllSections = (open: boolean) => {
    const state = readCollapse();
    ['overview', 'documents', ...SECTIONS.map(s => s.key)].forEach(k => { state[`${legalCase.id}:${k}`] = open; });
    writeCollapse(state);
    setSectionReset(n => n + 1);
  };

  return (
    <Card className={`p-4 sm:p-6 ${active ? '' : 'opacity-70'}`}>
      <Collapsible open={cardOpen} onOpenChange={setCardOpen}>
        {/* Kopf — immer sichtbar */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <CollapsibleTrigger className="flex items-start gap-3 text-left flex-1 min-w-0">
            {cardOpen ? <ChevronDown className="h-5 w-5 mt-1.5 shrink-0" /> : <ChevronRight className="h-5 w-5 mt-1.5 shrink-0" />}
            <Scale className="h-6 w-6 text-primary shrink-0 mt-1" />
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground">{legalCase.houses?.name ?? 'Objekt'}{legalCase.file_number ? ` · ${legalCase.file_number}` : ''}</div>
              <h3 className="text-lg font-semibold">{legalCase.title}</h3>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge variant="outline">{CASE_TYPE_LABELS[legalCase.case_type]}</Badge>
                <Badge variant={active ? 'default' : 'secondary'}>{CASE_STATUS_LABELS[legalCase.status]}</Badge>
                {openTasks > 0 && <Badge variant="secondary">{openTasks} offen</Badge>}
                {overdueTasks > 0 && <Badge variant="destructive">{overdueTasks} überfällig</Badge>}
              </div>
            </div>
          </CollapsibleTrigger>
          <div className="flex gap-1 flex-wrap">
            {cardOpen && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setAllSections(true)} title="Alle Fenster aufklappen">
                  <ChevronsUpDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAllSections(false)} title="Alle Fenster zuklappen">
                  <ChevronsDownUp className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => onEdit(legalCase)}>
              <Pencil className="h-4 w-4 mr-1" /> Bearbeiten
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} title="Verfahren löschen"
              className="text-destructive hover:text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div key={sectionReset} className="space-y-3 mt-4">
            {/* Überblick: Stammdaten, Sachstand, Schonfrist, Rückstand */}
            <Section storageKey={`${legalCase.id}:overview`} title="Überblick & Sachstand" defaultOpen={true}
              onAdd={() => onEdit(legalCase)} addLabel="Ergänzen">
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                  <div><span className="text-muted-foreground">Gegenpartei:</span> {legalCase.opponent || '–'}</div>
                  <div><span className="text-muted-foreground">Gericht/Behörde:</span> {legalCase.court_or_authority || '–'}</div>
                  <div><span className="text-muted-foreground">Aktenzeichen:</span> {legalCase.file_number || '–'}</div>
                  <div className="sm:col-span-2 lg:col-span-3"><span className="text-muted-foreground">Anwalt:</span> {legalCase.lawyer_name || '–'}{legalCase.lawyer_contact ? ` · ${legalCase.lawyer_contact}` : ''}</div>
                  <div><span className="text-muted-foreground">Eingereicht:</span> {fmt(legalCase.filed_date)}</div>
                  <div><span className="text-muted-foreground">Zugestellt:</span> {fmt(legalCase.served_date)}</div>
                  {legalCase.next_hearing_date && (
                    <div className="flex items-center gap-1 font-medium">
                      <CalendarClock className="h-4 w-4" /> Nächster Termin: {fmt(legalCase.next_hearing_date)}
                    </div>
                  )}
                </div>
                {legalCase.summary && (
                  <div className="text-sm whitespace-pre-line rounded-md bg-muted/50 px-4 py-3">{legalCase.summary}</div>
                )}
                {active && (hasGracePeriod(legalCase) || isLongTerm) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {hasGracePeriod(legalCase) && <GracePeriod servedDate={legalCase.served_date} />}
                    {isLongTerm && <CaseArrears houseId={legalCase.house_id} />}
                  </div>
                )}
              </div>
            </Section>

            {SECTIONS.map(section => {
              const list = sorted(section.types, section.sort);
              const open = list.filter(e => ENTRY_FIELDS[e.entry_type].checkable && !e.done).length;
              return (
                <Section key={section.key} storageKey={`${legalCase.id}:${section.key}`}
                  title={section.title} count={list.length}
                  badge={open > 0 && section.key !== 'termin' ? <Badge variant="secondary" className="text-xs">{open} offen</Badge> : undefined}
                  defaultOpen={list.length > 0 && (section.key === 'aufgabe' || section.key === 'kuendigung' || section.key === 'termin')}
                  onAdd={() => setEntryDialog({ open: true, entry: null, type: section.addType })}
                  addLabel={section.addLabel}>
                  {list.length === 0
                    ? <p className="text-xs text-muted-foreground">Keine Einträge — über „+ {section.addLabel}" ergänzen.</p>
                    : list.map(e => (
                        <EntryRow key={e.id} entry={e}
                          onEdit={(en) => setEntryDialog({ open: true, entry: en, type: en.entry_type })} />
                      ))}
                </Section>
              );
            })}

            {/* Dokumente: aus der Dokumentenverwaltung (OneDrive), verknüpft über 'verfahren' */}
            <Section storageKey={`${legalCase.id}:documents`} title="Dokumente" defaultOpen={false}>
              <LegalCaseDocuments legalCase={legalCase} />
            </Section>

            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> Merkliste, keine Rechtsberatung — Fristen und Vorgehen mit dem Anwalt abstimmen.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <LegalEntryDialog
        open={entryDialog.open}
        onOpenChange={(open) => setEntryDialog(prev => ({ ...prev, open }))}
        caseId={legalCase.id}
        entry={entryDialog.entry}
        defaultType={entryDialog.type}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verfahren wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{legalCase.title}" wird mit allen {entries.length} Einträgen dauerhaft gelöscht. Dokumente bleiben in der Dokumentenverwaltung erhalten.
              Wenn das Verfahren nur abgeschlossen ist, stattdessen den Status auf „Erledigt" setzen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteCase.mutate(legalCase.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default LegalCaseCard;
