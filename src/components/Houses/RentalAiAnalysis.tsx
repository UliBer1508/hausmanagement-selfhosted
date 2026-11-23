import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Check, ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useApplyTargetRent, useRentalMarket, useRunRentalAiAnalysis } from '@/hooks/useRentalMarket';
import { mietobergrenze, preisstufe } from '@/lib/rentalCalc';
import RentalPriceTiers from './RentalPriceTiers';
import RentalLegalInfo from './RentalLegalInfo';

/**
 * KI-Analyse Mietpreis (23.11.2026) — für Festvermietung von Objekten, bei denen
 * ein Wohnungs-Mietspiegel nichts aussagt (möbliertes Chalet).
 * Drei Preisstufen (untere Grenze, Mitte, obere Grenze) mit Nebenkosten, Warmmiete, Kaution
 * und Abstand zu den Kosten (lib/rentalCalc.ts, `preisstufe`). Eine Stufe lässt sich als
 * Zielmiete übernehmen: setzt das Gewinnziel der Kalkulation (`useApplyTargetRent`).
 * Die Empfehlung liegt zwischen vier Ankern:
 * Kosten (Kalkulation) · normaler Markt (Mietpreissuche) · Premium-Vergleiche · bisher touristisch.
 * Rechnen und Speichern: Edge Function `rental-ai-analysis`; Daten: hooks/useRentalMarket.ts.
 * Standort + Mietrecht (Mietpreisbremse, Mietspiegel) prüft die Function mit; Anzeige und
 * „Als Obergrenze übernehmen“ in RentalLegalInfo.tsx. Gesperrt wird gegen die wirksame Grenze:
 * erfasste Obergrenze, sonst die automatisch geschätzte der letzten Analyse.
 */

interface RentalAiAnalysisProps {
  houseId: string;
  livingAreaSqm: number | null;
  /** Vermietetes Objekt: Kaltmiete des laufenden Vertrags (geht als Anker an die KI) */
  currentColdRent?: number | null;
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

const RentalAiAnalysis = ({ houseId, livingAreaSqm, currentColdRent = null }: RentalAiAnalysisProps) => {
  const { toast } = useToast();
  const { data: market } = useRentalMarket(houseId);
  const run = useRunRentalAiAnalysis();
  const apply = useApplyTargetRent();
  const [selected, setSelected] = useState(1);
  const ai = market?.aiAnalysis ?? null;
  const calc = market?.calculation ?? null;
  const sqm = Number(livingAreaSqm ?? 0);

  // Kostendeckende KALTmiete = kostendeckende Gesamtmiete − Nebenkosten (lib/rentalCalc.ts)
  const costFloorCold = calc ? Math.max(0, Math.round(calc.kostendeckend - calc.nebenkostenMonat)) : null;
  // Rechtliche Obergrenze (z. B. Mietpreisbremse) — die KI darf sie nicht überschreiten
  const legalCapCold = mietobergrenze(market?.rentCap ?? null, sqm).kalt;
  const isGermany = market?.country === 'DE';
  const capBasis = legalCapCold !== null ? 'manual' : ai?.anchors.legal_cap_basis ?? null;
  // Wirksame Grenze: erfasst, sonst automatisch geschätzt (Mietspiegel)
  const effectiveCap = legalCapCold ?? ai?.anchors.legal_cap_cold ?? null;
  const capHint = capBasis === 'manual' ? 'erfasst (Mietpreisbremse / Vormiete)'
    : capBasis === 'mietpreisbremse' ? 'geschätzt: Mietspiegel + 10 % (Mietpreisbremse) – prüfen'
    : capBasis === 'wistg' ? 'geschätzt: Mietspiegel + 20 % (§ 5 WiStG) – prüfen'
    : 'in Deutschland prüfen (Mietpreisbremse)';

  const start = () =>
    run.mutate(
      { houseId, costFloorCold, legalCapCold, currentColdRent },
      {
        onSuccess: () => toast({ title: 'KI-Analyse fertig' }),
        onError: (e) => {
          console.error('[RentalAiAnalysis]', e);
          toast({ title: 'KI-Analyse fehlgeschlagen', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
        },
      },
    );

  const anchors = ai?.anchors;
  const input = market?.calculationInput ?? null;
  const tiers = ai
    ? [
        { name: 'Untere Stufe', ...preisstufe(ai.min, input) },
        { name: 'Mitte', ...preisstufe(ai.mid, input) },
        { name: 'Obere Stufe', ...preisstufe(ai.max, input) },
      ]
    : [];
  const chosen = tiers[selected] ?? null;
  const currentTarget = calc?.grundmieteMonat ?? null;

  const applyChosen = () => {
    if (!chosen) return;
    apply.mutate(
      { houseId, calculation: input, coldRent: chosen.kalt, fallbackAdditionalCosts: market?.tenantAdditionalCosts ?? 0 },
      {
        onSuccess: () => toast({ title: 'Zielmiete übernommen', description: `${chosen.name}: ${eur(chosen.kalt)} kalt` }),
        onError: (e) => {
          console.error('[RentalAiAnalysis] übernehmen', e);
          toast({ title: 'Übernehmen fehlgeschlagen', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
        },
      },
    );
  };

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
      {isGermany && effectiveCap === null && (
        <p className="text-xs text-red-800">
          Objekt in Deutschland: Ob die Mietpreisbremse gilt, ist nicht erfasst. Ohne Obergrenze kann die Empfehlung
          über der zulässigen Miete liegen – unten „Rechtliche Obergrenze“ ausfüllen.
        </p>
      )}

      {ai ? (
        <>
          {ai.reasoning && <p className="text-sm">{ai.reasoning}</p>}

          {ai.legal && (
            <RentalLegalInfo
              houseId={houseId}
              legal={ai.legal}
              sqm={ai.sqm}
              currentCap={market?.rentCap ?? null}
              manualCapCold={legalCapCold}
            />
          )}

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
              Drei Preisstufen · Stand {format(parseISO(ai.analysis_date), 'dd.MM.yyyy', { locale: de })}
            </div>
            <RentalPriceTiers
              tiers={tiers}
              sqm={ai.sqm}
              currentTarget={currentTarget}
              selected={selected}
              onSelect={setSelected}
            />
          </div>

          {!input && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Nebenkosten, Warmmiete, Kaution und „über Kosten" kommen aus der Kalkulation – sie ist noch nicht angelegt.
              Beim Übernehmen wird sie angelegt{market?.tenantAdditionalCosts ? ` (Nebenkosten ${eur(market.tenantAdditionalCosts)} aus dem Mietvertrag)` : ''}; die Kosten danach in der Kalkulation ergänzen.
            </p>
          )}
          {effectiveCap !== null && chosen && chosen.kalt > effectiveCap && (
            <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {chosen.name} liegt über der rechtlichen Obergrenze von {eur(effectiveCap)} kalt.
            </p>
          )}
          {chosen && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md bg-violet-100/60 px-3 py-2">
              <div className="text-sm">
                <span className="font-semibold">{chosen.name}</span> als Zielmiete: {eur(chosen.kalt)} kalt
                {chosen.warm !== null && <> · {eur(chosen.warm)} warm</>}
              </div>
              <Button size="sm" onClick={applyChosen} disabled={apply.isPending || currentTarget === chosen.kalt || (effectiveCap !== null && chosen.kalt > effectiveCap)}>
                <Check className="w-4 h-4 mr-2" />
                {currentTarget === chosen.kalt ? 'Ist Zielmiete' : 'Als Zielmiete übernehmen'}
              </Button>
            </div>
          )}



          <div className="rounded-md bg-white border border-violet-100 px-3 py-1">
            {(isGermany || effectiveCap !== null) && (
              <AnchorRow
                label="Rechtliche Obergrenze"
                hint={capHint}
                value={effectiveCap !== null ? eur(effectiveCap) : 'nicht erfasst'}
              />
            )}
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

          {!anchors?.premium && (
            <p className="text-xs text-amber-800">
              Keine möblierten Premium-Vergleiche gefunden – die Stufen stützen sich nur auf Normalmarkt
              und bisherigen touristischen Ertrag.
            </p>
          )}

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
