import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { useRentalMarket } from '@/hooks/useRentalMarket';
import { mietobergrenze, preisstufe } from '@/lib/rentalCalc';
import RentalPriceTiers from './RentalPriceTiers';

/**
 * Vermietetes Objekt (Festvermietung mit Mieter, 23.11.2026): oben der AKTUELLE Mietvertrag,
 * darunter, was die KI-Analyse als Mietpreis sieht — mit Vergleichsmiete und rechtlicher Obergrenze.
 * Verwendet auf der Mietvertragskarte (`compact`) und oben im Werkzeug „Mietpreis ermitteln“.
 *
 * Zwei verschiedene Grenzen, nicht verwechseln:
 *   Neuvermietung     — Mietpreisbremse (§ 556d BGB): Vergleichsmiete + 10 %; Obergrenze aus
 *                       der KI-Analyse bzw. erfasst (rent_cap)
 *   laufender Vertrag — Mieterhöhung höchstens bis zur Vergleichsmiete (§ 558 BGB), dazu die
 *                       Kappungsgrenze (in Berlin, München und Falkensee 15 % in drei Jahren)
 * Ohne Kalkulation kommen NK aus dem Mietvertrag, Kaution = 3 Kaltmieten (§ 551 BGB).
 */

export interface CurrentRent {
  cold: number;
  additional: number;
  /** Datum, seit dem die Kaltmiete gilt (Mietänderung), sonst Vertragsbeginn */
  since: string | null;
}

interface RentalCurrentVsAiProps {
  houseId: string;
  sqm: number;
  current: CurrentRent;
  compact?: boolean;
}

const eur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const eurSqm = (n: number) =>
  `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €/m²`;
const pct = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n)} %`;
const dmy = (iso: string | null) => (iso ? format(parseISO(iso), 'dd.MM.yyyy', { locale: de }) : '');

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{children}</div>
);
const Line = ({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'green' }) => (
  <div className="flex justify-between gap-3 text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className={tone === 'red' ? 'font-semibold text-red-700' : tone === 'green' ? 'font-semibold text-emerald-700' : 'font-medium'}>{value}</span>
  </div>
);

const RentalCurrentVsAi = ({ houseId, sqm, current, compact = false }: RentalCurrentVsAiProps) => {
  const { data: market } = useRentalMarket(houseId);
  const ai = market?.aiAnalysis ?? null;
  const legal = ai?.legal ?? null;
  const isGermany = market?.country === 'DE';

  const tiers = ai
    ? [['Untere', ai.min], ['Mitte', ai.mid], ['Obere', ai.max]].map(([name, kalt]) => ({
        name: name as string,
        ...preisstufe(kalt as number, market?.calculationInput ?? null, {
          nebenkosten: current.additional,
          kautionKaltmieten: isGermany ? 3 : undefined,
        }),
      }))
    : [];
  const cap = mietobergrenze(market?.rentCap ?? null, sqm).kalt ?? ai?.anchors.legal_cap_cold ?? null;
  const ref = legal?.reference_per_sqm ?? null;
  const refRent = ref && sqm > 0 ? ref * sqm : null;
  const perSqm = sqm > 0 && current.cold > 0 ? current.cold / sqm : null;
  // Abstand der aktuellen Kaltmiete zur Vergleichsmiete
  const deltaRef = refRent ? ((current.cold - refRent) / refRent) * 100 : null;
  const limit = legal?.applies ? 10 : 20;

  return (
    <div className="space-y-3">
      {/* 1. Aktueller Mietvertrag */}
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
        <Label>Aktuelle Miete{current.since ? ` · gültig seit ${dmy(current.since)}` : ''}</Label>
        <div className="flex justify-between gap-3 text-base">
          <span className="font-semibold">Warmmiete</span>
          <span className="font-bold">{eur(current.cold + current.additional)} / Monat</span>
        </div>
        <div className="text-xs text-muted-foreground">
          kalt {eur(current.cold)}{perSqm ? ` (${eurSqm(perSqm)})` : ''} · NK {eur(current.additional)}
        </div>
      </div>

      {/* 2. Was die KI als Mietpreis sieht */}
      {ai ? (
        <div className="space-y-2">
          <Label>KI-Mietpreis · {dmy(ai.analysis_date.slice(0, 10))}{legal?.municipality ? ` · ${legal.municipality}` : ''}</Label>
          <RentalPriceTiers tiers={tiers} sqm={sqm} compact />
          <div className="rounded-md bg-white border border-slate-200 px-3 py-2 space-y-0.5">
            {legal?.regime && <Line label="Regel" value={`${legal.regime}${legal.applies ? ' gilt' : ''}`} />}
            {ref ? (
              <Line label="Vergleichsmiete (Mietspiegel)" value={`${eurSqm(ref)} · ${eur(refRent!)}`} />
            ) : isGermany ? (
              <Line label="Vergleichsmiete (Mietspiegel)" value="nicht gefunden" tone="red" />
            ) : null}
            {deltaRef !== null && (
              <Line
                label="Aktuelle Miete zur Vergleichsmiete"
                value={pct(deltaRef)}
                tone={deltaRef > limit ? 'red' : deltaRef <= 0 ? 'green' : undefined}
              />
            )}
            {cap !== null && <Line label="Neuvermietung höchstens (kalt)" value={eur(cap)} />}
          </div>
          {isGermany && deltaRef !== null && deltaRef > limit && (
            <p className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
              Die aktuelle Miete liegt mehr als {limit} % über der Vergleichsmiete. Zulässig ist das nur mit
              Ausnahme (z. B. höhere Vormiete, Neubau, umfassende Modernisierung, Möblierungszuschlag) – bitte prüfen.
            </p>
          )}
          {isGermany && !compact && (
            <p className="text-[11px] text-muted-foreground">
              Beim laufenden Vertrag gilt die Mietpreisbremse nicht: Eine Erhöhung ist höchstens bis zur Vergleichsmiete
              möglich (§ 558 BGB), zusätzlich gilt die Kappungsgrenze (in Berlin, München und Falkensee 15 % in drei Jahren).
              Die Stufen zeigen, was bei einer Neuvermietung erzielbar wäre.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Noch keine KI-Analyse – unter „Mietpreis Region“ starten.
        </p>
      )}
    </div>
  );
};

export default RentalCurrentVsAi;
