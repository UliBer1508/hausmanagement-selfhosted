import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useRentalMarket, useSaveManualRentPerSqm } from '@/hooks/useRentalMarket';
import { possibleColdRent } from '@/lib/marketSearch';
import ScrapePricesDialog from './CompetitorAnalysis/ScrapePricesDialog';

/**
 * „Mietpreis ermitteln" (23.11.2026) — das Preis-Werkzeug für FESTVERMIETUNG.
 * Ersetzt bei `rental_type = 'long_term'` die touristische Wettbewerbsanalyse
 * (`CompetitorAnalysisDashboard`, Nachtpreise/Booking/Airbnb), die für Mieten nichts aussagt.
 *
 * Zwei Wege zum m²-Preis, beide landen in `rental_price_analysis`:
 *   1. Suche über `ScrapePricesDialog` (Modus Langzeit, Portale je Land)
 *   2. Wert selbst eintragen (außerhalb des Systems ermittelt)
 * Die Kalkulation (`RentalCalculationDialog`) zeigt die letzte Analyse zum Vergleich.
 */

interface RentalPriceCheckProps {
  houseId: string;
  houseName: string;
  livingAreaSqm: number | null;
}

const eur = (n: number, digits = 0) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-right">{children}</span>
  </div>
);

const RentalPriceCheck = ({ houseId, houseName, livingAreaSqm }: RentalPriceCheckProps) => {
  const { toast } = useToast();
  const { data: market, isLoading } = useRentalMarket(houseId);
  const saveManual = useSaveManualRentPerSqm();
  const [manualValue, setManualValue] = useState('');

  const sqm = Number(livingAreaSqm ?? 0) > 0 ? Number(livingAreaSqm) : null;
  const analysis = market?.analysis ?? null;
  const possible = possibleColdRent(sqm, analysis?.price_per_sqm);

  const handleSaveManual = () => {
    const value = parseFloat(manualValue.replace(',', '.'));
    if (!(value > 0)) {
      toast({ title: 'Bitte einen m²-Preis eingeben', variant: 'destructive' });
      return;
    }
    saveManual.mutate(
      { houseId, pricePerSqm: value, sqm },
      {
        onSuccess: () => {
          setManualValue('');
          toast({ title: 'm²-Preis gespeichert' });
        },
        onError: (e) => {
          console.error('[RentalPriceCheck] speichern', e);
          toast({ title: 'Speichern fehlgeschlagen', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Mietpreis ermitteln</h2>
        <p className="text-sm text-muted-foreground">{houseName} · Langzeitmiete, Kaltmiete je m²</p>
      </div>

      {!sqm && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Wohnfläche fehlt. Ohne m² gibt es keine Suche und keinen möglichen Mietpreis — bitte im Haus-Dialog eintragen.
        </p>
      )}

      <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 p-4 space-y-1.5">
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Letztes Ergebnis</div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Lädt …</p>
        ) : analysis ? (
          <>
            <Row label="Ø Kaltmiete je m²">{analysis.price_per_sqm ? eur(analysis.price_per_sqm, 2) : '–'}</Row>
            {analysis.min_rent && analysis.max_rent ? (
              <Row label="Spanne Vergleichsmieten">{eur(analysis.min_rent)} – {eur(analysis.max_rent)}</Row>
            ) : null}
            <Row label="Quelle · Stand">
              {analysis.manual ? 'manuell' : (analysis.sources.join(', ') || 'Suche')}
              {' · '}{format(parseISO(analysis.analysis_date), 'dd.MM.yyyy', { locale: de })}
            </Row>
            <Row label="Wohnfläche">{sqm ? `${sqm} m²` : 'fehlt'}</Row>
            <div className="flex justify-between gap-3 pt-1.5 mt-1 border-t border-indigo-100">
              <span className="font-semibold">Möglich kalt (m² × Ø)</span>
              <span className="font-bold">{possible ? `${eur(possible)} / Monat` : '–'}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Noch kein m²-Preis ermittelt.</p>
        )}
      </div>

      <ScrapePricesDialog
        house_id={houseId}
        triggerButton={
          <Button className="w-full" disabled={!sqm}>
            <Search className="w-4 h-4 mr-2" />
            m²-Preis der Region suchen
          </Button>
        }
      />

      <div className="space-y-2">
        <Label htmlFor="manual-sqm-price">€/m² kalt selbst eintragen</Label>
        <p className="text-xs text-muted-foreground">Wenn Sie den m²-Preis außerhalb des Systems ermittelt haben.</p>
        <div className="flex gap-2">
          <Input
            id="manual-sqm-price"
            inputMode="decimal"
            placeholder="z. B. 11,50"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
          />
          <Button variant="outline" onClick={handleSaveManual} disabled={saveManual.isPending}>
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RentalPriceCheck;
