import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MarketData {
  date: string;
  occupancyRate: number;
  avgPrice: number;
  source: string;
}

const MONTHLY_OCC: Record<number, number> = {
  0: 0.38, 1: 0.40, 2: 0.48, 3: 0.58, 4: 0.65, 5: 0.72,
  6: 0.82, 7: 0.85, 8: 0.74, 9: 0.60, 10: 0.45, 11: 0.55,
};

const NRW_HOLIDAYS = ['01-01', '05-01', '10-03', '10-31', '11-01', '12-25', '12-26'];

function ymd(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function estimateOccupancyFromSeason(date: Date, _location: string): MarketData {
  let occ = MONTHLY_OCC[date.getMonth()] ?? 0.6;
  const dow = date.getDay();
  if (dow === 5 || dow === 6) occ *= 1.25;
  else if (dow === 0) occ *= 1.10;
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (NRW_HOLIDAYS.includes(md)) occ *= 1.30;
  occ = Math.min(0.95, occ);
  const avgPrice = Math.round(80 + occ * 120);
  return { date: ymd(date), occupancyRate: Number(occ.toFixed(3)), avgPrice, source: 'estimated' };
}

export interface FetchMarketOptions {
  location: string;
  startDate: Date;
  days?: number;
  strategy?: 'estimated' | 'airdna';
  apiKey?: string;
  forceRefresh?: boolean;
}

export async function fetchMarketData(opts: FetchMarketOptions): Promise<MarketData[]> {
  const { location, startDate, days = 180, strategy = 'estimated', apiKey, forceRefresh } = opts;
  const allDates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    allDates.push(ymd(d));
  }

  const result = new Map<string, MarketData>();

  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from('market_data_cache')
      .select('date, occupancy_rate, avg_price, source, fetched_at')
      .eq('location', location)
      .in('date', allDates);
    const cutoff = Date.now() - 24 * 3600 * 1000;
    (cached ?? []).forEach((r: any) => {
      if (new Date(r.fetched_at).getTime() > cutoff) {
        result.set(r.date, {
          date: r.date,
          occupancyRate: Number(r.occupancy_rate),
          avgPrice: Number(r.avg_price),
          source: r.source,
        });
      }
    });
  }

  const missing = allDates.filter((d) => !result.has(d));
  if (missing.length > 0) {
    let fresh: MarketData[] = [];
    if (strategy === 'airdna' && apiKey) {
      try {
        const url = `https://api.airdna.co/v1/market/stats?location=${encodeURIComponent(location)}&start_date=${missing[0]}&end_date=${missing[missing.length - 1]}&access_token=${apiKey}`;
        const r = await fetch(url);
        if (r.ok) {
          const j = await r.json();
          fresh = (j?.data ?? []).map((x: any) => ({
            date: x.date,
            occupancyRate: Number(x.occupancy ?? 0.6),
            avgPrice: Number(x.adr ?? 100),
            source: 'airdna',
          }));
        }
      } catch {
        /* fallback below */
      }
    }
    if (fresh.length === 0) {
      fresh = missing.map((dStr) => estimateOccupancyFromSeason(new Date(dStr), location));
    }
    fresh.forEach((m) => result.set(m.date, m));
    if (fresh.length > 0) {
      await supabase.from('market_data_cache').upsert(
        fresh.map((m) => ({
          location,
          date: m.date,
          occupancy_rate: m.occupancyRate,
          avg_price: m.avgPrice,
          source: m.source,
          fetched_at: new Date().toISOString(),
        })),
        { onConflict: 'location,date' } as any,
      );
    }
  }

  return Array.from(result.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function useMarketData(location: string, startDate: Date, days = 180) {
  const [data, setData] = useState<Map<string, MarketData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const strategy = (import.meta.env.VITE_MARKET_STRATEGY as 'estimated' | 'airdna') || 'estimated';
    const apiKey = import.meta.env.VITE_AIRDNA_API_KEY as string | undefined;
    fetchMarketData({ location, startDate, days, strategy, apiKey })
      .then((rows) => {
        if (cancelled) return;
        setData(new Map(rows.map((r) => [r.date, r])));
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, startDate.toISOString().slice(0, 10), days]);

  return { data, loading, error };
}