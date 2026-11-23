import { Check, ExternalLink, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSaveRentCap, type RentalLegalCheck } from '@/hooks/useRentalMarket';
import { leereObergrenze, mietobergrenze, type RentCap } from '@/lib/rentalCalc';

/**
 * Standort und Mietrecht aus der KI-Analyse (23.11.2026, Edge Function rental-ai-analysis/legal.ts):
 * Gemeinde, Bundesland, Regel (Mietpreisbremse / MRG), Verordnung und ortsübliche Vergleichsmiete.
 * „Als Obergrenze übernehmen“ schreibt die Vergleichsmiete in rental_calculations.rent_cap
 * (gleiches Feld wie RentalRentCap.tsx, Vormiete und Möblierungszuschlag bleiben erhalten).
 * Ab dann ist die Grenze „erfasst“ und schlägt die automatische Schätzung.
 */

interface RentalLegalInfoProps {
  houseId: string;
  legal: RentalLegalCheck;
  sqm: number;
  currentCap: RentCap | null;
  /** erfasste Obergrenze (mietobergrenze), null = nichts erfasst */
  manualCapCold: number | null;
}

const eur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const eurSqm = (n: number) =>
  `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €/m²`;
const datum = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('.') : iso);

const RentalLegalInfo = ({ houseId, legal, sqm, currentCap, manualCapCold }: RentalLegalInfoProps) => {
  const { toast } = useToast();
  const save = useSaveRentCap();

  const ort = [legal.municipality, legal.state].filter(Boolean).join(', ');
  const vorschlag: RentCap | null = legal.applies && legal.reference_per_sqm
    ? {
        ...(currentCap ?? leereObergrenze()),
        applies: true,
        reference_per_sqm: legal.reference_per_sqm,
        source: [legal.reference_source, 'KI-Analyse'].filter(Boolean).join(' · '),
      }
    : null;
  const vorschlagKalt = vorschlag ? mietobergrenze(vorschlag, sqm).kalt : null;
  const schonErfasst = !!currentCap?.applies && currentCap.reference_per_sqm === legal.reference_per_sqm;

  const uebernehmen = () => {
    if (!vorschlag) return;
    save.mutate(
      { houseId, cap: vorschlag },
      {
        onSuccess: () => toast({ title: 'Obergrenze übernommen', description: vorschlagKalt ? `${eur(vorschlagKalt)} kalt` : undefined }),
        onError: (e) => {
          console.error('[RentalLegalInfo]', e);
          toast({ title: 'Nicht gespeichert', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
        },
      },
    );
  };

  const tone = legal.applies ? 'border-red-200 bg-red-50/60' : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-md border px-3 py-2 space-y-1.5 text-sm ${tone}`}>
      <div className="flex items-center gap-2 font-semibold">
        <MapPin className="w-4 h-4 shrink-0" />
        <span>Standort &amp; Mietrecht{ort ? ` · ${ort}` : ''}</span>
      </div>
      <div>
        {legal.regime ?? 'Regel unklar'}
        {legal.applies === true && ' – begrenzt die Miete bei Neuvermietung'}
        {legal.applies === false && ' – keine gesetzliche Begrenzung erkannt'}
        {legal.valid_until && legal.applies && <> · gilt bis {datum(legal.valid_until)}</>}
      </div>
      {legal.regulation && (
        <div className="text-xs text-muted-foreground">
          {legal.regulation}{legal.confirmed ? ' · Verordnung geprüft' : ' · Angabe der KI, bitte prüfen'}
        </div>
      )}
      {legal.reference_per_sqm ? (
        <div className="text-xs">
          Ortsübliche Vergleichsmiete: <span className="font-semibold">{eurSqm(legal.reference_per_sqm)}</span>
          {legal.reference_range && <> (Spanne {eurSqm(legal.reference_range.min)}–{eurSqm(legal.reference_range.max)})</>}
          {legal.reference_source && <> · {legal.reference_source}</>}
        </div>
      ) : legal.applies ? (
        <div className="text-xs text-red-800 font-medium">
          Vergleichsmiete nicht gefunden – Wert aus dem Mietspiegel unten unter „Rechtliche Obergrenze“ eintragen.
        </div>
      ) : null}
      {legal.notes.length > 0 && (
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
          {legal.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {legal.mietspiegel_url && (
          <a href={legal.mietspiegel_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="w-3 h-3" />Mietspiegel
          </a>
        )}
        {legal.sources.slice(0, 3).map((u, i) => (
          <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="w-3 h-3" />Quelle {i + 1}
          </a>
        ))}
      </div>
      {vorschlag && vorschlagKalt !== null && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
          <span className="text-xs">
            Obergrenze danach: <span className="font-semibold">{eur(vorschlagKalt)} kalt</span>
            {manualCapCold !== null && !schonErfasst && <> (erfasst bisher {eur(manualCapCold)})</>}
          </span>
          <Button size="sm" variant="outline" onClick={uebernehmen} disabled={save.isPending || schonErfasst}>
            <Check className="w-4 h-4 mr-2" />
            {schonErfasst ? 'Ist übernommen' : 'Als Obergrenze übernehmen'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default RentalLegalInfo;
