import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle, Download, ExternalLink, FileSignature, Loader2, Pencil, Plus, RotateCcw, Settings2, Trash2, Upload, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { RentalOffer } from '@/hooks/useRentalInquiries';
import {
  CONTRACT_STATUS_LABEL, uploadContractFile, useContractTemplate, useDocumentLinks, useHouseContractData,
  useHouseInventoryForContract, useRentalContract, useSaveRentalContract, RentalContract,
} from '@/hooks/useRentalContracts';
import {
  ausfuellen, auffaelligeMengen, ContractValues, FilledContract, geld, inventarGruppen, InventoryItem,
  Position, PositionKind, startWerte, summe, vertragsEnde,
} from '@/lib/rentalContract';
import { protokollPdf, vertragPdf, PdfInput } from '@/lib/rentalContractPdf';
import RentalContractDataDialog from './RentalContractDataDialog';

interface RentalContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: RentalOffer | null;
  guestPhone?: string | null;
  houseName: string;
}

const dmy = (iso?: string | null) => (iso ? format(parseISO(iso), 'dd.MM.yyyy') : '');
const dateiSauber = (s: string) => s.replace(/[\\/:*?"<>|#%]/g, ' ').replace(/\s+/g, ' ').trim();

const herunterladen = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

/**
 * Mietvertrag zu einem ANGENOMMENEN Angebot (Paket D, SQL 74).
 * Vorbelegt aus Angebot, Selbstauskunft und Vertragsdaten des Hauses; alles änderbar.
 * „Ausfertigen“ speichert eine Kopie von Text, Protokoll-Zeilen und Inventar, erzeugt zwei PDFs
 * (Vertrag mit Anhängen, Übergabeprotokoll) und legt sie im OneDrive-Ordner des Angebots ab.
 * Danach: ausdrucken, unterschreiben, Scan hochladen → „unterschrieben“.
 */
const RentalContractDialog = ({ open, onOpenChange, offer, guestPhone, houseName }: RentalContractDialogProps) => {
  const { toast } = useToast();
  const houseId = open && offer ? offer.house_id : null;
  const { data: vorlage, isLoading: l1 } = useContractTemplate(houseId);
  const { data: hausdaten, isLoading: l2 } = useHouseContractData(houseId);
  const { data: inventar = [], isLoading: l3 } = useHouseInventoryForContract(houseId);
  const { data: vertrag, isLoading: l4 } = useRentalContract(open && offer ? offer.id : null);
  const sichern = useSaveRentalContract();
  const [w, setW] = useState<ContractValues | null>(null);
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [datenOffen, setDatenOffen] = useState(false);
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const dateiRef = useRef<HTMLInputElement>(null);
  const { data: doks = [] } = useDocumentLinks([vertrag?.contract_document_id, vertrag?.protocol_document_id, vertrag?.signed_document_id]);

  // Werte laden: gespeicherter Vertrag, sonst aus Angebot + Selbstauskunft
  useEffect(() => {
    if (!open || !offer || l4) return;
    if (vertrag) { setW({ ...startWerte(offer, null, guestPhone ?? null), ...vertrag.values }); return; }
    (supabase as any).from('rental_applications').select('full_name, birth_date, adults, children')
      .eq('offer_id', offer.id).maybeSingle()
      .then(({ data }: { data: any }) => setW(startWerte(offer, data ?? null, guestPhone ?? null)));
  }, [open, offer, vertrag, l4, guestPhone]);

  useEffect(() => { if (!open) { setW(null); setBearbeite(null); } }, [open]);

  const gefuellt: FilledContract | null = useMemo(
    () => (vorlage && w ? ausfuellen(vorlage.content, w, hausdaten ?? null) : null),
    [vorlage, w, hausdaten],
  );

  if (!offer) return null;
  const laedt = l1 || l2 || l3 || l4 || !w;
  const status = vertrag?.status ?? 'draft';
  const gesperrt = status === 'issued' || status === 'signed';
  const setze = <K extends keyof ContractValues>(k: K, v: ContractValues[K]) => setW(a => (a ? { ...a, [k]: v } : a));
  const setzePos = (i: number, p: Partial<Position>) =>
    setW(a => (a ? { ...a, positions: a.positions.map((x, j) => (j === i ? { ...x, ...p } : x)) } : a));

  const merkmale = auffaelligeMengen(inventar);
  const name = w?.mieter_name || offer.guest_name;
  const kurz = hausdaten?.object_short || houseName;
  const basisName = dateiSauber(`${kurz} - ${name} (${dmy(w?.beginn) || 'ohne Datum'})`);

  const pdfEingabe = (c: FilledContract, items: InventoryItem[], protokoll?: RentalContract['protocol'], v?: ContractValues): PdfInput => {
    const werte = v ?? w!;
    return {
      contract: c,
      protocol: protokoll ?? {
        meters: hausdaten?.meters ?? [], keys: hausdaten?.keys ?? [], rooms: hausdaten?.rooms ?? [], items: c.protocol_items,
      },
      inventory: inventarGruppen(items),
      tenantName: werte.mieter_name, start: dmy(werte.beginn), end: dmy(werte.ende),
      footer: `Mietvertrag ${kurz} – ${werte.mieter_name}`,
    };
  };

  const speichernEntwurf = async (stumm = false) => {
    if (!w) return null;
    try {
      const row = await sichern.mutateAsync({
        id: vertrag?.id,
        row: { offer_id: offer.id, house_id: offer.house_id, template_id: vorlage?.id ?? null, status: 'draft', values: w },
      });
      if (!stumm) toast({ title: 'Entwurf gespeichert' });
      return row;
    } catch (e: any) {
      console.error('[Mietvertrag] Entwurf', e);
      toast({ title: 'Konnte nicht gespeichert werden', description: e?.message, variant: 'destructive' });
      return null;
    }
  };

  const vorschauPdf = () => {
    if (!gefuellt) return;
    herunterladen(vertragPdf(pdfEingabe(gefuellt, inventar)), `ENTWURF Mietvertrag ${basisName}.pdf`);
  };

  const ausfertigen = async () => {
    if (!gefuellt || !w) return;
    if (gefuellt.missing.length) {
      toast({ title: 'Angaben fehlen', description: gefuellt.missing.join(', '), variant: 'destructive' });
      return;
    }
    setArbeitet('Vertrag wird erstellt…');
    try {
      const werte: ContractValues = { ...w, zahltag: hausdaten?.payment_day ?? 3 };
      const protokoll = {
        meters: hausdaten?.meters ?? [], keys: hausdaten?.keys ?? [], rooms: hausdaten?.rooms ?? [], items: gefuellt.protocol_items,
      };
      const eingabe = pdfEingabe(gefuellt, inventar, protokoll, werte);
      const entwurf = await sichern.mutateAsync({
        id: vertrag?.id,
        row: {
          offer_id: offer.id, house_id: offer.house_id, template_id: vorlage?.id ?? null, status: 'draft',
          values: werte, sections: gefuellt, protocol: protokoll, inventory: inventar,
        },
      });
      setArbeitet('Mietvertrag wird in OneDrive abgelegt…');
      const v = await uploadContractFile(offer, houseName, vertragPdf(eingabe), `Mietvertrag ${basisName}.pdf`, 'contract');
      setArbeitet('Übergabeprotokoll wird in OneDrive abgelegt…');
      const p = await uploadContractFile(offer, houseName, protokollPdf(eingabe), `Übergabeprotokoll ${basisName}.pdf`, 'protocol');
      await sichern.mutateAsync({
        id: entwurf.id,
        row: { status: 'issued', issued_at: new Date().toISOString(), contract_document_id: v.documentId, protocol_document_id: p.documentId },
      });
      toast({ title: 'Mietvertrag ausgefertigt', description: 'Beide PDFs liegen in OneDrive beim Interessenten. Zum Ausdrucken unten herunterladen.' });
    } catch (e: any) {
      console.error('[Mietvertrag] ausfertigen', e);
      toast({ title: 'Ausfertigen fehlgeschlagen', description: e?.message, variant: 'destructive' });
    } finally {
      setArbeitet(null);
    }
  };

  /** PDFs aus der gespeicherten Kopie neu erzeugen (Ausdruck), ohne neu abzulegen. */
  const ausKopie = (art: 'vertrag' | 'protokoll') => {
    if (!vertrag?.sections) return;
    const eingabe = pdfEingabe(vertrag.sections, vertrag.inventory ?? [], vertrag.protocol ?? undefined, vertrag.values);
    if (art === 'vertrag') herunterladen(vertragPdf(eingabe), `Mietvertrag ${basisName}.pdf`);
    else herunterladen(protokollPdf(eingabe), `Übergabeprotokoll ${basisName}.pdf`);
  };

  const wiederBearbeiten = async () => {
    if (!vertrag) return;
    try {
      await sichern.mutateAsync({ id: vertrag.id, row: { status: 'draft' } });
      toast({ title: 'Wieder in Bearbeitung', description: 'Die abgelegten PDFs bleiben in OneDrive. Beim erneuten Ausfertigen entstehen neue.' });
    } catch (e: any) {
      toast({ title: 'Nicht möglich', description: e?.message, variant: 'destructive' });
    }
  };

  const stornieren = async () => {
    if (!vertrag || !window.confirm('Vertrag stornieren? Die PDFs bleiben in OneDrive, ein neuer Vertrag kann angelegt werden.')) return;
    try {
      await sichern.mutateAsync({ id: vertrag.id, row: { status: 'cancelled' } });
      toast({ title: 'Vertrag storniert' });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Nicht möglich', description: e?.message, variant: 'destructive' });
    }
  };

  const unterschriebenHochladen = async (datei: File | undefined) => {
    if (!datei || !vertrag) return;
    const endung = datei.name.split('.').pop()?.toLowerCase() ?? 'pdf';
    setArbeitet('Unterschriebener Vertrag wird abgelegt…');
    try {
      const r = await uploadContractFile(offer, houseName, datei, `Mietvertrag unterschrieben ${basisName}.${endung}`, 'signed');
      await sichern.mutateAsync({
        id: vertrag.id, row: { status: 'signed', signed_at: new Date().toISOString(), signed_document_id: r.documentId },
      });
      toast({ title: 'Unterschriebener Vertrag abgelegt', description: 'Jetzt kann „Als Mieter übernehmen“ folgen.' });
    } catch (e: any) {
      console.error('[Mietvertrag] unterschrieben', e);
      toast({ title: 'Hochladen fehlgeschlagen', description: e?.message, variant: 'destructive' });
    } finally {
      setArbeitet(null);
      if (dateiRef.current) dateiRef.current.value = '';
    }
  };

  const feld = (k: keyof ContractValues, label: string, typ = 'text', platzhalter = '') => (
    <div className="space-y-1">
      <Label htmlFor={`mv-${k}`} className="text-xs">{label}</Label>
      <Input id={`mv-${k}`} type={typ} value={(w?.[k] as string) ?? ''} placeholder={platzhalter} disabled={gesperrt}
        onChange={e => setze(k, e.target.value as never)} />
    </div>
  );

  const dokLink = (id: string | null | undefined, label: string) => {
    const d = doks.find(x => x.id === id);
    if (!id) return null;
    return d?.onedrive_web_url ? (
      <a href={d.onedrive_web_url} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:underline text-sm">
        {label}<ExternalLink className="h-3 w-3" />
      </a>
    ) : <span className="text-sm">{label}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mietvertrag — {offer.guest_name}</DialogTitle>
          <DialogDescription>
            {houseName} · Status: <strong>{vertrag ? CONTRACT_STATUS_LABEL[status] : 'noch nicht angelegt'}</strong>
            {vertrag?.issued_at && <> · ausgefertigt {dmy(vertrag.issued_at)}</>}
            {vertrag?.signed_at && <> · unterschrieben {dmy(vertrag.signed_at)}</>}
          </DialogDescription>
        </DialogHeader>

        {laedt ? (
          <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Wird geladen…</span>
          </div>
        ) : !vorlage ? (
          <p className="text-sm text-destructive">Keine Vertragsvorlage gefunden — SQL 74 ausgeführt?</p>
        ) : (
          <div className="space-y-5">
            {gesperrt && (
              <div className="rounded-lg border border-primary bg-primary/5 p-3 space-y-2 text-sm">
                <div className="font-semibold">Abgelegt in OneDrive</div>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {dokLink(vertrag?.contract_document_id, 'Mietvertrag')}
                  {dokLink(vertrag?.protocol_document_id, 'Übergabeprotokoll')}
                  {dokLink(vertrag?.signed_document_id, 'Unterschriebener Vertrag')}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => ausKopie('vertrag')}><Download className="h-4 w-4 mr-1" />Vertrag (PDF)</Button>
                  <Button size="sm" variant="outline" onClick={() => ausKopie('protokoll')}><Download className="h-4 w-4 mr-1" />Übergabeprotokoll (PDF)</Button>
                  <input ref={dateiRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp" className="hidden"
                    onChange={e => unterschriebenHochladen(e.target.files?.[0])} />
                  <Button size="sm" onClick={() => dateiRef.current?.click()} disabled={!!arbeitet}>
                    <Upload className="h-4 w-4 mr-1" />{status === 'signed' ? 'Unterschrift erneut hochladen' : 'Unterschriebenen Vertrag hochladen'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ausdrucken, zweimal unterschreiben, Scan hier hochladen. Danach im Angebot „Als Mieter übernehmen“.
                  Energieausweis vor der Unterschrift vorlegen.
                </p>
              </div>
            )}

            {gefuellt && gefuellt.missing.length > 0 && !gesperrt && (
              <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <strong>Noch offen ({gefuellt.missing.length}):</strong> {gefuellt.missing.join(', ')}.
                  <span className="block text-xs mt-1">Hausbezogenes unter „Vertragsdaten“, Mieterangaben unten. Im Text steht dafür „[…]“.</span>
                </div>
              </div>
            )}

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">Mieter</h3>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {feld('mieter_name', 'Vor- und Nachname')}
                {feld('mieter_geburtsdatum', 'Geburtsdatum', 'date')}
                {feld('mieter_email', 'E-Mail')}
                {feld('mieter_telefon', 'Telefon')}
                {feld('mieter_staatsangehoerigkeit', 'Staatsangehörigkeit (optional)')}
                {feld('mieter_ausweis', 'Ausweis-Nr. (optional)', 'text', 'leer = Zeile entfällt')}
                <div className="sm:col-span-2">{feld('weitere_bewohner', 'Weitere Bewohner (Namen)', 'text', 'leer = keine')}</div>
                <label className="flex items-center gap-2 text-sm pt-5">
                  <Checkbox checked={w!.aufenthaltsnachweis} disabled={gesperrt}
                    onCheckedChange={c => setze('aufenthaltsnachweis', c === true)} />
                  Aufenthaltsnachweis liegt bei
                </label>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold text-sm">Laufzeit</h3>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="mv-beginn" className="text-xs">Mietbeginn</Label>
                  <Input id="mv-beginn" type="date" value={w!.beginn} disabled={gesperrt}
                    onChange={e => setW(a => (a ? { ...a, beginn: e.target.value, ende: vertragsEnde(e.target.value, parseInt(a.dauer_monate) || null) } : a))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mv-dauer" className="text-xs">Dauer (Monate)</Label>
                  <Input id="mv-dauer" type="number" min={1} value={w!.dauer_monate} placeholder="leer = unbefristet" disabled={gesperrt}
                    onChange={e => setW(a => (a ? { ...a, dauer_monate: e.target.value, ende: vertragsEnde(a.beginn, parseInt(e.target.value) || null) } : a))} />
                </div>
                <div className="flex flex-col justify-end pb-2 text-sm">
                  <span className="text-xs text-muted-foreground">Mietende</span>
                  <span className="font-medium">{w!.ende ? dmy(w!.ende) : 'unbefristet'}</span>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">Monatliche Beträge</h3>
                {!gesperrt && (
                  <Button size="sm" variant="outline"
                    onClick={() => setze('positions', [...w!.positions, { label_de: '', label_en: '', amount: 0, kind: 'other' }])}>
                    <Plus className="h-4 w-4 mr-1" />Position
                  </Button>
                )}
              </div>
              {w!.positions.map((p, i) => (
                <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                  <Input className="flex-1 min-w-[10rem]" placeholder="Bezeichnung (Deutsch)" value={p.label_de} disabled={gesperrt}
                    onChange={e => setzePos(i, { label_de: e.target.value })} />
                  <Input className="flex-1 min-w-[10rem]" placeholder="Bezeichnung (Englisch)" value={p.label_en} disabled={gesperrt}
                    onChange={e => setzePos(i, { label_en: e.target.value })} />
                  <Input className="w-28" type="number" step="any" aria-label="Betrag" value={p.amount} disabled={gesperrt}
                    onChange={e => setzePos(i, { amount: Number(e.target.value.replace(',', '.')) || 0 })} />
                  <Select value={p.kind} disabled={gesperrt} onValueChange={v => setzePos(i, { kind: v as PositionKind })}>
                    <SelectTrigger className="w-36" aria-label="Art"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rent">Miete</SelectItem>
                      <SelectItem value="other">Miete (Zusatz)</SelectItem>
                      <SelectItem value="utilities">Nebenkosten</SelectItem>
                    </SelectContent>
                  </Select>
                  {!gesperrt && (
                    <Button size="icon" variant="ghost" aria-label="Position löschen"
                      onClick={() => setze('positions', w!.positions.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="grid sm:grid-cols-3 gap-3 items-end">
                <div className="text-sm">
                  <span className="text-xs text-muted-foreground block">Gesamt pro Monat</span>
                  <span className="font-semibold text-lg">{geld(summe(w!.positions), 'de')}</span>
                </div>
                {feld('kaution', 'Kaution (€)', 'number')}
                {feld('kaution_zusatz', 'Zusatz zur Kaution (optional)', 'text', 'z. B. 3 Monatsmieten')}
                <label className="flex items-center gap-2 text-sm sm:col-span-3">
                  <Switch checked={w!.nk_vorauszahlung} disabled={gesperrt} onCheckedChange={c => setze('nk_vorauszahlung', c)} />
                  Nebenkosten als Vorauszahlung mit Abrechnung (aus = Pauschale ohne Abrechnung)
                </label>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">Haus, Protokoll, Inventar</h3>
                <Button size="sm" variant="outline" onClick={() => setDatenOffen(true)}>
                  <Settings2 className="h-4 w-4 mr-1" />Vertragsdaten {houseName}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Vermieter: {hausdaten?.landlord_name || '—'} · Zähler {hausdaten?.meters?.length ?? 0} · Schlüssel {hausdaten?.keys?.length ?? 0} ·
                Räume {hausdaten?.rooms?.length ?? 0} · Inventar {inventar.length} Einträge
                {hausdaten?.energy_class ? ` · Energieausweis Klasse ${hausdaten.energy_class}` : ' · Energieausweis fehlt'}
              </p>
              {merkmale.length > 0 && (
                <p className="flex gap-2 text-xs rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2">
                  <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                  Auffällige Mengen im Inventar: {merkmale.map(m => `${m.name} (${m.quantity})`).join(', ')} — bitte in der Häuserverwaltung prüfen.
                </p>
              )}
            </section>

            {gefuellt && (
              <section className="space-y-3">
                <h3 className="font-semibold text-sm">Vertragstext</h3>
                {gefuellt.sections.map(s => (
                  <div key={s.title_de} className="rounded-lg border">
                    <div className="px-3 py-1.5 bg-muted/60 text-sm font-semibold">{s.title_de} / {s.title_en}</div>
                    <div className="divide-y">
                      {s.paragraphs.map(p => (
                        <div key={p.key} className="p-3 text-xs">
                          {p.type === 'positions' ? (
                            <div className="text-muted-foreground">
                              {gefuellt.positions.map(x => `${x.label_de || '[Bezeichnung]'} ${geld(x.amount, 'de')}`).join(' · ')}
                              {' · '}<strong>Gesamt {geld(gefuellt.total, 'de')}</strong>
                            </div>
                          ) : bearbeite === p.key ? (
                            <div className="space-y-2">
                              <div className="grid sm:grid-cols-2 gap-2">
                                <Textarea rows={6} defaultValue={p.de} id={`mv-txt-de-${p.key}`} />
                                <Textarea rows={6} defaultValue={p.en} id={`mv-txt-en-${p.key}`} />
                              </div>
                              <div className="flex gap-2 justify-end">
                                <Button size="sm" variant="outline" onClick={() => setBearbeite(null)}>Abbrechen</Button>
                                <Button size="sm" onClick={() => {
                                  const de = (document.getElementById(`mv-txt-de-${p.key}`) as HTMLTextAreaElement)?.value ?? p.de;
                                  const en = (document.getElementById(`mv-txt-en-${p.key}`) as HTMLTextAreaElement)?.value ?? p.en;
                                  setze('overrides', { ...w!.overrides, [p.key]: { de, en } });
                                  setBearbeite(null);
                                }}>Übernehmen</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3">
                              <p className="whitespace-pre-line">{p.de}</p>
                              <p className="whitespace-pre-line text-muted-foreground">{p.en}</p>
                              {!gesperrt && (
                                <div className="flex sm:flex-col gap-1">
                                  <Button size="icon" variant="ghost" aria-label="Absatz ändern" onClick={() => setBearbeite(p.key)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  {p.edited && (
                                    <Button size="icon" variant="ghost" aria-label="Änderung zurücksetzen" title="Text aus der Vorlage"
                                      onClick={() => { const o = { ...w!.overrides }; delete o[p.key]; setze('overrides', o); }}>
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {p.edited && bearbeite !== p.key && <span className="text-[10px] text-primary">geändert (Werte darin werden nicht mehr automatisch eingesetzt)</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {arbeitet && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />{arbeitet}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t">
          {vertrag && status !== 'signed' && (
            <Button variant="ghost" className="mr-auto" onClick={stornieren} disabled={!!arbeitet}>
              <XCircle className="h-4 w-4 mr-1" />Stornieren
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          {gesperrt && status === 'issued' && (
            <Button variant="outline" onClick={wiederBearbeiten} disabled={!!arbeitet}>Wieder bearbeiten</Button>
          )}
          {!gesperrt && (
            <>
              <Button variant="outline" onClick={vorschauPdf} disabled={laedt || !gefuellt}>
                <Download className="h-4 w-4 mr-1" />Entwurf als PDF
              </Button>
              <Button variant="outline" onClick={() => speichernEntwurf()} disabled={laedt || sichern.isPending || !!arbeitet}>
                Entwurf speichern
              </Button>
              <Button onClick={ausfertigen} disabled={laedt || !!arbeitet || !gefuellt}>
                <FileSignature className="h-4 w-4 mr-1" />Ausfertigen und ablegen
              </Button>
            </>
          )}
        </div>
      </DialogContent>
      <RentalContractDataDialog open={datenOffen} onOpenChange={setDatenOffen} houseId={offer.house_id} houseName={houseName} />
    </Dialog>
  );
};

export default RentalContractDialog;
