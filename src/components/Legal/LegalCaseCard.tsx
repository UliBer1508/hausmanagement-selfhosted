import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Pencil, Trash2, Plus, Scale, CalendarClock, AlertTriangle } from "lucide-react";
import { addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { LegalCase, LegalCaseEntry, LegalEntryType } from "@/types";
import {
  CASE_STATUS_LABELS, CASE_TYPE_LABELS, ENTRY_TYPE_LABELS,
  hasGracePeriod, isCaseActive,
  useDeleteLegalCase, useDeleteLegalEntry, useSaveLegalEntry,
} from "@/hooks/useLegalCases";
import { useTenantPayments } from "@/hooks/useTenantPayments";
import LegalEntryDialog from "./LegalEntryDialog";

interface Props {
  legalCase: LegalCase;
  onEdit: (c: LegalCase) => void;
}

// 'yyyy-MM-dd' als lokalen Tag lesen (nicht UTC-Mitternacht) — wie EditPaymentDialog.tsx
const fmt = (d?: string | null) => (d ? format(parseISO(d), 'dd.MM.yyyy', { locale: de }) : '–');
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';

/** Mietrückstand eines festvermieteten Objekts, live aus tenant_payments. */
const CaseArrears = ({ houseId }: { houseId: string }) => {
  const { data: payments = [] } = useTenantPayments(houseId);

  const result = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const openRent = payments.filter(p =>
      p.payment_type !== 'special' &&
      (p.status === 'overdue' || p.status === 'pending') &&
      p.due_date <= today,
    );
    if (openRent.length === 0) return null;

    const openTotal = openRent.reduce((s, p) => s + p.amount, 0);
    const earliest = openRent.map(p => p.due_date).sort()[0];
    // Sonderzahlungen seit dem ältesten offenen Monat — noch keinem Monat zugeordnet,
    // mindern aber den tatsächlichen Rückstand (siehe TenantPayments.tsx).
    const specials = payments.filter(p =>
      p.payment_type === 'special' && p.status === 'paid' && (p.payment_date ?? p.due_date) >= earliest,
    );
    const specialTotal = specials.reduce((s, p) => s + p.amount, 0);

    return {
      months: openRent.length,
      openTotal,
      specialTotal,
      rest: Math.max(0, openTotal - specialTotal),
      earliest,
    };
  }, [payments]);

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

const EntryRow = ({ entry, onEdit }: { entry: LegalCaseEntry; onEdit: (e: LegalCaseEntry) => void }) => {
  const saveEntry = useSaveLegalEntry();
  const deleteEntry = useDeleteLegalEntry();
  const checkable = entry.entry_type !== 'ereignis';
  const overdue = !entry.done && entry.due_date && entry.due_date < format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-b-0">
      {checkable ? (
        <Checkbox
          className="mt-1"
          checked={entry.done}
          onCheckedChange={(v) => saveEntry.mutate({ id: entry.id, done: v === true })}
          aria-label="Erledigt"
        />
      ) : (
        <span className="text-xs text-muted-foreground w-20 shrink-0 mt-0.5">{fmt(entry.entry_date)}</span>
      )}
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${entry.done ? 'line-through text-muted-foreground' : 'font-medium'}`}>
          {entry.title}
        </div>
        {entry.details && <div className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">{entry.details}</div>}
        {entry.due_date && (
          <div className={`text-xs mt-0.5 ${overdue ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
            fällig bis {fmt(entry.due_date)}{overdue ? ' — überfällig' : ''}
          </div>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={() => onEdit(entry)} title="Bearbeiten">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => deleteEntry.mutate(entry.id)} title="Löschen"
        className="text-destructive hover:text-destructive hover:bg-destructive/10">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

const SECTIONS: { type: LegalEntryType[]; title: string; addType: LegalEntryType }[] = [
  { type: ['frist', 'aufgabe'], title: 'Fristen & Aufgaben', addType: 'aufgabe' },
  { type: ['frage'], title: 'Fragen an den Anwalt', addType: 'frage' },
  { type: ['ereignis'], title: 'Chronik', addType: 'ereignis' },
];

const LegalCaseCard = ({ legalCase, onEdit }: Props) => {
  const deleteCase = useDeleteLegalCase();
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; entry?: LegalCaseEntry | null; type: LegalEntryType }>({ open: false, type: 'ereignis' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const entries = legalCase.legal_case_entries ?? [];
  const isLongTerm = legalCase.houses?.rental_type === 'long_term';
  const active = isCaseActive(legalCase);
  const openTasks = entries.filter(e => e.entry_type !== 'ereignis' && !e.done).length;

  const sorted = (types: LegalEntryType[]) => {
    const list = entries.filter(e => types.includes(e.entry_type));
    // Chronik: neueste zuerst. Aufgaben/Fragen: offene zuerst, dann nach Fälligkeit.
    if (types.includes('ereignis')) return [...list].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    return [...list].sort((a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
      a.entry_date.localeCompare(b.entry_date));
  };

  return (
    <Card className={`p-4 sm:p-6 space-y-4 ${active ? '' : 'opacity-70'}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <Scale className="h-6 w-6 text-primary shrink-0 mt-1" />
          <div>
            <div className="text-sm text-muted-foreground">{legalCase.houses?.name ?? 'Objekt'}</div>
            <h3 className="text-lg font-semibold">{legalCase.title}</h3>
            <div className="flex flex-wrap gap-2 mt-1">
              <Badge variant="outline">{CASE_TYPE_LABELS[legalCase.case_type]}</Badge>
              <Badge variant={active ? 'default' : 'secondary'}>{CASE_STATUS_LABELS[legalCase.status]}</Badge>
              {openTasks > 0 && <Badge variant="destructive">{openTasks} offen</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(legalCase)}>
            <Pencil className="h-4 w-4 mr-1" /> Bearbeiten
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} title="Verfahren löschen"
            className="text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-sm">
        <div><span className="text-muted-foreground">Gegenpartei:</span> {legalCase.opponent || '–'}</div>
        <div><span className="text-muted-foreground">Gericht/Behörde:</span> {legalCase.court_or_authority || '–'}</div>
        <div><span className="text-muted-foreground">Aktenzeichen:</span> {legalCase.file_number || '–'}</div>
        <div><span className="text-muted-foreground">Anwalt:</span> {legalCase.lawyer_name || '–'}{legalCase.lawyer_contact ? ` (${legalCase.lawyer_contact})` : ''}</div>
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

      {SECTIONS.map(section => {
        const list = sorted(section.type);
        return (
          <div key={section.title}>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-semibold">{section.title}</h4>
              <Button variant="ghost" size="sm"
                onClick={() => setEntryDialog({ open: true, entry: null, type: section.addType })}>
                <Plus className="h-4 w-4 mr-1" /> {ENTRY_TYPE_LABELS[section.addType]}
              </Button>
            </div>
            {list.length === 0
              ? <p className="text-xs text-muted-foreground">Keine Einträge.</p>
              : list.map(e => (
                  <EntryRow key={e.id} entry={e}
                    onEdit={(en) => setEntryDialog({ open: true, entry: en, type: en.entry_type })} />
                ))}
          </div>
        );
      })}

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <AlertTriangle className="h-3 w-3" /> Merkliste, keine Rechtsberatung — Fristen und Vorgehen mit dem Anwalt abstimmen.
      </p>

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
              „{legalCase.title}" wird mit allen {entries.length} Einträgen dauerhaft gelöscht.
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
