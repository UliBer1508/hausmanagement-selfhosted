import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSaveLegalEntry, ENTRY_TYPE_LABELS } from "@/hooks/useLegalCases";
import { LegalCaseEntry, LegalEntryType } from "@/types";
import { todayISO } from "@/lib/dateHelpers";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId: string;
  /** Bestehenden Eintrag bearbeiten; leer = neu */
  entry?: LegalCaseEntry | null;
  defaultType?: LegalEntryType;
}

const LegalEntryDialog = ({ open, onOpenChange, caseId, entry, defaultType = 'ereignis' }: Props) => {
  const saveEntry = useSaveLegalEntry();
  const [entryType, setEntryType] = useState<LegalEntryType>(defaultType);
  const [entryDate, setEntryDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (!open) return;
    setEntryType(entry?.entry_type ?? defaultType);
    setEntryDate(entry?.entry_date ?? todayISO());
    setDueDate(entry?.due_date ?? '');
    setTitle(entry?.title ?? '');
    setDetails(entry?.details ?? '');
  }, [open, entry, defaultType]);

  const showDueDate = entryType === 'aufgabe' || entryType === 'frist';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() === '') return;
    try {
      await saveEntry.mutateAsync({
      id: entry?.id,
      case_id: caseId,
      entry_type: entryType,
      entry_date: entryDate || todayISO(),
      due_date: showDueDate && dueDate ? dueDate : null,
      title: title.trim(),
        details: details.trim() === '' ? null : details.trim(),
      });
      toast.success(entry ? 'Eintrag gespeichert' : 'Eintrag hinzugefügt');
      onOpenChange(false);
    } catch {
      // Fehlermeldung kommt aus onError im Hook; Dialog bleibt offen
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{entry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Art</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as LegalEntryType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ENTRY_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Datum</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            {showDueDate && (
              <div>
                <Label>Fällig bis</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
          </div>

          <div>
            <Label>Titel *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <Label>Details</Label>
            <Textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={title.trim() === '' || saveEntry.isPending}>Speichern</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LegalEntryDialog;
