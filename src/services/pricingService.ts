import { supabase } from '@/integrations/supabase/client';
import { calculateDynamicPrice } from '@/hooks/useDynamicPricing';
import { fetchMarketData } from './marketOccupancyService';

export interface NightlyRate {
  id?: string;
  houseId: string;
  date: string;
  basePrice: number;
  dynamicPrice: number;
  finalPrice?: number | null;
  isBlocked: boolean;
  isBooked: boolean;
  minStay: number;
  marketOccupancy?: number | null;
  marketAvgPrice?: number | null;
  factors?: {
    seasonality: number;
    dayOfWeek: number;
    leadTime: number;
    occupancy: number;
    event: number;
    gapDiscount: number;
  };
}

export interface PropertyConfig {
  id: string;
  name: string;
  basePrice: number;
  minPrice?: number;
  maxPrice?: number;
  location: string;
}

function ymd(d: Date): string {
  return d.toISOString().split('T')[0];
}

function readBaseFromConfig(cfg: any): { base: number; min?: number; max?: number } {
  const c = cfg ?? {};
  return {
    base: Number(c.base_price ?? c.basePrice ?? 100),
    min: c.min_price ? Number(c.min_price) : undefined,
    max: c.max_price ? Number(c.max_price) : undefined,
  };
}

export async function getProperty(houseId: string): Promise<PropertyConfig | null> {
  const { data, error } = await supabase
    .from('houses')
    .select('id, name, address, pricing_config')
    .eq('id', houseId)
    .maybeSingle();
  if (error || !data) return null;
  const { base, min, max } = readBaseFromConfig((data as any).pricing_config);
  return {
    id: data.id,
    name: data.name,
    basePrice: base,
    minPrice: min,
    maxPrice: max,
    location: (data as any).address ?? '',
  };
}

export async function getRatesForRange(
  houseId: string,
  start: Date,
  end: Date,
): Promise<NightlyRate[]> {
  const { data, error } = await supabase
    .from('daily_pricing')
    .select('*')
    .eq('house_id', houseId)
    .gte('date', ymd(start))
    .lte('date', ymd(end))
    .order('date');
  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    houseId: r.house_id,
    date: r.date,
    basePrice: Number(r.price ?? 0),
    dynamicPrice: Number(r.dynamic_price ?? r.price ?? 0),
    finalPrice: r.final_price != null ? Number(r.final_price) : null,
    isBlocked: !!r.is_blocked,
    isBooked: !!r.is_booked,
    minStay: r.min_stay ?? 1,
    marketOccupancy: r.market_occupancy,
    marketAvgPrice: r.market_avg_price,
    factors: {
      seasonality: Number(r.factor_season ?? 1),
      dayOfWeek: Number(r.factor_dow ?? 1),
      leadTime: Number(r.factor_leadtime ?? 1),
      occupancy: Number(r.factor_occupancy ?? 1),
      event: Number(r.factor_event ?? 1),
      gapDiscount: Number(r.factor_gap ?? 1),
    },
  }));
}

export async function overridePrice(houseId: string, date: string, finalPrice: number) {
  const { error } = await supabase
    .from('daily_pricing')
    .update({ final_price: finalPrice, updated_at: new Date().toISOString() })
    .eq('house_id', houseId)
    .eq('date', date);
  if (error) throw error;
}

export async function markAsBooked(houseId: string, start: Date, end: Date) {
  const { error } = await supabase
    .from('daily_pricing')
    .update({ is_booked: true, booked_at: new Date().toISOString() })
    .eq('house_id', houseId)
    .gte('date', ymd(start))
    .lte('date', ymd(end));
  if (error) throw error;
}

export async function getPricingHistory(houseId: string, date: string) {
  const { data } = await supabase
    .from('pricing_logs')
    .select('*')
    .eq('house_id', houseId)
    .eq('date', date)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export interface BulkUpdateOpts {
  houseId: string;
  daysAhead?: number;
  forceRefresh?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export async function bulkUpdatePrices({
  houseId,
  daysAhead = 180,
  forceRefresh = false,
  onProgress,
}: BulkUpdateOpts): Promise<{ updated: number; errors: number }> {
  const property = await getProperty(houseId);
  if (!property) throw new Error('Unterkunft nicht gefunden');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + daysAhead);

  // Events
  const { data: events } = await supabase
    .from('local_events')
    .select('date_start, date_end, event_size')
    .lte('date_start', ymd(endDate))
    .gte('date_end', ymd(today));
  const eventMap = new Map<string, 'small' | 'large' | 'festival'>();
  (events ?? []).forEach((ev: any) => {
    const s = new Date(ev.date_start);
    const e = new Date(ev.date_end);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      eventMap.set(ymd(d), ev.event_size);
    }
  });

  // Marktdaten
  const market = await fetchMarketData({
    location: property.location,
    startDate: today,
    days: daysAhead,
    forceRefresh,
  });
  const marketMap = new Map(market.map((m) => [m.date, m]));

  // Bestehende Rates für Lücken-Erkennung & gebuchte Tage
  const existing = await getRatesForRange(houseId, today, endDate);
  const bookedSet = new Set(existing.filter((r) => r.isBooked).map((r) => r.date));

  let updated = 0;
  let errors = 0;
  let firstError: Error | null = null;
  const total = daysAhead;

  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = ymd(d);

    if (bookedSet.has(dateStr)) {
      onProgress?.(i + 1, total);
      continue;
    }

    const m = marketMap.get(dateStr);
    const occ = m?.occupancyRate ?? 0.6;
    const eventSize = eventMap.get(dateStr);

    // Lücken-Erkennung
    const prev = ymd(new Date(d.getTime() - 86400000));
    const next = ymd(new Date(d.getTime() + 86400000));
    const isGapDay = bookedSet.has(prev) || bookedSet.has(next);
    let gapLength = 1;
    if (isGapDay) {
      for (let k = 1; k <= 5; k++) {
        const fwd = ymd(new Date(d.getTime() + k * 86400000));
        if (bookedSet.has(fwd)) break;
        gapLength = k;
      }
    }

    const result = calculateDynamicPrice({
      basePrice: property.basePrice,
      checkInDate: d,
      marketOccupancy: occ,
      hasLocalEvent: !!eventSize,
      eventSize,
      isGapDay,
      gapLength,
      minPrice: property.minPrice,
      maxPrice: property.maxPrice,
    });

    const { error } = await supabase.rpc('update_dynamic_price' as any, {
      p_house_id: houseId,
      p_date: dateStr,
      p_dynamic_price: result.recommendedPrice,
      p_factors: result.factors as any,
      p_market_occupancy: occ,
      p_market_avg_price: m?.avgPrice ?? null,
      p_source: 'manual',
    });
    if (error) {
      errors++;
      if (!firstError) {
        firstError = error;
      }
    } else updated++;
    onProgress?.(i + 1, total);
  }

  if (updated === 0 && firstError) {
    throw firstError;
  }

  return { updated, errors };
}