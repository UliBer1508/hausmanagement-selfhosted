import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useHouseContractData, useSaveHouseContractData } from '@/hooks/useRentalContracts';
import { HouseContractData, LEERE_HAUSDATEN, ProtocolRow } from '@/lib/rentalContract';

interface RentalContractDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  houseId: string | null;
  houseName: string;
}

type TextKey = {
  [K in keyof HouseContractData]: HouseContractData[K] extends string | null ? K : never
}[keyof HouseContractData];
type NumKey = 'max_occupants' | 'small_repair_case' | 'small_repair_year' | 'notice_after_months'
  | 'notice_period_months' | 'payment_day' | 'energy_hwb' | 'energy_fgee';
type ListKey = 'meters' | 'keys' | 'rooms';

/**
 * „Vertragsdaten“ je Haus (rental_contract_house_data, SQL 74): alles Hausbezogene für Mietvertrag
 * und Übergabeprotokoll. Der Vertragstext selbst liegt in rental_contract_templates und enthält
 * nur Platzhalter — hier stehen die Werte dazu.
 */
const RentalContractDataDialog = ({ open, onOpenChange, houseId, houseName }: RentalContractDataDialogProps) => {
  const { toast } = useToast();
  const { data, isLoading } = useHouseContractData(open ? houseId : null);
  const speichern = useSaveHouseContractData();
  const [w, setW] = useState<HouseContractData | null>(null);

  useEffect(() => {
    if (!open || !houseId || isLoading) return;
    const basis = data ?? LEERE_HAUSDATEN(houseId);
    setW({ ...basis, meters: basis.meters ?? [], keys: basis.keys ?? [], rooms: basis.rooms ?? [] });
  }, [open, houseId, data, isLoading]);

  if (!houseId) return null;

  const text = (k: TextKey, label: string, mehrzeilig = false, hinweis?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`vd-${k}`} className="text-xs">{label}</Label>
      {mehrzeilig ? (
        <Textarea id={`vd-${k}`} rows={3} value={(w?.[k] as string) ?? ''}
          onChange={e => setW(a => (a ? { ...a, [k]: e.target.value || null } : a))} />
      ) : (
        <Input id={`vd-${k}`} value={(w?.[k] as string) ?? ''}
          onChange={e => setW(a => (a ? { ...a, [k]: e.target.value || null } : a))} />
      )}
      {hinweis && <p className="text-[11px] text-muted-foreground">{hinweis}</p>}
    </div>
  );

  const zahlFeld = (k: NumKey, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`vd-${k}`} className="text-xs">{label}</Label>
      <Input id={`vd-${k}`} type="number" step="any" value={w?.[k] ?? ''}
        onChange={e => {
          const z = e.target.value === '' ? null : Number(e.target.value.replace(',', '.'));
          setW(a => (a ? { ...a, [k]: z } as HouseContractData : a));
        }} />
    </div>
  );

  const paar = (de: TextKey, en: TextKey, label: string, mehrzeilig = false, hinweis?: string) => (
    <div className="grid sm:grid-cols-2 gap-3">
      {text(de, `${label} (Deutsch)`, mehrzeilig, hinweis)}
      {text(en, `${label} (Englisch)`, mehrzeilig)}
    </div>
  );

  const liste = (k: ListKey, titel: string, mitNummer = false) => {
    const zeilen = (w?.[k] ?? []) as ProtocolRow[];
    const setze = (neu: ProtocolRow[]) => setW(a => (a ? { ...a, [k]: neu } : a));
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{titel}</span>
          <Button size="sm" variant="outline" onClick={() => setze([...zeilen, { de: '', en: '' }])}>
            <Plus className="h-4 w-4 mr-1" />Zeile
          </Button>
        </div>
        {zeilen.length === 0 && <p className="text-xs text-muted-foreground">Noch keine Zeilen.</p>}
        {zeilen.map((z, i) => (
          <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
            <Input className="flex-1 min-w-[9rem]" placeholder="Deutsch" value={z.de}
              onChange={e => setze(zeilen.map((x, j) => (j === i ? { ...x, de: e.target.value } : x)))} />
            <Input className="flex-1 min-w-[9rem]" placeholder="Englisch" value={z.en}
              onChange={e => setze(zeilen.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)))} />
            {mitNummer && (
              <Input className="w-full sm:w-32" placeholder="Zähler-Nr." value={z.no ?? ''}
                onChange={e => setze(zeilen.map((x, j) => (j === i ? { ...x, no: e.target.value } : x)))} />
            )}
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" aria-label="nach oben" disabled={i === 0}
                onClick={() => { const n = [...zeilen]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setze(n); }}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="nach unten" disabled={i === zeilen.length - 1}
                onClick={() => { const n = [...zeilen]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setze(n); }}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Zeile löschen"
                onClick={() => setze(zeilen.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const sichern = async () => {
    if (!w) return;
    const tag = Number(w.payment_day);
    if (!(tag >= 1 && tag <= 28)) {
      toast({ title: 'Zahltag prüfen', description: 'Der Zahltag muss zwischen 1 und 28 liegen.', variant: 'destructive' });
      return;
    }
    const sauber = (l: ProtocolRow[]) => l.filter(z => z.de.trim() || z.en.trim())
      .map(z => ({ de: z.de.trim(), en: z.en.trim(), ...(z.no?.trim() ? { no: z.no.trim() } : {}) }));
    try {
      await speichern.mutateAsync({
        ...w,
        notice_after_months: Number(w.notice_after_months) || 6,
        notice_period_months: Number(w.notice_period_months) || 3,
        payment_day: tag,
        meters: sauber(w.meters), keys: sauber(w.keys), rooms: sauber(w.rooms),
      });
      toast({ title: 'Vertragsdaten gespeichert' });
      onOpenChange(false);
    } catch (e: any) {
      console.error('[Vertragsdaten] speichern', e);
      toast({ title: 'Konnte nicht gespeichert werden', description: e?.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vertragsdaten — {houseName}</DialogTitle>
          <DialogDescription>
            Angaben für Mietvertrag und Übergabeprotokoll (Wohnen auf Zeit). Gelten für alle neuen Verträge dieses Hauses;
            ausgefertigte Verträge behalten ihren Stand.
          </DialogDescription>
        </DialogHeader>

        {!w ? (
          <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Wird geladen…</span>
          </div>
        ) : (
          <Tabs defaultValue="vermieter">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="vermieter">Vermieter & Konto</TabsTrigger>
              <TabsTrigger value="objekt">Objekt & Recht</TabsTrigger>
              <TabsTrigger value="regeln">Gemeinde & Regeln</TabsTrigger>
              <TabsTrigger value="energie">Energieausweis</TabsTrigger>
              <TabsTrigger value="protokoll">Protokoll</TabsTrigger>
            </TabsList>

            <TabsContent value="vermieter" className="space-y-3 pt-3">
              <div className="grid sm:grid-cols-2 gap-3">
                {text('landlord_name', 'Vermieter (Vor- und Nachname)')}
                {text('landlord_address', 'Anschrift')}
                {text('landlord_email', 'E-Mail')}
                {text('landlord_phone', 'Telefon')}
                {text('account_holder', 'Kontoinhaber')}
                {text('iban', 'IBAN')}
                {text('bic', 'BIC')}
                {zahlFeld('payment_day', 'Zahltag (Tag im Monat)')}
              </div>
              {paar('vat_note_de', 'vat_note_en', 'Umsatzsteuer', false,
                'Z. B. „keine (Kleinunternehmer)“ / „none (small business)“ — mit dem Steuerberater klären.')}
            </TabsContent>

            <TabsContent value="objekt" className="space-y-3 pt-3">
              {text('object_title', 'Kopfzeile', false, 'Steht unter „Mietvertrag“, z. B. „Einfamilienhaus …, 5741 Neukirchen am Großvenediger“.')}
              {text('object_short', 'Kurzbezeichnung', false, 'Für Verwendungszweck und Fußzeile, z. B. „VS 316“.')}
              {paar('object_de', 'object_en', 'Mietgegenstand', true,
                'Wird eingesetzt in „Vermietet wird …“: Art, Adresse, Wohnfläche, möbliert, Ausstattung.')}
              {paar('mrg_note_de', 'mrg_note_en', 'Rechtliche Einordnung (MRG)', true,
                'Nur eintragen, wenn geprüft: Vollausnahme nach § 1 Abs 2 Z 5 MRG gilt für Häuser mit höchstens zwei selbständigen Wohnungen. Eigentumswohnung in einer Anlage → anderes Recht (Befristung!).')}
              {!w.mrg_note_de && (
                <p className="flex gap-2 text-xs rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2">
                  <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                  Ohne rechtliche Einordnung fehlt im Vertrag der Hinweis, welches Recht gilt. Bei einer Wohnung in einer
                  Wohnungseigentumsanlage kann eine Befristung unter 3 Jahren unwirksam sein — vor dem ersten Vertrag klären.
                </p>
              )}
              <div className="grid sm:grid-cols-3 gap-3">
                {zahlFeld('max_occupants', 'Höchstzahl Bewohner')}
                {zahlFeld('notice_after_months', 'Mieter kann kündigen nach (Monaten)')}
                {zahlFeld('notice_period_months', 'Kündigungsfrist (Monate)')}
              </div>
            </TabsContent>

            <TabsContent value="regeln" className="space-y-3 pt-3">
              {paar('municipality_de', 'municipality_en', 'Gemeinde', false, 'Z. B. „Marktgemeinde Neukirchen“ / „municipality of Neukirchen“.')}
              {paar('registration_hint_de', 'registration_hint_en', 'Anleitung Anmeldung (Meldezettel)', true)}
              {paar('house_rules_de', 'house_rules_en', 'Hausbesonderheiten', true,
                'Z. B. Heizungs-/PV-Steuerung, Sauna, Kamin. Leer = Absatz entfällt.')}
              <div className="grid sm:grid-cols-3 gap-3">
                {zahlFeld('small_repair_case', 'Kleinreparatur je Fall (€)')}
                {zahlFeld('small_repair_year', 'Kleinreparatur pro Jahr (€)')}
                <div className="space-y-1">
                  <Label className="text-xs">Winterdienst</Label>
                  <Select value={w.winter_service ?? 'offen'}
                    onValueChange={v => setW(a => (a ? { ...a, winter_service: v === 'offen' ? null : v as 'tenant' | 'landlord' } : a))}>
                    <SelectTrigger aria-label="Winterdienst"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="offen">noch offen</SelectItem>
                      <SelectItem value="tenant">Mieter</SelectItem>
                      <SelectItem value="landlord">Vermieter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="energie" className="space-y-3 pt-3">
              <p className="text-xs text-muted-foreground">
                Pflicht bei jeder Vermietung (EAVG): vor Vertragsabschluss vorlegen, spätestens 14 Tage danach aushändigen.
                Höchstens 10 Jahre alt. Die Werte brauchen auch die Anzeigen auf den Portalen.
              </p>
              <div className="grid sm:grid-cols-4 gap-3">
                {zahlFeld('energy_hwb', 'HWB (kWh/m²a)')}
                {zahlFeld('energy_fgee', 'fGEE')}
                {text('energy_class', 'Klasse')}
                <div className="space-y-1">
                  <Label htmlFor="vd-energy_issued_on" className="text-xs">Ausgestellt am</Label>
                  <Input id="vd-energy_issued_on" type="date" value={w.energy_issued_on ?? ''}
                    onChange={e => setW(a => (a ? { ...a, energy_issued_on: e.target.value || null } : a))} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="protokoll" className="space-y-5 pt-3">
              {liste('meters', 'Zähler', true)}
              {liste('keys', 'Schlüssel')}
              {liste('rooms', 'Räume')}
              <p className="text-xs text-muted-foreground">Das Inventar kommt aus der Häuserverwaltung (Inventar des Hauses).</p>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={sichern} disabled={!w || speichern.isPending}>
            {speichern.isPending ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RentalContractDataDialog;
