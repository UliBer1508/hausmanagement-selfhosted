import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useApplyTargetRent, useRentalMarket } from '@/hooks/useRentalMarket';
import { useRentalDeal, CONTRACT_STATUS_LABEL, type RentalDeal } from '@/hooks/useRentalContracts';
import { OFFER_STATUS_LABEL } from '@/hooks/useRentalInquiries';
import { mietobergrenze, preisstufe } from '@/lib/rentalCalc';
import RentalPriceTiers from './RentalPriceTiers';

/**
 * Hauskarte „Vermietung“ bei Leerstand Festvermietung (23.11.2026): Ablauf der drei KI-Preisstufen.
 *
 *   1. Stufen anbieten   — drei Kacheln (Untere / Mitte / Obere) aus der KI-Analyse
 *   2. Stufe festlegen   — Klick + „… festlegen“ setzt die Zielmiete der Kalkulation
 *                          (useApplyTargetRent); RentalOfferDialog füllt das Angebot daraus vor
 *   3. Angebot / Vertrag — Kopfzeile zeigt Angebot bzw. Vertrag mit den Beträgen des Angebots
 *   4. Unterschrieben    — Kopfzeile „Aktuelle Miete“ über den Kacheln
 * Danach „Als Mieter übernehmen“ (Tab Mieter) → tenant_info gesetzt → die Karte zeigt den Mietvertrag.
 *
 * Kopfzeile = genau eine Quelle: Vertrag/Angebot (useRentalDeal), sonst Zielmiete der Kalkulation.
 * Gesperrt wird gegen die rechtliche Obergrenze: erfasst, sonst die geschätzte der letzten Analyse.
 */

interface RentalTierWorkflowProps {
  houseId: string;
  livingAreaSqm: number;
  onOpenCalculation: () => void;
}

const eur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const dmy = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'dd.MM.yyyy', { locale: de }) : '');
const TIER_NAMES = ['Untere', 'Mitte', 'Obere'] as const;

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{children}</div>
);

/** Kopfzeile aus Angebot/Vertrag */
const DealHeadline = ({ deal, tierName }: { deal: RentalDeal; tierName: string | null }) => {
  const o = deal.offer;
  const warm = Number(o.rent_month) + Number(o.utilities_month);
  const signed = deal.stage === 'signed';
  const title = signed
    ? `Aktuelle Miete · unterschrieben ${dmy(deal.contract?.signed_at)}`
    : deal.stage === 'contract'
      ? `Mietvertrag ${CONTRACT_STATUS_LABEL[deal.contract!.status]}`
      : `Angebot · ${OFFER_STATUS_LABEL[o.status] ?? o.status}`;
  return (
    <div className={signed ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2' : 'rounded-md border border-sky-200 bg-sky-50 px-3 py-2'}>
      <Label>{title}</Label>
      <div className="flex justify-between gap-3 text-base">
        <span className="font-semibold">Warmmiete</span>
        <span className="font-bold">{eur(warm)} / Monat</span>
      </div>
      <div className="text-xs text-muted-foreground">
        kalt {eur(Number(o.rent_month))} · NK {eur(Number(o.utilities_month))}{o.utilities_mode === 'flat' ? ' pauschal' : ''} · Kaution {eur(Number(o.deposit))}
      </div>
      <div className="text-xs mt-0.5">
        {o.guest_name}{o.move_in ? ` · Einzug ${dmy(o.move_in)}` : ''}{tierName ? ` · Stufe ${tierName}` : ''}
      </div>
      {signed && <div className="text-[11px] text-emerald-800 mt-1">Nächster Schritt: Tab Mieter → „Als Mieter übernehmen“.</div>}
    </div>
  );
};

const RentalTierWorkflow = ({ houseId, livingAreaSqm, onOpenCalculation }: RentalTierWorkflowProps) => {
  const { toast } = useToast();
  const { data: market } = useRentalMarket(houseId);
  const { data: deal } = useRentalDeal(houseId);
  const apply = useApplyTargetRent();

  const calc = market?.calculation ?? null;
  const ai = market?.aiAnalysis ?? null;
  const input = market?.calculationInput ?? null;
  const tiers = ai
    ? [ai.min, ai.mid, ai.max].map((kalt, i) => ({ name: TIER_NAMES[i], ...preisstufe(kalt, input) }))
    : [];
  const target = calc?.grundmieteMonat ?? null;
  const targetIndex = tiers.findIndex(t => t.kalt === target);
  const dealRent = deal ? Number(deal.offer.rent_month) : null;
  const dealIndex = dealRent !== null ? tiers.findIndex(t => t.kalt === dealRent) : -1;

  const cap = mietobergrenze(market?.rentCap ?? null, livingAreaSqm).kalt ?? ai?.anchors.legal_cap_cold ?? null;

  const [selected, setSelected] = useState(1);
  // Auswahl folgt der festgelegten Stufe, sobald die Daten da sind
  useEffect(() => { if (targetIndex >= 0) setSelected(targetIndex); }, [targetIndex]);
  const chosen = tiers[selected] ?? null;
  const overCap = cap !== null && !!chosen && chosen.kalt > cap;

  const festlegen = () => {
    if (!chosen) return;
    apply.mutate(
      { houseId, calculation: input, coldRent: chosen.kalt, fallbackAdditionalCosts: market?.tenantAdditionalCosts ?? 0 },
      {
        onSuccess: () => toast({ title: `Stufe ${chosen.name} festgelegt`, description: `${eur(chosen.kalt)} kalt – wird ins nächste Angebot übernommen` }),
        onError: (e) => {
          console.error('[RentalTierWorkflow] festlegen', e);
          toast({ title: 'Festlegen fehlgeschlagen', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
        },
      },
    );
  };

  return (
    <div className="space-y-3">
      {/* Kopfzeile: was gerade gilt */}
      {deal ? (
        <DealHeadline deal={deal} tierName={dealIndex >= 0 ? TIER_NAMES[dealIndex] : null} />
      ) : (
        <div>
          <Label>{targetIndex >= 0 ? `Festgelegt · Stufe ${TIER_NAMES[targetIndex]}` : 'Zielmiete (Kalkulation)'}</Label>
          {calc ? (
            <>
              <div className="flex justify-between gap-3 text-base">
                <span className="font-semibold">Warmmiete</span>
                <span className="font-bold">{eur(calc.gesamtMonat)} / Monat</span>
              </div>
              <div className="text-xs text-muted-foreground">
                kalt {eur(calc.grundmieteMonat)} · NK {eur(calc.nebenkostenMonat)} · Kaution {eur(calc.kaution)}
              </div>
              {tiers.length > 0 && targetIndex < 0 && (
                <div className="text-[11px] text-amber-800 mt-0.5">Keiner KI-Stufe zugeordnet – unten eine Stufe festlegen.</div>
              )}
              {cap !== null && calc.grundmieteMonat > cap && (
                <div className="text-[11px] text-red-800 font-medium mt-0.5">Über der rechtlichen Obergrenze von {eur(cap)} kalt.</div>
              )}
            </>
          ) : (
            <button type="button" onClick={onOpenCalculation} className="text-xs font-semibold text-amber-700 hover:underline">
              Noch keine Kalkulation – anlegen
            </button>
          )}
        </div>
      )}

      {/* Drei Stufen: vor dem Angebot wählbar, danach nur zur Orientierung */}
      {tiers.length > 0 && (
        <div>
          <Label>Preisstufen KI-Analyse · {dmy(ai!.analysis_date.slice(0, 10))}{cap !== null ? ` · Obergrenze ${eur(cap)}` : ''}</Label>
          <RentalPriceTiers
            tiers={tiers}
            sqm={livingAreaSqm}
            currentTarget={deal ? dealRent : target}
            selected={deal ? undefined : selected}
            onSelect={deal ? undefined : setSelected}
            compact
          />
          {!deal && chosen && chosen.kalt !== target && (
            <div className="mt-2 space-y-1">
              {overCap && <p className="text-[11px] text-red-800">Stufe {chosen.name} liegt über der rechtlichen Obergrenze.</p>}
              <Button size="sm" className="w-full" onClick={festlegen} disabled={apply.isPending || overCap}>
                <Check className="w-4 h-4 mr-2" />
                Stufe {chosen.name} festlegen ({eur(chosen.kalt)} kalt)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RentalTierWorkflow;
