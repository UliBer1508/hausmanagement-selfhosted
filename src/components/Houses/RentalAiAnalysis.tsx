import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useRentalMarket, useRunRentalAiAnalysis } from '@/hooks/useRentalMarket';

/**
 * KI-Analyse Mietpreis (23.11.2026) — für Festvermietung von Objekten, bei denen
 * ein Wohnungs-Mietspiegel nichts aussagt (möbliertes Chalet).
 * Zeigt die Empfehlung (Kaltmiete-Spanne) zwischen vier Ankern:
 * Kosten (Kalkulation) · normaler Markt (Mietpreissuche) · Premium-Vergleiche · bisher touristisch.
 * Rechnen und Speichern: Edge Function `rental-ai-analysis`; Daten: hooks/useRentalMarket.ts.
 */

interface RentalAiAnalysisProps {
  houseId: string;
  livingAreaSqm: number | null;
}

const eur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const eurSqm = (n: number) =>
  `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €/m²`;

const AnchorRow = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="flex justify-between gap-3 text-sm py-1 border-b border-slate-100 last:border-0">
    <span className="text-muted-foreground">
      {label}
      {hint && <span className="block text-[11px]">{hint}</span>}
    </span>
    <span className="font-medium text-right whitespace-nowrap">{value}</span>
  </div>
);

const RentalAiAnalysis = ({ houseId, livingAreaSqm }: RentalAiAnalysisProps) => {
  const { toast } = useToast();
  const { data: market } = useRentalMarket(houseId);
  const run = useRunRentalAiAnalysis();
  const ai = market?.aiAnalysis ?? null;
  const calc = market?.calculation ?? null;
  const sqm = Number(livingAreaSqm ?? 0);

  // Kostendeckende KALTmiete = kostendeckende Gesamtmiete − Nebenkosten (lib/rentalCalc.ts)
  const costFloorCold = calc ? Math.max(0, Math.round(calc.kostendeckend - calc.nebenkostenMonat)) : null;

  const start = () =>
    run.mutate(
      { houseId, costFloorCold },
      {
        onSuccess: () => toast({ title: 'KI-Analyse fertig' }),
        onError: (e) => {
          console.error('[RentalAiAnalysis]', e);
          toast({ title: 'KI-Analyse fehlgeschlagen', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
        },
      },
    );

  const anchors = ai?.anchors;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-600" />
          <span className="font-semibold">KI-Analyse</span>
        </div>
        <Button size="sm" onClick={start} disabled={run.isPending || !(sqm > 0)}>
          {run.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          {run.isPending ? 'Analyse läuft …' : ai ? 'Neu analysieren' : 'KI-Analyse starten'}
        </Button>
      </div>

      {run.isPending && (
        <p className="text-xs text-muted-foreground">Sucht Vergleichsobjekte und wertet sie aus – das dauert bis zu einer Minute.</p>
      )}
      {!calc && (
        <p className="text-xs text-amber-800">Ohne Kalkulation fehlt die Kosten-Untergrenze. Die Analyse läuft trotzdem.</p>
      )}

      {ai ? (
        <>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Empfehlung Kaltmiete</div>
            <div className="text-2xl font-extrabold">{eur(ai.min)} – {eur(ai.max)} <span className="text-sm font-semibold text-muted-foreground">/ Monat</span></div>
            {ai.sqm > 0 && (
              <div className="text-xs text-muted-foreground">{eurSqm(ai.min / ai.sqm)} – {eurSqm(ai.max / ai.sqm)} · Stand {format(parseISO(ai.analysis_date), 'dd.MM.yyyy', { locale: de })}</div>
            )}
          </div>

          {ai.reasoning && <p className="text-sm">{ai.reasoning}</p>}

          <div className="rounded-md bg-white border border-violet-100 px-3 py-1">
            <AnchorRow
              label="Untergrenze (Kosten)"
              value={anchors?.cost_floor_cold ? eur(anchors.cost_floor_cold) : 'keine Kalkulation'}
            />
            <AnchorRow
              label="Normaler Mietmarkt"
              hint="Wohnungen / Statistik"
              value={anchors?.normal_per_sqm ? `${eurSqm(anchors.normal_per_sqm)} · ${eur(anchors.normal_per_sqm * ai.sqm)}` : 'keine Suche'}
            />
            <AnchorRow
              label="Premium-Vergleiche"
              hint={anchors?.premium ? `${anchors.premium.count} möblierte Häuser/Chalets, Spanne ${eurSqm(anchors.premium.min)}–${eurSqm(anchors.premium.max)}` : undefined}
              value={anchors?.premium ? `Median ${eurSqm(anchors.premium.median)}` : 'keine gefunden'}
            />
            <AnchorRow
              label="Bisher touristisch"
              hint="Auszahlungen 12 Monate ÷ 12, inkl. Reinigung/Aufwand"
              value={anchors?.tourist_monthly ? eur(anchors.tourist_monthly) : '–'}
            />
          </div>

          {ai.notes.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
              {ai.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}

          {ai.comparables.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Vergleichsobjekte</div>
              {ai.comparables.map((c, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-xs bg-white border border-slate-100 rounded px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.title || c.type || 'Inserat'}</div>
                    <div className="text-muted-foreground">
                      {[c.location, c.sqm ? `${c.sqm} m²` : null, c.furnished ? 'möbliert' : null, c.sauna ? 'Sauna' : null, c.rent_kind].filter(Boolean).join(' · ')}
                    </div>
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="w-3 h-3" />{c.source || 'Inserat'}
                      </a>
                    )}
                  </div>
                  <div className="text-right whitespace-nowrap">
                    {!!c.rent && <div className="font-semibold">{eur(c.rent)}</div>}
                    {!!c.per_sqm && <div className="text-muted-foreground">{eurSqm(c.per_sqm)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Die Empfehlung ist eine Ableitung aus den Ankern, keine Garantie. Ob der Preis trägt, zeigt die Nachfrage.
          </p>
        </>
      ) : (
        !run.isPending && (
          <p className="text-sm text-muted-foreground">
            Noch keine KI-Analyse. Sie vergleicht Kosten, normalen Mietmarkt, möblierte Premium-Objekte und den bisherigen touristischen Ertrag und schlägt eine Kaltmiete vor.
          </p>
        )
      )}
    </div>
  );
};

export default RentalAiAnalysis;
