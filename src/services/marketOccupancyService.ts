import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toISODate } from '@/lib/dateHelpers';
import { getHolidayWeight } from '@/lib/schoolHolidays';
import { DEFAULT_PRICING_CONFIG } from '@/hooks/usePricingSettings';

export interface MarketData {
  date: string;
  occupancyRate: number;
  avgPrice: number;
  source: string;
}

// Basis-Marktauslastung (Jahresmittel). Saisonale Verteilung kommt aus
// system_settings.pricing_config.season_factors (UI-konfigurierbar).
const BASE_OCC = 0.6;

async function loadSeasonFactors(): Promise<number[]> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'pricing_config')
      .maybeSingle();
    const sf = (data?.value as any)?.season_factors;
    if (Array.isArray(sf) && sf.length === 12 && sf.every((n) => Number.isFinite(Number(n)))) {
      return sf.map(Number);
    }
  } catch { /* fallback */ }
  return DEFAULT_PRICING_CONFIG.season_factors;
}

function ymd(d: Date): string {
  return toISODate(d);
}

export function estimateOccupancyFromSeason(
  date: Date,
  _location: string,
  countryCodes: string[] = ['DE', 'AT'],
  seasonFactors: number[] = DEFAULT_PRICING_CONFIG.season_factors,
): MarketData {
  const mean = seasonFactors.reduce((a, b) => a + b, 0) / seasonFactors.length;
  const factor = (seasonFactors[date.getMonth()] ?? mean) / (mean || 1);
  let occ = BASE_OCC * factor;
  const dow = date.getDay();
  if (dow === 5 || dow === 6) occ *= 1.25;
  else if (dow === 0) occ *= 1.10;
  const holidayWeight = getHolidayWeight(date, countryCodes);
  occ *= holidayWeight;
  occ = Math.min(0.95, occ);
  const avgPrice = Math.round(80 + occ * 120);
  return { date: ymd(date), occupancyRate: Number(occ.toFixed(3)), avgPrice, source: 'estimated' };
}

/**
 * Liest die häufigsten Gäste-Nationalitäten aus der DB.
 * Top 5 ISO-Codes aus guests.nationality, Fallback bookings.nationality,
 * Default ['DE', 'AT'] wenn nichts vorhanden.
 */
/** Tallyt nationality-Spalte in eine Map und paginiert über die Supabase-1000er-Grenze hinweg. */
async function tallyNationalities(
  table: 'guests' | 'bookings',
  tally: Map<string, number>,
  maxPages = 20,
): Promise<void> {
  const pageSize = 1000;
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(table)
      .select('nationality')
      .not('nationality', 'is', null)
      .range(from, to);
    if (error || !data || data.length === 0) return;
    for (const r of data as any[]) {
      const c = String(r.nationality || '').trim().toUpperCase();
      if (c) tally.set(c, (tally.get(c) ?? 0) + 1);
    }
    if (data.length < pageSize) return; // letzte Seite
  }
}

/**
 * Liest die häufigsten Gäste-Nationalitäten aus der DB.
 * Top 5 ISO-Codes aus guests.nationality, Fallback bookings.nationality,
 * Default ['DE', 'AT'] wenn nichts vorhanden.
 *
 * Hinweis: Supabase liefert per Default max. 1000 Zeilen pro Query — wir
 * paginieren mit .range() bis alle Datensätze (oder maxPages) gelesen sind.
 */
export async function fetchGuestNationalities(_location: string): Promise<string[]> {
  const tally = new Map<string, number>();
  try { await tallyNationalities('guests', tally); } catch { /* ignore */ }
  if (tally.size === 0) {
    try { await tallyNationalities('bookings', tally); } catch { /* ignore */ }
  }
  if (tally.size === 0) return ['DE', 'AT'];

  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);
}

export interface FetchMarketOptions {
  location: string;
  startDate: Date;
  days?: number;
  strategy?: 'estimated' | 'airdna' | 'airroi' | 'competitor';
  apiKey?: string;
  forceRefresh?: boolean;
}

/**
 * Berechnet eine Marktauslastungs-Approximation aus eigenen Wettbewerber-
 * Preisdaten in `daily_pricing`. Es werden alle Einträge im Fenster ±14 Tage
 * um `date` betrachtet, bei denen ein Wettbewerber zugeordnet ist
 * (`competitor_property_id IS NOT NULL` und `house_id IS NULL`).
 *
 * Auslastung = Anteil der Nächte, die als gebucht (`is_booked = true`) ODER
 * als nicht verfügbar (`is_available = false`) markiert sind.
 *
 * Liefert null, wenn keine Daten existieren.
 */
export async function fetchCompetitorOccupancy(
  _location: string,
  date: string,
): Promise<number | null> {
  const center = new Date(date);
  const from = new Date(center);
  from.setDate(from.getDate() - 14);
  const to = new Date(center);
  to.setDate(to.getDate() + 14);

  // Wettbewerber-Datensätze werden über competitor_property_id erkannt.
  // house_id wird hier bewusst NICHT gefiltert: Competitor-Snapshots können
  // optional einem eigenen Haus zugeordnet sein (z.B. Vergleichs-Tracking),
  // sind aber trotzdem als Marktsignal gültig.
  const { data, error } = await supabase
    .from('daily_pricing')
    .select('is_booked, is_available')
    .not('competitor_property_id', 'is', null)
    .gte('date', ymd(from))
    .lte('date', ymd(to));

  if (error || !data || data.length === 0) return null;

  const total = data.length;
  const occupied = data.filter(
    (r: any) => r.is_booked === true || r.is_available === false,
  ).length;

  return Math.min(1, Math.max(0, occupied / total));
}

export async function fetchMarketData(opts: FetchMarketOptions): Promise<MarketData[]> {
  const { location, startDate, days = 180, strategy = 'estimated', apiKey, forceRefresh } = opts;
  const countryCodes = await fetchGuestNationalities(location);
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
    if (strategy === 'airroi') {
      try {
        await supabase.functions.invoke('airroi-sync', { body: {} });
        const { data: refreshed } = await supabase
          .from('market_data_cache')
          .select('date, occupancy_rate, avg_price, source')
          .eq('location', location)
          .eq('source', 'airroi')
          .in('date', missing);
        fresh = (refreshed ?? []).map((r: any) => ({
          date: r.date,
          occupancyRate: Number(r.occupancy_rate),
          avgPrice: Number(r.avg_price),
          source: 'airroi',
        }));
      } catch {
        /* fallback below */
      }
    }
    if (fresh.length === 0 && strategy === 'airdna' && apiKey) {
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
      const seasonFactors = await loadSeasonFactors();
      fresh = missing.map((dStr) => estimateOccupancyFromSeason(new Date(dStr), location, countryCodes, seasonFactors));
    }

    // Wettbewerber-Daten haben Vorrang (competitor > airroi > airdna > estimated).
    const compResults = await Promise.all(
      fresh.map((m) => fetchCompetitorOccupancy(location, m.date).catch(() => null)),
    );
    fresh = fresh.map((m, i) => {
      const occ = compResults[i];
      if (occ === null || occ === undefined) return m;
      return {
        ...m,
        occupancyRate: Number(occ.toFixed(3)),
        avgPrice: Math.round(80 + occ * 120),
        source: 'competitor',
      };
    });

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
    const strategy = (import.meta.env.VITE_MARKET_STRATEGY as 'estimated' | 'airdna' | 'airroi' | 'competitor') || 'airroi';
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
// ─── Read-only Zugriff für die Freie-Zeiträume-Analyse (Gäste-Tab) ────────────
// NEU (12.09.2026): Liest NUR den bestehenden Cache, löst KEINEN neuen
// Scrape/Sync aus (das passiert weiterhin nur im Preise-Tab / Cron). Filtert
// explizit source='estimated' heraus — das sind KEINE echten Marktdaten,
// sondern eine aus den eigenen season_factors berechnete Formel
// (siehe estimateOccupancyFromSeason oben). Nur 'airroi' und 'competitor'
// gelten hier als "echtes" externes Signal.
//
// WICHTIG zum Cache-Schlüssel: airroi-sync schreibt market_data_cache.location
// als `airroi_district || airroi_locality` aus system_settings.pricing_config
// (z.B. "Neukirchen am Großvenediger") — NICHT als houses.address. Wer hier mit
// der Hausadresse sucht, bekommt still null zurück.
/** Default-Wert, den airroi-sync bei unbrauchbarer API-Antwort schreibt (siehe CODE-INDEX Modul 12). */
export const AIRROI_FALLBACK_ADR = 120;

export interface RegionalMarketSnapshot {
  avgPricePerNight: number;
  occupancyRate: number;
  source: string;
  daysCovered: number;
  fetchedAt: string | null;
  location: string;
  /** true = nur ein einziger ADR-Wert im Zeitraum -> nur Summary-Endpunkt, grobe Aufloesung. */
  summaryOnly: boolean;
}

/** Liest den AirROI-Cache-Schlüssel aus system_settings.pricing_config. */
export async function resolveMarketLocationKey(): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'pricing_config')
      .maybeSingle();
    const cfg = (data?.value as any) ?? {};
    const district = String(cfg.airroi_district ?? '').trim();
    const locality = String(cfg.airroi_locality ?? '').trim();
    const key = district || locality;
    return key || null;
  } catch {
    return null;
  }
}

export async function fetchRegionalMarketDataReadOnly(
  dateFrom: string,
  dateTo: string,
): Promise<RegionalMarketSnapshot | null> {
  const location = await resolveMarketLocationKey();
  if (!location) return null;

  const { data, error } = await supabase
    .from('market_data_cache')
    .select('avg_price, occupancy_rate, source, fetched_at')
    .eq('location', location)
    .in('source', ['airroi', 'competitor'])
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .not('avg_price', 'is', null);

  if (error || !data || data.length === 0) return null;

  const prices = data.map((r: any) => Number(r.avg_price)).filter((n) => Number.isFinite(n));
  const occs = data.map((r: any) => Number(r.occupancy_rate)).filter((n) => Number.isFinite(n));
  if (prices.length === 0) return null;

  // WICHTIG (Befund aus docs/CODE-INDEX.md, Modul 12, "Stille Fallback-Falle in
  // airroi-sync"): Antwortet die AirROI-API mit HTTP 200 ohne brauchbare Zahlen,
  // greifen in airroi-sync die Defaults `occupancy 0.6` / `adr 120` - und es
  // werden trotzdem 365 Zeilen mit source='airroi' geschrieben. Ohne die
  // folgende Pruefung wuerden wir diese erfundenen 120 EUR als echten
  // Marktpreis anzeigen. Diagnose laut Doku:
  //   adr_min == adr_max == 120        -> Totalausfall, unbrauchbar
  //   genau ein verschiedener Preis    -> nur Summary-Endpunkt, grob
  const distinctPrices = new Set(prices);
  const isFallbackGarbage =
    distinctPrices.size === 1 && prices[0] === AIRROI_FALLBACK_ADR;
  if (isFallbackGarbage) return null;

  const summaryOnly = distinctPrices.size === 1;

  const newestFetch = data
    .map((r: any) => r.fetched_at)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;

  return {
    avgPricePerNight: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
    occupancyRate: occs.length ? occs.reduce((a, b) => a + b, 0) / occs.length : 0,
    source: data[0].source as string,
    daysCovered: data.length,
    fetchedAt: newestFetch ?? null,
    location,
    summaryOnly,
  };
}

export function useRegionalMarketDataReadOnly(dateFrom: string, dateTo: string) {
  const [snapshot, setSnapshot] = useState<RegionalMarketSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRegionalMarketDataReadOnly(dateFrom, dateTo)
      .then((s) => !cancelled && setSnapshot(s))
      .catch(() => !cancelled && setSnapshot(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  return { snapshot, loading };
}
