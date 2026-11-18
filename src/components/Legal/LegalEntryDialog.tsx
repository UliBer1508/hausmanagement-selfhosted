import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useSaveLegalEntry, useUploadLegalFile,
  ENTRY_TYPE_LABELS, ENTRY_FIELDS, KUENDIGUNG_SUBTYPES, PARTY_LABELS,
} from "@/hooks/useLegalCases";
import { LegalCaseEntry, LegalEntryType, LegalParty } from "@/types";
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

const NONE = '__none__';

const LegalEntryDialog = ({ open, onOpenChange, caseId, entry, defaultType = 'ereignis' }: Props) => {
  const saveEntry = useSaveLegalEntry();
  const uploadFile = useUploadLegalFile();
  const [entryType, setEntryType] = useState<LegalEntryType>(defaultType);
  const [entryDate, setEntryDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [subtype, setSubtype] = useState<string>(NONE);
  const [party, setParty] = useState<string>(NONE);
  const [reference, setReference] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!open) return;
    setEntryType(entry?.entry_type ?? defaultType);
    setEntryDate(entry?.entry_date ?? todayISO());
    setDueDate(entry?.due_date ?? '');
    setTitle(entry?.title ?? '');
    setDetails(entry?.details ?? '');
    setSubtype(entry?.subtype ?? NONE);
    setParty(entry?.party ?? NONE);
    setReference(entry?.reference ?? '');
    setFiles([]);
  }, [open, entry, defaultType]);

  const fields = ENTRY_FIELDS[entryType];
  const busy = saveEntry.isPending || uploadFile.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() === '') return;
    try {
      const saved = await saveEntry.mutateAsync({
        id: entry?.id,
        case_id: caseId,
        entry_type: entryType,
        entry_date: entryDate || todayISO(),
        due_date: fields.due && dueDate ? dueDate : null,
        title: title.trim(),
        details: details.trim() === '' ? null : details.trim(),
        subtype: fields.subtype && subtype !== NONE ? subtype : null,
        party: fields.party && party !== NONE ? (party as LegalParty) : null,
        reference: fields.reference && reference.trim() !== '' ? reference.trim() : null,
      });
      // Dateien nacheinander — so bleibt die Reihenfolge erhalten
      for (const file of files) {
        await uploadFile.mutateAsync({ caseId, entryId: saved.id, file, description: null });
      }
      toast.success(entry ? 'Eintrag gespeichert' : 'Eintrag hinzugefügt');
      onOpenChange(false);
    } catch {
      // Fehlermeldung kommt aus onError im Hook; Dialog bleibt offen
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            {fields.subtype && (
              <div>
                <Label>Art der Kündigung</Label>
                <Select value={subtype} onValueChange={setSubtype}>
                  <SelectTrigger><SelectValue placeholder="wählen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>– keine Angabe –</SelectItem>
                    {Object.entries(KUENDIGUNG_SUBTYPES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Datum</Label>
              <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
            </div>
            {fields.due && (
              <div>
                <Label>Fällig bis</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
          </div>

          {(fields.party || fields.reference) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.party && (
                <div>
                  <Label>Von wem</Label>
                  <Select value={party} onValueChange={setParty}>
                    <SelectTrigger><SelectValue placeholder="wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>– keine Angabe –</SelectItem>
                      {Object.entries(PARTY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {fields.reference && (
                <div>
                  <Label>Anlage / Zeichen</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="z. B. B1, K3, 190/26" />
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Titel *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <Label>Details</Label>
            <Textarea rows={5} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>

          <div>
            <Label>Dateien anhängen</Label>
            <Input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.eml,.msg"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">{files.length} Datei(en) werden beim Speichern hochgeladen.</p>
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button type="submit" disabled={title.trim() === '' || busy}>{busy ? 'Speichert …' : 'Speichern'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LegalEntryDialog;
