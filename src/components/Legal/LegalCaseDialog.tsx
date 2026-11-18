import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHouses } from "@/hooks/useHouses";
import { useSaveLegalCase, CASE_TYPE_LABELS, CASE_STATUS_LABELS, hasGracePeriod } from "@/hooks/useLegalCases";
import { LegalCase, LegalCaseStatus, LegalCaseType } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bestehendes Verfahren bearbeiten; leer = neu anlegen */
  legalCase?: LegalCase | null;
  /** Vorbelegtes Objekt beim Anlegen */
  defaultHouseId?: string;
}

type FormState = {
  house_id: string;
  title: string;
  case_type: LegalCaseType;
  status: LegalCaseStatus;
  opponent: string;
  court_or_authority: string;
  file_number: string;
  lawyer_name: string;
  lawyer_contact: string;
  filed_date: string;
  served_date: string;
  next_hearing_date: string;
  summary: string;
};

const fromCase = (c?: LegalCase | null, defaultHouseId?: string): FormState => ({
  house_id: c?.house_id ?? defaultHouseId ?? '',
  title: c?.title ?? '',
  case_type: c?.case_type ?? 'sonstiges',
  status: c?.status ?? 'offen',
  opponent: c?.opponent ?? '',
  court_or_authority: c?.court_or_authority ?? '',
  file_number: c?.file_number ?? '',
  lawyer_name: c?.lawyer_name ?? '',
  lawyer_contact: c?.lawyer_contact ?? '',
  filed_date: c?.filed_date ?? '',
  served_date: c?.served_date ?? '',
  next_hearing_date: c?.next_hearing_date ?? '',
  summary: c?.summary ?? '',
});

// Leere Textfelder als null speichern — DATE-Spalten lehnen '' ab
// (gleiches Muster wie EditPaymentDialog.tsx).
const emptyToNull = (v: string) => (v.trim() === '' ? null : v);

const LegalCaseDialog = ({ open, onOpenChange, legalCase, defaultHouseId }: Props) => {
  const { data: houses = [] } = useHouses();
  const saveCase = useSaveLegalCase();
  const [form, setForm] = useState<FormState>(fromCase(legalCase, defaultHouseId));

  // Dialog bleibt gemountet → beim Öffnen frisch aus dem Verfahren befüllen
  useEffect(() => {
    if (open) setForm(fromCase(legalCase, defaultHouseId));
  }, [open, legalCase, defaultHouseId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const canSave = form.house_id !== '' && form.title.trim() !== '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    try {
      await saveCase.mutateAsync({
      id: legalCase?.id,
      house_id: form.house_id,
      title: form.title.trim(),
      case_type: form.case_type,
      status: form.status,
      opponent: emptyToNull(form.opponent),
      court_or_authority: emptyToNull(form.court_or_authority),
      file_number: emptyToNull(form.file_number),
      lawyer_name: emptyToNull(form.lawyer_name),
      lawyer_contact: emptyToNull(form.lawyer_contact),
      filed_date: emptyToNull(form.filed_date),
      served_date: emptyToNull(form.served_date),
      next_hearing_date: emptyToNull(form.next_hearing_date),
        summary: emptyToNull(form.summary),
      });
      onOpenChange(false);
    } catch {
      // Fehlermeldung kommt aus onError im Hook; Dialog bleibt offen
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{legalCase ? 'Verfahren bearbeiten' : 'Neues Verfahren'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Objekt *</Label>
              <Select value={form.house_id} onValueChange={(v) => set('house_id', v)}>
                <SelectTrigger><SelectValue placeholder="Objekt wählen" /></SelectTrigger>
                <SelectContent>
                  {houses.map(h => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Art</Label>
              <Select value={form.case_type} onValueChange={(v) => set('case_type', v as LegalCaseType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CASE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Bezeichnung *</Label>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)}
              placeholder="z. B. Räumungsklage wegen Mietrückstand" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v as LegalCaseStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CASE_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gegenpartei</Label>
              <Input value={form.opponent} onChange={(e) => set('opponent', e.target.value)}
                placeholder="Mieter, Behörde, Firma …" />
            </div>
            <div>
              <Label>Gericht / Behörde</Label>
              <Input value={form.court_or_authority} onChange={(e) => set('court_or_authority', e.target.value)} />
            </div>
            <div>
              <Label>Aktenzeichen / Geschäftszahl</Label>
              <Input value={form.file_number} onChange={(e) => set('file_number', e.target.value)} />
            </div>
            <div>
              <Label>Anwalt</Label>
              <Input value={form.lawyer_name} onChange={(e) => set('lawyer_name', e.target.value)} />
            </div>
            <div>
              <Label>Kontakt Anwalt</Label>
              <Input value={form.lawyer_contact} onChange={(e) => set('lawyer_contact', e.target.value)}
                placeholder="Telefon, E-Mail" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Eingereicht am</Label>
              <Input type="date" value={form.filed_date} onChange={(e) => set('filed_date', e.target.value)} />
            </div>
            <div>
              <Label>Zugestellt am</Label>
              <Input type="date" value={form.served_date} onChange={(e) => set('served_date', e.target.value)} />
            </div>
            <div>
              <Label>Nächster Termin</Label>
              <Input type="date" value={form.next_hearing_date} onChange={(e) => set('next_hearing_date', e.target.value)} />
            </div>
          </div>
          {hasGracePeriod({ case_type: form.case_type }) && (
            <p className="text-xs text-muted-foreground -mt-2">
              „Zugestellt am" = Zustellung der Klage an den Mieter. Daraus berechnet die App das
              Ende der Schonfrist (§ 569 Abs. 3 Nr. 2 BGB, zwei Monate).
            </p>
          )}

          <div>
            <Label>Sachstand</Label>
            <Textarea rows={5} value={form.summary} onChange={(e) => set('summary', e.target.value)} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={!canSave || saveCase.isPending}>Speichern</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LegalCaseDialog;
