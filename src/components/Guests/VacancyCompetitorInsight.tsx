import { useMemo } from 'react';
import { differenceInDays, format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useHouseCompetitorPricing } from '@/hooks/useCompetitorAnalysis';
import { useRegionalMarketDataReadOnly } from '@/services/marketOccupancyService';
import ManualCompetitorDialog from '@/components/Houses/CompetitorAnalysis/ManualCompetitorDialog';

interface VacancyCompetitorInsightProps {
  houseId: string;
  vacancyStart: string; // yyyy-MM-dd
  vacancyEnd: string; // yyyy-MM-dd
  ownSuggestedMin?: number;
  ownSuggestedMax?: number;
}

// NEU (12.09.2026): Wettbewerbsvergleich direkt in der Freie-Zeiträume-Karte im
// Gäste-Tab (vorher: ML-Analyse und KI-Analyse bezogen sich AUSSCHLIESSLICH auf
// die eigene Buchungshistorie — kein Marktbezug). Zwei bewusst getrennt
// ausgewiesene Quellen, NICHT zu einer Zahl vermischt:
//
// 1) Manuelle Wettbewerberpreise (competitor_properties + weekly_pricing,
//    source='manual', gepflegt über ManualCompetitorDialog im Häuser-Tab).
//    Property-genau, aber Handarbeit. NICHT scrape-competitor-prices /
//    search-competitors — die liefern laut docs/CODE-INDEX.md keine Daten mehr
//    (Portale blocken automatisiertes Scraping).
// 2) Regionale Marktdaten aus market_data_cache (source='airroi'), read-only
//    gelesen — kein neuer Sync wird ausgelöst. Automatisch, aber nur eine grobe
//    Regions-ADR, nicht property-spezifisch. source='estimated' wird bewusst
//    ausgeschlossen, weil das keine echten Marktdaten sind, sondern eine aus
//    den eigenen season_factors berechnete Formel (siehe CODE-INDEX.md, Abschnitt
//    "Stille Fallback-Falle in airroi-sync").
export default function VacancyCompetitorInsight({
  houseId,
  vacancyStart,
  vacancyEnd,
  ownSuggestedMin,
  ownSuggestedMax,
}: VacancyCompetitorInsightProps) {
  const { data, isLoading } = useHouseCompetitorPricing(houseId);
  const { snapshot: regional, loading: regionalLoading } = useRegionalMarketDataReadOnly(
    vacancyStart,
    vacancyEnd,
  );

  const vacancyMonth = parseISO(vacancyStart).getMonth();

  // Bevorzugt Preisdaten, deren Zeitraum sich mit der Lücke überschneidet;
  // fällt zurück auf Daten aus demselben Kalendermonat (egal welches Jahr),
  // damit auch länger zurückliegende manuelle Einträge noch etwas taugen.
  const relevantSnapshots = useMemo(() => {
    if (!data || data.snapshots.length === 0) return [];

    const vStart = parseISO(vacancyStart).getTime();
    const vEnd = parseISO(vacancyEnd).getTime();

    const overlapping = data.snapshots.filter((s) => {
      const sStart = parseISO(s.periodStart).getTime();
      const sEnd = parseISO(s.periodEnd).getTime();
      return sStart <= vEnd && sEnd >= vStart;
    });

    if (overlapping.length > 0) return overlapping;

    return data.snapshots.filter((s) => parseISO(s.periodStart).getMonth() === vacancyMonth);
  }, [data, vacancyStart, vacancyEnd, vacancyMonth]);

  const regionalBlock = regionalLoading ? (
    <p className="text-xs text-muted-foreground">Lade regionale Marktdaten…</p>
  ) : regional ? (
    <div className="text-xs border-t pt-2 mt-1 space-y-0.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">📡 Regionaler Marktpreis ({regional.source}):</span>
        <span className="font-bold">Ø €{Math.round(regional.avgPricePerNight)}/Nacht</span>
        {regional.occupancyRate > 0 && (
          <span>· Ø Auslastung {Math.round(regional.occupancyRate * 100)}%</span>
        )}
      </div>
      <div className="text-muted-foreground">
        {regional.location} · {regional.daysCovered} Tage im Zeitraum
        {regional.fetchedAt && ` · Stand ${format(new Date(regional.fetchedAt), 'dd.MM.yyyy')}`}
        {' '}· grober Regionsschnitt, nicht objektgenau
        {regional.summaryOnly && ' · ⚠️ nur ein ADR-Wert im Zeitraum (Summary-Endpunkt), grobe Auflösung'}
      </div>
      {ownSuggestedMax !== undefined && ownSuggestedMax > 0 && (
        <div className="font-medium">
          {(() => {
            const diff = Math.round(
              ((ownSuggestedMax - regional.avgPricePerNight) / regional.avgPricePerNight) * 100,
            );
            if (Math.abs(diff) < 10) return '→ Deine Empfehlung liegt im Bereich des Regionsschnitts.';
            return diff < 0
              ? `→ Deine Empfehlung liegt ca. ${Math.abs(diff)}% UNTER dem Regionsschnitt.`
              : `→ Deine Empfehlung liegt ca. ${diff}% ÜBER dem Regionsschnitt.`;
          })()}
        </div>
      )}
    </div>
  ) : (
    <p className="text-xs text-muted-foreground border-t pt-2 mt-1">
      📡 Keine belastbaren AirROI-Regionaldaten für diesen Zeitraum. Abgleich starten unter
      Einstellungen → „AirROI Sync". Rein rechnerische Werte werden hier bewusst nicht
      angezeigt — lieber keine Zahl als eine erfundene.
    </p>
  );

  if (isLoading) {
    return <div className="text-xs text-muted-foreground px-1">Lade Wettbewerbsdaten…</div>;
  }

  const hasCompetitors = (data?.competitors.length ?? 0) > 0;

  if (!hasCompetitors) {
    return (
      <div className="bg-background/60 border rounded-lg p-3 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          🔎 Wettbewerbsvergleich
        </div>
        <p className="text-xs text-muted-foreground">
          Für dieses Haus sind noch keine Wettbewerber hinterlegt. Preisempfehlungen
          basieren aktuell nur auf deiner eigenen Buchungshistorie.
        </p>
        <ManualCompetitorDialog house_id={houseId} />
        {regionalBlock}
      </div>
    );
  }

  const prices = relevantSnapshots.map((s) => s.pricePerNight);
  const hasPriceData = prices.length > 0;
  const min = hasPriceData ? Math.min(...prices) : null;
  const max = hasPriceData ? Math.max(...prices) : null;
  const avg = hasPriceData ? prices.reduce((a, b) => a + b, 0) / prices.length : null;

  const newestSnapshot = relevantSnapshots
    .slice()
    .sort((a, b) => (b.scrapedAt ?? '').localeCompare(a.scrapedAt ?? ''))[0];

  const ageDays = newestSnapshot?.scrapedAt
    ? differenceInDays(new Date(), new Date(newestSnapshot.scrapedAt))
    : null;

  let comparisonText: string | null = null;
  if (avg !== null && ownSuggestedMax !== undefined && ownSuggestedMax > 0) {
    const diffPercent = Math.round(((ownSuggestedMax - avg) / avg) * 100);
    if (Math.abs(diffPercent) >= 10) {
      comparisonText =
        diffPercent < 0
          ? `→ Deine Empfehlung liegt ca. ${Math.abs(diffPercent)}% UNTER dem Wettbewerbsschnitt.`
          : `→ Deine Empfehlung liegt ca. ${diffPercent}% ÜBER dem Wettbewerbsschnitt.`;
    } else {
      comparisonText = '→ Deine Empfehlung liegt im Bereich des Wettbewerbsschnitts.';
    }
  }

  return (
    <div className="bg-background/60 border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          🔎 Wettbewerbsvergleich
        </span>
        <ManualCompetitorDialog house_id={houseId} />
      </div>

      {!hasPriceData ? (
        <p className="text-xs text-muted-foreground">
          {data!.competitors.length} Wettbewerber hinterlegt ({data!.competitors
            .map((c) => c.property_name)
            .join(', ')}
          ), aber noch keine Preisdaten für {format(parseISO(vacancyStart), 'MMMM', { locale: de })}.
          Trag einen Preis über „Wettbewerber bearbeiten" nach, um ihn hier zu sehen.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <span>Preisspanne (pro Nacht):</span>
            <span className="font-bold">
              €{Math.round(min!)} – €{Math.round(max!)} (Ø €{Math.round(avg!)})
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Basierend auf {prices.length} Wettbewerber-Preis{prices.length !== 1 ? 'en' : ''}
            {ageDays !== null && (
              <>
                {' '}
                · Stand: {ageDays === 0 ? 'heute' : `vor ${ageDays} Tag${ageDays !== 1 ? 'en' : ''}`}
                {ageDays > 45 && ' ⚠️ veraltet, bitte aktualisieren'}
              </>
            )}
          </p>
          {comparisonText && <p className="text-xs font-medium">{comparisonText}</p>}
          <div className="flex flex-wrap gap-1 pt-1">
            {relevantSnapshots.slice(0, 4).map((s, i) => (
              <Badge key={i} variant="outline" className="text-xs gap-1">
                <Users className="h-3 w-3" />
                {s.propertyName}: €{Math.round(s.pricePerNight)}/Nacht
              </Badge>
            ))}
          </div>
        </>
      )}
      {regionalBlock}
    </div>
  );
}
