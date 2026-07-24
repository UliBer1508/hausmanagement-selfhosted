import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Upload, FileText, AlertTriangle, Info, CheckCircle2, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useCreateLaundryInvoice } from '@/hooks/useLaundryInvoices';
import { useHouses } from '@/hooks/useHouses';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// TEUNI-RECHNUNG AUS PDF IMPORTIEREN
// ============================================================
//
// Ablauf: PDF waehlen -> Edge Function 'import-teuni-invoice' liest und
// prueft -> Vorschau mit Warnungen -> Uli gibt frei -> Rechnung wird angelegt.
//
// WARUM DIE FREIGABE: Die Edge Function schreibt bewusst NICHTS. Bei Geld
// soll keine automatische Erkennung einen Betrag setzen, den niemand
// angesehen hat. Das Muster entspricht dem 'draft'-Prinzip bei den
// Reinigungsterminen.
//
// bezahlt_am wird hier NICHT gesetzt: Teuni schreibt den Zahlvermerk als
// Grafik ins PDF, nicht in den Textlayer -- maschinell nicht lesbar
// (verifiziert 24.07.2026 an RG-0047 und RG-0081). Das Markieren als
// bezahlt laeuft weiter ueber die Aktionen-Spalte der Liste.

interface Position {
  pos: number; artikel: string; bezeichnung: string;
  menge: number; einheit: string; preis: number;
  gesamt: number; summe: number; ust: number;
}

interface Preisabweichung {
  artikel: string; feld: string;
  unser_preis: number; teuni_preis: number; differenz: number;
}

interface PruefErgebnis {
  ok: boolean;
  bereits_erfasst: boolean;
  rechnung: {
    rechnungsnummer: string; rechnungsdatum: string;
    faelligkeitsdatum: string | null;
    bruttobetrag: number; nettobetrag: number;
  };
  positionen: Position[];
  preisabweichungen: Preisabweichung[];
  warnungen: string[];
  hinweise: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const eur = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const datum = (iso: string | null) =>
  iso ? format(new Date(iso), 'dd.MM.yyyy', { locale: de }) : '—';

export function ImportInvoicePdfDialog({ open, onOpenChange }: Props) {
  const [dateiname, setDateiname] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<PruefErgebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [houseId, setHouseId] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: houses } = useHouses();
  const createInvoice = useCreateLaundryInvoice();
  const { toast } = useToast();

  const zuruecksetzen = () => {
    setDateiname(null); setErgebnis(null); setFehler(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const schliessen = (o: boolean) => {
    if (!o) zuruecksetzen();
    onOpenChange(o);
  };

  const dateiGewaehlt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDateiname(file.name);
    setErgebnis(null);
    setFehler(null);
    setLaeuft(true);

    try {
      // Datei -> base64 (ohne data:-Praefix)
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1]);
        r.onerror = () => rej(new Error('Datei konnte nicht gelesen werden'));
        r.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('import-teuni-invoice', {
        body: { pdf_base64: base64, house_id: houseId || undefined },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Unbekannter Fehler beim Lesen');

      setErgebnis(data as PruefErgebnis);
    } catch (err: any) {
      setFehler(err?.message ?? String(err));
    } finally {
      setLaeuft(false);
    }
  };

  const uebernehmen = async () => {
    if (!ergebnis) return;
    const r = ergebnis.rechnung;
    try {
      await createInvoice.mutateAsync({
        rechnungsnummer: r.rechnungsnummer,
        rechnungsdatum: r.rechnungsdatum,
        faelligkeitsdatum: r.faelligkeitsdatum ?? undefined,
        nettobetrag: r.nettobetrag,
        mwst_satz: 0,          // Teuni: Kleinunternehmerregelung, 0 % USt
        mwst_betrag: 0,
        bruttobetrag: r.bruttobetrag,
        notes: `Aus PDF importiert am ${format(new Date(), 'dd.MM.yyyy')}`,
      });
      toast({ title: 'Rechnung angelegt', description: `${r.rechnungsnummer} über ${eur(r.bruttobetrag)}` });
      schliessen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Anlegen fehlgeschlagen',
              description: err?.message ?? String(err) });
    }
  };

  const hatWarnungen = (ergebnis?.warnungen.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={schliessen}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Rechnung aus PDF einlesen
          </DialogTitle>
          <DialogDescription>
            Teuni-Rechnung auswählen. Die Positionen werden gelesen und gegen die
            hinterlegten Preise geprüft — angelegt wird erst nach deiner Freigabe.
          </DialogDescription>
        </DialogHeader>

        {/* Haus fuer den Preisvergleich */}
        <div className="space-y-2">
          <Label>Haus (für den Preisvergleich)</Label>
          <Select value={houseId} onValueChange={setHouseId}>
            <SelectTrigger>
              <SelectValue placeholder="ohne Preisvergleich" />
            </SelectTrigger>
            <SelectContent>
              {houses?.map((h: any) => (
                <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Sammelrechnungen decken oft beide Häuser ab. Die Auswahl bestimmt nur,
            gegen welche Preisliste verglichen wird.
          </p>
        </div>

        <Separator />

        {/* Dateiauswahl */}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            onChange={dateiGewaehlt}
            className="hidden"
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={laeuft}
            onClick={() => inputRef.current?.click()}
          >
            {laeuft
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />wird gelesen…</>
              : <><Upload className="h-4 w-4 mr-2" />PDF auswählen</>}
          </Button>
          {dateiname && (
            <p className="text-xs text-muted-foreground mt-2 text-center">{dateiname}</p>
          )}
        </div>

        {fehler && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />Konnte nicht gelesen werden
            </p>
            <p className="text-sm text-muted-foreground mt-1">{fehler}</p>
          </div>
        )}

        {ergebnis && (
          <div className="space-y-4">
            {/* Kopfdaten */}
            <div className="rounded-md border p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Rechnungsnummer</p>
                  <p className="font-medium">{ergebnis.rechnung.rechnungsnummer}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Betrag</p>
                  <p className="font-medium text-lg">{eur(ergebnis.rechnung.bruttobetrag)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Rechnungsdatum</p>
                  <p className="font-medium">{datum(ergebnis.rechnung.rechnungsdatum)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Fällig</p>
                  <p className="font-medium">{datum(ergebnis.rechnung.faelligkeitsdatum)}</p>
                </div>
              </div>
            </div>

            {/* Warnungen */}
            {hatWarnungen && (
              <div className="rounded-md border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-3">
                <p className="text-sm font-medium text-orange-700 dark:text-orange-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {ergebnis.warnungen.length === 1 ? 'Ein Punkt zum Prüfen' : `${ergebnis.warnungen.length} Punkte zum Prüfen`}
                </p>
                <ul className="mt-2 space-y-1">
                  {ergebnis.warnungen.map((w, i) => (
                    <li key={i} className="text-sm text-orange-800 dark:text-orange-300">• {w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preisabweichungen */}
            {ergebnis.preisabweichungen.length > 0 && (
              <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/20 p-3">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400 flex items-center gap-2">
                  <Info className="h-4 w-4" />Preise weichen von unserer Liste ab
                </p>
                <ul className="mt-2 space-y-1">
                  {ergebnis.preisabweichungen.map((a, i) => (
                    <li key={i} className="text-sm text-blue-800 dark:text-blue-300">
                      • {a.artikel} ({a.feld}): unsere Liste {eur(a.unser_preis)},
                      Teuni berechnet {eur(a.teuni_preis)}
                      <span className="font-medium">
                        {' '}({a.differenz > 0 ? '+' : ''}{a.differenz.toFixed(2)})
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-blue-700/80 dark:text-blue-400/80 mt-2">
                  Preisliste ggf. unter Häuser → Wäsche nachziehen.
                </p>
              </div>
            )}

            {!hatWarnungen && ergebnis.preisabweichungen.length === 0 && (
              <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/20 p-3">
                <p className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Rechnung rechnet sauber, Preise stimmen mit unserer Liste überein
                </p>
              </div>
            )}

            {/* Positionen */}
            <div>
              <p className="text-sm font-medium mb-2">
                {ergebnis.positionen.length} Positionen
              </p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Art.Nr</TableHead>
                      <TableHead>Bezeichnung</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                      <TableHead className="text-right">Preis</TableHead>
                      <TableHead className="text-right">Summe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ergebnis.positionen.map((p) => (
                      <TableRow key={p.pos}>
                        <TableCell className="font-mono text-xs">{p.artikel}</TableCell>
                        <TableCell className="text-sm">{p.bezeichnung}</TableCell>
                        <TableCell className="text-right text-sm whitespace-nowrap">
                          {p.menge.toLocaleString('de-DE')} {p.einheit}
                        </TableCell>
                        <TableCell className="text-right text-sm">{eur(p.preis)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{eur(p.summe)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Hinweise zu Artikeln */}
            {ergebnis.hinweise.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-1">
                {ergebnis.hinweise.map((h, i) => <p key={i}>ℹ️ {h}</p>)}
              </div>
            )}

            {ergebnis.bereits_erfasst && (
              <Badge variant="outline" className="border-orange-400 text-orange-700">
                Diese Rechnung ist bereits erfasst
              </Badge>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => schliessen(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={uebernehmen}
            disabled={!ergebnis || ergebnis.bereits_erfasst || createInvoice.isPending}
          >
            {createInvoice.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />wird angelegt…</>
              : 'Rechnung anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
