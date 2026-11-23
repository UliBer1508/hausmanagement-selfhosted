import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  berechnen, gewinnzielFuerGrundmiete, leereKalkulation, normalisieren, obergrenzeNormalisieren,
  type Ergebnis, type RentalCalculation, type RentCap,
} from '@/lib/rentalCalc';
import { possibleColdRent } from '@/lib/marketSearch';

/**
 * Langzeit-Markt eines Hauses (23.11.2026): letzte Mietpreis-Analyse
 * (`rental_price_analysis`) und interne Kalkulation (`rental_calculations`).
 * Nur für Festvermietung — touristische Marktdaten liegen in
 * `competitor_properties` / `weekly_pricing` (useCompetitorAnalysis.ts).
 *
 * Seit 23.11.2026 zusätzlich die **KI-Analyse** (Edge Function `rental-ai-analysis`), gespeichert
 * als `rental_price_analysis` mit `search_params.method = 'ai_analysis'`. Sie ist KEIN Marktwert:
 * `analysis` = letzte echte Suche/Handwert, `aiAnalysis` = letzte KI-Empfehlung.
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

export interface RentalAiComparable {
  title?: string;
  location?: string;
  type?: string;
  sqm?: number;
  rent?: number;
  rent_kind?: string;
  furnished?: boolean;
  sauna?: boolean;
  source?: string;
  url?: string;
  per_sqm?: number;
}

export interface RentalAiAnalysis {
  analysis_date: string;
  sqm: number;
  min: number;
  max: number;
  mid: number;
  reasoning: string;
  notes: string[];
  anchors: {
    cost_floor_cold: number | null;
    normal_per_sqm: number | null;
    normal_date: string | null;
    premium: { median: number; min: number; max: number; count: number } | null;
    tourist_monthly: number | null;
    /** Obergrenze, mit der die KI gekappt hat (erfasst oder automatisch) */
    legal_cap_cold: number | null;
    legal_cap_basis: 'manual' | 'mietpreisbremse' | 'wistg' | null;
  };
  /** Standort und Mietrecht (Edge Function rental-ai-analysis/legal.ts); null bei älteren Analysen */
  legal: RentalLegalCheck | null;
  comparables: RentalAiComparable[];
}

export interface RentalLegalCheck {
  municipality: string | null;
  state: string | null;
  regime: string | null;
  applies: boolean | null;
  regulation: string | null;
  valid_until: string | null;
  /** aus der geprüften Tabelle (Berlin, München, Falkensee) statt nur KI */
  confirmed: boolean;
  reference_per_sqm: number | null;
  reference_range: { min: number; max: number } | null;
  reference_source: string | null;
  mietspiegel_url: string | null;
  notes: string[];
  sources: string[];
}

export interface RentalMarket {
  analysis: RentalMarketAnalysis | null;
  /** Letzte KI-Analyse (Empfehlung mit Ankern), null = noch keine */
  aiAnalysis: RentalAiAnalysis | null;
  /** null = noch keine Kalkulation angelegt */
  calculation: Ergebnis | null;
  /** Eingaben der Kalkulation (für Preisstufen und „als Zielmiete übernehmen") */
  calculationInput: RentalCalculation | null;
  /** Rechtliche Obergrenze (rental_calculations.rent_cap, SQL 75); null = nicht erfasst */
  rentCap: RentCap | null;
  /** Land des Objekts (utility_settings.country): 'AT' | 'DE' | null */
  country: string | null;
  /** Nebenkosten-Vorauszahlung laut Mietvertrag (houses.tenant_info.additional_costs) */
  tenantAdditionalCosts: number;
}

export const RENTAL_MARKET_KEY = 'rental-market';

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

export const useRentalMarket = (houseId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: [RENTAL_MARKET_KEY, houseId],
    enabled: enabled && !!houseId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RentalMarket> => {
      const [analysisR, calcR, settingsR, houseR] = await Promise.all([
        supabase
          .from('rental_price_analysis')
          .select('analysis_date, price_per_sqm, avg_rent, min_rent, max_rent, comparable_count, sources, search_params')
          .eq('house_id', houseId!)
          // nur Ergebnisse mit m²-Preis (am 23.11.2026 wurde ein leerer Lauf gespeichert)
          .not('price_per_sqm', 'is', null)
          .order('analysis_date', { ascending: false })
          .limit(20),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('rental_calculations').select('*').eq('house_id', houseId!).maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('utility_settings').select('country').eq('house_id', houseId!).maybeSingle(),
        supabase.from('houses').select('tenant_info').eq('id', houseId!).maybeSingle(),
      ]);
      if (analysisR.error) throw analysisR.error;
      if (calcR.error) throw calcR.error;

      const rows = analysisR.data ?? [];
      const methodOf = (r: (typeof rows)[number]) => ((r.search_params ?? {}) as Record<string, unknown>).method;
      const a = rows.find(r => methodOf(r) !== 'ai_analysis');
      const ai = rows.find(r => methodOf(r) === 'ai_analysis');
      // search_params ist freies JSON (von rental-ai-analysis geschrieben)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aiParams = (ai?.search_params ?? {}) as Record<string, any>;
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
        aiAnalysis: ai
          ? {
              analysis_date: ai.analysis_date,
              sqm: Number(aiParams.sqm) || 0,
              min: Number(aiParams.recommendation?.min) || Number(ai.min_rent) || 0,
              max: Number(aiParams.recommendation?.max) || Number(ai.max_rent) || 0,
              mid: Number(aiParams.recommendation?.mid) || Number(ai.avg_rent) || 0,
              reasoning: String(aiParams.recommendation?.reasoning ?? ''),
              notes: Array.isArray(aiParams.recommendation?.notes) ? aiParams.recommendation.notes.map(String) : [],
              anchors: {
                cost_floor_cold: num(aiParams.anchors?.cost_floor_cold),
                normal_per_sqm: num(aiParams.anchors?.normal_per_sqm),
                normal_date: aiParams.anchors?.normal_date ?? null,
                premium: aiParams.anchors?.premium ?? null,
                tourist_monthly: num(aiParams.anchors?.tourist_monthly),
                legal_cap_cold: num(aiParams.anchors?.legal_cap_cold),
                legal_cap_basis: aiParams.anchors?.legal_cap_basis ?? (num(aiParams.anchors?.legal_cap_cold) ? 'manual' : null),
              },
              legal: aiParams.legal && typeof aiParams.legal === 'object'
                ? { ...aiParams.legal, notes: Array.isArray(aiParams.legal.notes) ? aiParams.legal.notes : [], sources: Array.isArray(aiParams.legal.sources) ? aiParams.legal.sources : [] }
                : null,
              comparables: Array.isArray(aiParams.comparables) ? aiParams.comparables : [],
            }
          : null,
        calculation: calcR.data ? berechnen(normalisieren(calcR.data, houseId!)) : null,
        calculationInput: calcR.data ? normalisieren(calcR.data, houseId!) : null,
        rentCap: obergrenzeNormalisieren(calcR.data?.rent_cap),
        country: settingsR.data?.country ?? null,
        tenantAdditionalCosts: Number((houseR.data?.tenant_info as { additional_costs?: number } | null)?.additional_costs) || 0,
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

/**
 * KI-Analyse starten (Edge Function `rental-ai-analysis`). Die kostendeckende
 * Kaltmiete rechnet das Frontend mit lib/rentalCalc.ts (EINE Rechenstelle) und gibt sie mit.
 */
export const useRunRentalAiAnalysis = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ houseId, costFloorCold, legalCapCold, currentColdRent = null }: {
      houseId: string; costFloorCold: number | null; legalCapCold: number | null;
      /** laufender Vertrag (vermietetes Objekt), Kaltmiete heute */
      currentColdRent?: number | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('rental-ai-analysis', {
        body: { house_id: houseId, cost_floor_cold: costFloorCold, legal_cap_cold: legalCapCold, current_cold_rent: currentColdRent },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'KI-Analyse fehlgeschlagen');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [RENTAL_MARKET_KEY] }),
  });
};

/**
 * KI-Stufe als Zielmiete übernehmen: setzt in `rental_calculations` das Gewinnziel so,
 * dass die Kalkulation genau diese Kaltmiete ergibt (lib/rentalCalc.ts, gewinnzielFuerGrundmiete).
 * Die Kalkulation bleibt die EINE Quelle für die Zielmiete (Karte „Vermietung", Angebot).
 * Gibt es noch keine Kalkulation, wird sie angelegt; als Nebenkosten dient dann die
 * Vorauszahlung laut Mietvertrag (tenant_info.additional_costs), falls vorhanden.
 */
export const useApplyTargetRent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ houseId, calculation, coldRent, fallbackAdditionalCosts }: {
      houseId: string; calculation: RentalCalculation | null; coldRent: number; fallbackAdditionalCosts: number;
    }) => {
      const base: RentalCalculation = calculation ?? {
        ...leereKalkulation(houseId),
        extra_costs: fallbackAdditionalCosts > 0
          ? [{ name: 'Nebenkosten-Vorauszahlung laut Mietvertrag', amount: fallbackAdditionalCosts * 12, utility: true }]
          : [],
        utilities_mode: 'advance',
        note: 'Angelegt beim Übernehmen einer KI-Preisstufe. Kosten bitte ergänzen.',
      };
      const profit = gewinnzielFuerGrundmiete(base, coldRent);
      // rent_cap bewusst nicht mitschreiben (eigene Mutation, Spalte aus SQL 75)
      const { house_id: _h, ...rest } = base;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('rental_calculations')
        .upsert({ house_id: houseId, ...rest, profit_target: profit, updated_at: new Date().toISOString() }, { onConflict: 'house_id' })
        .select('house_id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nicht gespeichert (keine Berechtigung?)');
      return { profit, created: !calculation };
    },
    onSuccess: (_r, v) => {
      queryClient.invalidateQueries({ queryKey: [RENTAL_MARKET_KEY] });
      queryClient.invalidateQueries({ queryKey: ['rental-calculation', v.houseId] });
    },
  });
};

/** Rechtliche Obergrenze speichern (rental_calculations.rent_cap, SQL 75). Legt die Zeile bei Bedarf an. */
export const useSaveRentCap = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ houseId, cap }: { houseId: string; cap: RentCap }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('rental_calculations')
        .upsert({ house_id: houseId, rent_cap: cap, updated_at: new Date().toISOString() }, { onConflict: 'house_id' })
        .select('house_id');
      if (error) {
        if (String(error.message ?? '').includes('rent_cap')) {
          throw new Error('Spalte rent_cap fehlt – bitte supabase/SQL/75_mietobergrenze.sql im SQL-Editor ausführen.');
        }
        throw error;
      }
      if (!data?.length) throw new Error('Nicht gespeichert (keine Berechtigung?)');
      return data[0];
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [RENTAL_MARKET_KEY] }),
  });
};
