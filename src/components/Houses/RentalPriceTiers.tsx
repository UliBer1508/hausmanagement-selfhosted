import { cn } from '@/lib/utils';
import type { Preisstufe } from '@/lib/rentalCalc';

/**
 * Drei Preisstufen als Karten (23.11.2026) — EINE Darstellung für
 * `RentalAiAnalysis` (Werkzeug, auswählbar) und die Vermietungskarte in `HouseCard`
 * (kompakt, zum Gespräch mit dem Interessenten). Rechnung: `preisstufe()` in lib/rentalCalc.ts.
 */

export interface PriceTier extends Preisstufe {
  name: string;
}

interface RentalPriceTiersProps {
  tiers: PriceTier[];
  /** Wohnfläche für €/m²; 0 = ausblenden */
  sqm: number;
  /** Aktuelle Zielmiete (Kalkulation) — markiert die passende Stufe */
  currentTarget?: number | null;
  /** Ausgewählte Stufe; ohne onSelect sind die Karten nicht klickbar */
  selected?: number;
  onSelect?: (index: number) => void;
  /** Schmale Spalten (Hauskarte): Beschriftung über dem Wert */
  compact?: boolean;
}

const eur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const eurSqm = (n: number) =>
  `${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €/m²`;

const RentalPriceTiers = ({ tiers, sqm, currentTarget = null, selected, onSelect, compact = false }: RentalPriceTiersProps) => {
  const line = (label: string, value: string, opts: { strong?: boolean; danger?: boolean } = {}) =>
    compact ? (
      <div className={cn(opts.strong && 'font-semibold')}>
        <div className={cn('text-[10px] leading-tight', opts.strong ? 'text-slate-900' : 'text-muted-foreground')}>{label}</div>
        <div className={cn('text-xs font-medium leading-tight', opts.danger && 'text-red-700')}>{value}</div>
      </div>
    ) : (
      <div className={cn('flex justify-between gap-2', opts.strong && 'font-semibold')}>
        <span className={opts.strong ? undefined : 'text-muted-foreground'}>{label}</span>
        <span className={cn('font-medium text-right', opts.danger && 'text-red-700')}>{value}</span>
      </div>
    );

  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3')}>
      {tiers.map((t, i) => {
        const isSelected = selected === i;
        const isTarget = currentTarget === t.kalt;
        const body = (
          <>
            <div className="flex items-center justify-between gap-1">
              <span className={cn('font-bold text-violet-700', compact ? 'text-[11px]' : 'text-xs')}>{t.name}</span>
              {isTarget && <span className="text-[10px] font-bold text-emerald-700">{compact ? 'Ziel' : 'Zielmiete'}</span>}
            </div>
            <div className={cn('font-extrabold mt-1', compact ? 'text-base' : 'text-xl')}>{eur(t.kalt)}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              kalt / Monat{sqm > 0 ? ` · ${eurSqm(t.kalt / sqm)}` : ''}
            </div>
            <div className={cn('mt-2 pt-2 border-t border-violet-100', compact ? 'space-y-1' : 'space-y-0.5 text-xs')}>
              {line('+ Nebenkosten', t.nebenkosten !== null ? eur(t.nebenkosten) : '–')}
              {line('= Warmmiete', t.warm !== null ? eur(t.warm) : '–', { strong: true })}
              {line('Kaution', t.kaution !== null ? eur(t.kaution) : '–')}
              {line('Kalt pro Jahr', eur(t.kaltJahr))}
              {line(
                'Über Kosten',
                t.ueberKosten !== null ? `${eur(t.ueberKosten)}${compact ? '' : ' / Monat'}` : '–',
                { danger: t.ueberKosten !== null && t.ueberKosten < 0 },
              )}
            </div>
          </>
        );
        const boxClass = cn(
          'text-left rounded-lg border-2 bg-white transition-colors min-w-0',
          compact ? 'p-2' : 'p-3',
          isSelected ? 'border-violet-600 bg-violet-50' : isTarget ? 'border-emerald-500' : 'border-slate-200',
          onSelect && !isSelected && 'hover:border-violet-300',
        );
        return onSelect ? (
          <button key={t.name} type="button" onClick={() => onSelect(i)} aria-pressed={isSelected} className={boxClass}>
            {body}
          </button>
        ) : (
          <div key={t.name} className={boxClass}>{body}</div>
        );
      })}
    </div>
  );
};

export default RentalPriceTiers;
