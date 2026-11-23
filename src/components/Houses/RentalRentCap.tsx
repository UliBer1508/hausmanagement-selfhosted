import { useEffect, useState } from 'react';
import { ExternalLink, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useRentalMarket, useSaveRentCap } from '@/hooks/useRentalMarket';
import { leereObergrenze, mietobergrenze, type RentCap } from '@/lib/rentalCalc';

/**
 * Rechtliche Obergrenze der Kaltmiete (23.11.2026) — nur für Objekte in Deutschland,
 * z. B. Mietpreisbremse München (§ 556d BGB, Bayerische Mieterschutzverordnung bis 31.12.2029).
 * Eingaben werden in `rental_calculations.rent_cap` gespeichert (SQL 75); Rechnung
 * `mietobergrenze()` in lib/rentalCalc.ts. Die KI-Analyse überschreitet die Grenze nicht.
 * Keine Rechtsberatung: Vergleichsmiete aus dem amtlichen Mietspiegel-Rechner übernehmen.
 */

interface RentalRentCapProps {
  houseId: string;
  livingAreaSqm: number | null;
  address?: string | null;
}

const eur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const zahl = (v: string) => {
  const z = parseFloat(v.replace(',', '.'));
  return Number.isFinite(z) ? z : 0;
};

const RentalRentCap = ({ houseId, livingAreaSqm, address }: RentalRentCapProps) => {
  const { toast } = useToast();
  const { data: market } = useRentalMarket(houseId);
  const save = useSaveRentCap();
  const [cap, setCap] = useState<RentCap>(leereObergrenze());

  useEffect(() => {
    if (market) setCap(market.rentCap ?? leereObergrenze());
  }, [market]);

  const sqm = Number(livingAreaSqm ?? 0);
  const grenze = mietobergrenze(cap, sqm);
  const isMuenchen = /münchen|munich|8\d{4}\s/i.test(address ?? '');
  const setze = <F extends keyof RentCap>(f: F, v: RentCap[F]) => setCap(alt => ({ ...alt, [f]: v }));

  const speichern = () =>
    save.mutate(
      { houseId, cap },
      {
        onSuccess: () => toast({ title: 'Obergrenze gespeichert' }),
        onError: (e) => {
          console.error('[RentalRentCap]', e);
          toast({ title: 'Nicht gespeichert', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
        },
      },
    );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-slate-600" />
        <span className="font-semibold">Rechtliche Obergrenze (Deutschland)</span>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={cap.applies} onCheckedChange={(v) => setze('applies', v === true)} />
        Mietpreisbremse gilt für dieses Objekt
      </label>

      {cap.applies && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cap-ref" className="text-xs">Vergleichsmiete €/m² (Mietspiegel)</Label>
              <Input id="cap-ref" inputMode="decimal" value={cap.reference_per_sqm || ''} placeholder="z. B. 18,40"
                onChange={e => setze('reference_per_sqm', zahl(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cap-markup" className="text-xs">Zuschlag %</Label>
              <Input id="cap-markup" inputMode="decimal" value={cap.markup_percent}
                onChange={e => setze('markup_percent', zahl(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cap-furn" className="text-xs">Möblierungszuschlag €/Monat</Label>
              <Input id="cap-furn" inputMode="decimal" value={cap.furnished_surcharge || ''} placeholder="0"
                onChange={e => setze('furnished_surcharge', zahl(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cap-prev" className="text-xs">Vormiete kalt €/Monat</Label>
              <Input id="cap-prev" inputMode="decimal" value={cap.previous_rent || ''} placeholder="0"
                onChange={e => setze('previous_rent', zahl(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cap-src" className="text-xs">Quelle</Label>
            <Input id="cap-src" value={cap.source ?? ''} placeholder="z. B. Mietspiegel München 2025, Online-Rechner"
              onChange={e => setze('source', e.target.value)} />
          </div>

          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm space-y-0.5">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Vergleichsmiete + {cap.markup_percent} %{cap.furnished_surcharge > 0 ? ' + Möblierung' : ''}</span>
              <span className="font-medium">{grenze.ausVergleichsmiete !== null ? eur(grenze.ausVergleichsmiete) : '–'}</span>
            </div>
            <div className="flex justify-between gap-3 font-semibold">
              <span>Zulässig kalt höchstens</span>
              <span>{grenze.kalt !== null ? `${eur(grenze.kalt)} / Monat` : '–'}</span>
            </div>
            {grenze.vormieteGreift && (
              <p className="text-xs text-muted-foreground">Die Vormiete ist höher und darf grundsätzlich weiter verlangt werden (dem Mieter vor Vertragsschluss mitteilen).</p>
            )}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {isMuenchen ? (
          <a href="https://stadt.muenchen.de/infos/mietspiegel.html" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" />Mietspiegel-Rechner München
          </a>
        ) : <span />}
        <Button size="sm" variant="outline" onClick={speichern} disabled={save.isPending}>Obergrenze speichern</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Keine Rechtsberatung. Ausnahmen (Neubau nach 01.10.2014, umfassende Modernisierung) und die genaue
        Vergleichsmiete bitte prüfen.
      </p>
    </div>
  );
};

export default RentalRentCap;
