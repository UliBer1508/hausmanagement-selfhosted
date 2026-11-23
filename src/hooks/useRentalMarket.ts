import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { berechnen, normalisieren, type Ergebnis } from '@/lib/rentalCalc';
import { possibleColdRent } from '@/lib/marketSearch';

/**
 * Langzeit-Markt eines Hauses (23.11.2026): letzte Mietpreis-Analyse
 * (`rental_price_analysis`) und interne Kalkulation (`rental_calculations`).
 * Nur für Festvermietung — touristische Marktdaten liegen in
 * `competitor_properties` / `weekly_pricing` (useCompetitorAnalysis.ts).
 *
 * `rental_calculations` fehlt noch in integrations/supabase/types.ts → loser
 * Zugriff wie in RentalCalculationDialog.tsx.
 */

export interface RentalMarketAnalysis {
  analysis_date: string;
  price_per_sqm: number | null;
  avg_rent: number | null;
  min_rent: number | null;
  max_rent: number | null;
  comparable_count: number | null;
  sources: string[];
  manual: boolean;
  /** Wert aus Mietpreis-Statistik der Region statt aus Inseraten */
  regionStatistic: boolean;
  /** z. B. „Bezirk Zell am See, 2026" — nur bei regionStatistic */
  regionLabel: string | null;
}

export interface RentalMarket {
  analysis: RentalMarketAnalysis | null;
  /** null = noch keine Kalkulation angelegt */
  calculation: Ergebnis | null;
}

export const RENTAL_MARKET_KEY = 'rental-market';

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

export const useRentalMarket = (houseId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [RENTAL_MARKET_KEY, houseId],
    enabled: enabled && !!houseId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RentalMarket> => {
      const [analysisR, calcR] = await Promise.all([
        supabase
          .from('rental_price_analysis')
          .select('analysis_date, price_per_sqm, avg_rent, min_rent, max_rent, comparable_count, sources, search_params')
          .eq('house_id', houseId!)
          // nur Ergebnisse mit m²-Preis (am 23.11.2026 wurde ein leerer Lauf gespeichert)
          .not('price_per_sqm', 'is', null)
          .order('analysis_date', { ascending: false })
          .limit(1),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('rental_calculations').select('*').eq('house_id', houseId!).maybeSingle(),
      ]);
      if (analysisR.error) throw analysisR.error;
      if (calcR.error) throw calcR.error;

      const a = analysisR.data?.[0];
      const sources = Array.isArray(a?.sources) ? (a.sources as unknown[]).map(String) : [];
      const params = (a?.search_params ?? {}) as Record<string, unknown>;
      const region = (params.region ?? null) as { region?: string; year?: string } | null;
      return {
        analysis: a
          ? {
              analysis_date: a.analysis_date,
              price_per_sqm: num(a.price_per_sqm),
              avg_rent: num(a.avg_rent),
              min_rent: num(a.min_rent),
              max_rent: num(a.max_rent),
              comparable_count: num(a.comparable_count),
              sources,
              manual: params.manual === true,
              regionStatistic: params.method === 'region_statistic',
              regionLabel: region?.region ? [region.region, region.year].filter(Boolean).join(', ') : null,
            }
          : null,
        calculation: calcR.data ? berechnen(normalisieren(calcR.data, houseId!)) : null,
      };
    },
  });

/** €/m² selbst eintragen (außerhalb des Systems ermittelt) — als eigene Analysezeile. */
export const useSaveManualRentPerSqm = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ houseId, pricePerSqm, sqm }: { houseId: string; pricePerSqm: number; sqm: number | null }) => {
      const { data, error } = await supabase
        .from('rental_price_analysis')
        .insert({
          house_id: houseId,
          price_per_sqm: pricePerSqm,
          avg_rent: possibleColdRent(sqm, pricePerSqm),
          comparable_count: 0,
          sources: ['manuell'],
          search_params: { market: 'long_term', manual: true, sqm },
        })
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nicht gespeichert (keine Berechtigung?)');
      return data[0];
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [RENTAL_MARKET_KEY] }),
  });
};
