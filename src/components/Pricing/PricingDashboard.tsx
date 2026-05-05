import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, LayoutGrid, List, RefreshCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { toISODate } from '@/lib/dateHelpers';
import {
  getRatesForRange,
  overridePrice,
  bulkUpdatePrices,
  bulkUpdatePricesV2,
  type NightlyRate,
} from '@/services/pricingService';
import { PricingConfigCard } from '@/components/Pricing/PricingConfigCard';
import { PricingFactorsConfig } from '@/components/Pricing/PricingFactorsConfig';
import { Sparkles } from 'lucide-react';
import { useMarketData } from '@/services/marketOccupancyService';

interface Props {
  houseId: string;
  propertyName?: string;
  location?: string;
}

const WEEK_DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function ymd(d: Date) { return toISODate(d); }

function priceColor(ratio: number, isBooked: boolean, isBlocked: boolean) {
  if (isBlocked) return 'bg-muted text-muted-foreground';
  if (isBooked) return 'bg-blue-100 text-blue-700';
  if (ratio >= 1.3) return 'bg-green-100 text-green-700';
  if (ratio >= 1.0) return 'bg-emerald-50 text-emerald-700';
  if (ratio >= 0.85) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-700';
}

export function PricingDashboard({ houseId, propertyName, location }: Props) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const endDate = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 180); return d; }, [today]);

  const [rates, setRates] = useState<Map<string, NightlyRate>>(new Map());
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [updateResult, setUpdateResult] = useState<{ updated: number; errors: number } | null>(null);
  const [smartResult, setSmartResult] = useState<{ updated: number; errors: number; preview: any[] } | null>(null);
  const [isSmartUpdating, setIsSmartUpdating] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [overrideValue, setOverrideValue] = useState<string>('');
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));

  const { data: market, loading: marketLoading } = useMarketData(location ?? '', today, 180);

  async function loadRates() {
    const list = await getRatesForRange(houseId, today, endDate);
    setRates(new Map(list.map((r) => [r.date, r])));
  }

  useEffect(() => { if (houseId) loadRates(); /* eslint-disable-next-line */ }, [houseId]);

  async function handleBulkUpdate() {
    setIsUpdating(true);
    setProgress(0);
    setUpdateResult(null);
    try {
      const result = await bulkUpdatePrices({
        houseId,
        daysAhead: 180,
        onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      });
      setUpdateResult(result);
      await loadRates();
      toast.success(`${result.updated} Tage aktualisiert`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Update fehlgeschlagen');
    } finally {
      setIsUpdating(false);
    }
  }


  async function handleSmartUpdate() {
    setIsSmartUpdating(true);
    setSmartResult(null);
    try {
      const result = await bulkUpdatePricesV2({ houseId, daysAhead: 180 });
      setSmartResult(result);
      await loadRates();
      toast.success(`Smart: ${result.updated} Tage aktualisiert`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Smart-Update fehlgeschlagen');
    } finally {
      setIsSmartUpdating(false);
    }
  }

  async function handleSaveOverride() {
    if (!selectedDate || !overrideValue) return;
    try {
      await overridePrice(houseId, selectedDate, Number(overrideValue));
      toast.success('Preis gespeichert');
      setSelectedDate(null);
      setOverrideValue('');
      await loadRates();
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen: ' + e?.message);
    }
  }

  // Kalender-Grid für aktuellen Monat
  const calendarDays = useMemo(() => {
    const first = new Date(currentMonth);
    const startWeekday = (first.getDay() + 6) % 7; // Mo=0
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [currentMonth]);

  const selectedRate = selectedDate ? rates.get(selectedDate) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">{propertyName ?? 'Unterkunft'}</h2>
          {location && <p className="text-sm text-muted-foreground">{location}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === 'calendar' ? 'list' : 'calendar')}>
            {viewMode === 'calendar' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>
          <Button onClick={handleBulkUpdate} disabled={isUpdating} size="sm" variant="outline">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Preise neu berechnen
          </Button>
          <Button onClick={handleSmartUpdate} disabled={isSmartUpdating} size="sm">
            <Sparkles className="h-4 w-4 mr-2" />
            Preise neu berechnen (Smart)
          </Button>
        </div>
      </div>

      <PricingConfigCard houseId={houseId} />

      <GlobalPricingConfigCard />

      <PricingFactorsConfig houseId={houseId} />

      {smartResult && !isSmartUpdating && (
        <div className="p-3 rounded-md bg-purple-50 border border-purple-200 text-purple-900 text-sm space-y-2">
          <div>✨ Smart-Update: {smartResult.updated} Tage aktualisiert{smartResult.errors > 0 && ` · ${smartResult.errors} Fehler`}</div>
          {smartResult.preview && smartResult.preview.length > 0 && (
            <div className="text-xs text-purple-800">
              Faktoren angewendet: {Object.keys(smartResult.preview[0].factors).join(', ')}
            </div>
          )}
        </div>
      )}

      {isUpdating && (
        <div className="space-y-1">
          <Progress value={progress} />
          <p className="text-xs text-muted-foreground">{progress}%</p>
        </div>
      )}

      {updateResult && !isUpdating && (
        <div className="p-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm">
          ✓ {updateResult.updated} Tage aktualisiert
          {updateResult.errors > 0 && ` · ${updateResult.errors} Fehler`}
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className={`flex items-center gap-1.5 ${marketLoading ? 'text-amber-600' : 'text-green-600'}`}>
          <span className="w-2 h-2 rounded-full bg-current" /> Marktdaten {marketLoading ? 'laden…' : `(${market.size} Tage)`}
        </span>
        <span className="flex items-center gap-1.5 text-green-600">
          <span className="w-2 h-2 rounded-full bg-current" /> Supabase verbunden
        </span>
      </div>

      {viewMode === 'calendar' ? (
        <Card className="p-4 overflow-x-auto">
          <div className="flex items-center justify-center gap-4 mb-3">
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium min-w-[180px] text-center">
              {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 min-w-[420px]">
            {WEEK_DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
            ))}
            {calendarDays.map((d, i) => {
              if (!d) return <div key={i} />;
              const dStr = ymd(d);
              const r = rates.get(dStr);
              const isPast = d < today;
              const ratio = r && r.basePrice > 0 ? r.dynamicPrice / r.basePrice : 1;
              const cls = r ? priceColor(ratio, r.isBooked, r.isBlocked) : 'bg-muted/30 text-muted-foreground';
              const hasMarket = market.has(dStr);
              const isSelected = selectedDate === dStr;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isPast}
                  onClick={() => { setSelectedDate(dStr); setOverrideValue(''); }}
                  className={`relative aspect-square rounded-md p-1 flex flex-col items-center justify-center text-xs ${cls} ${isPast ? 'opacity-30 cursor-default' : 'cursor-pointer hover:ring-1 hover:ring-primary/40'} ${isSelected ? 'ring-2 ring-primary' : ''}`}
                >
                  <span className="text-xs font-medium">{d.getDate()}</span>
                  <span className="text-xs font-semibold">{r ? `${Math.round(r.finalPrice ?? r.dynamicPrice)}€` : '–'}</span>
                  {hasMarket && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" />}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 flex-wrap mt-4 text-xs text-muted-foreground">
            <span><span className="inline-block w-3 h-3 rounded bg-green-100 mr-1 align-middle" />&gt;+30%</span>
            <span><span className="inline-block w-3 h-3 rounded bg-emerald-50 mr-1 align-middle" />Normal</span>
            <span><span className="inline-block w-3 h-3 rounded bg-amber-50 mr-1 align-middle" />Rabatt</span>
            <span><span className="inline-block w-3 h-3 rounded bg-blue-100 mr-1 align-middle" />Gebucht</span>
            <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 align-middle" />Marktdaten</span>
          </div>
        </Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left p-2">Datum</th>
                <th className="text-right p-2">Basis</th>
                <th className="text-right p-2">Dynamisch</th>
                <th className="text-right p-2">Markt %</th>
                <th className="text-center p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 30 }).map((_, i) => {
                const d = new Date(today); d.setDate(d.getDate() + i);
                const dStr = ymd(d);
                const r = rates.get(dStr);
                const m = market.get(dStr);
                const ratio = r && r.basePrice > 0 ? r.dynamicPrice / r.basePrice : 1;
                return (
                  <tr key={dStr} className="border-t cursor-pointer hover:bg-muted/30" onClick={() => setSelectedDate(dStr)}>
                    <td className="p-2">{WEEK_DAYS[(d.getDay() + 6) % 7]} {d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</td>
                    <td className="p-2 text-right">{r ? `${Math.round(r.basePrice)}€` : '–'}</td>
                    <td className={`p-2 text-right font-medium ${r ? priceColor(ratio, false, false).split(' ')[1] : ''}`}>{r ? `${Math.round(r.finalPrice ?? r.dynamicPrice)}€` : '–'}</td>
                    <td className="p-2 text-right">{m ? `${Math.round(m.occupancyRate * 100)}%` : '–'}</td>
                    <td className="p-2 text-center">
                      {r?.isBooked && <Badge className="bg-blue-100 text-blue-700">Gebucht</Badge>}
                      {r?.isBlocked && <Badge className="bg-muted text-muted-foreground">Gesperrt</Badge>}
                      {r?.finalPrice != null && !r.isBooked && <Badge className="bg-purple-100 text-purple-700">Manuell</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {selectedDate && selectedRate && (
        <Card className="p-5 bg-blue-50/50 border-blue-200 relative">
          <button onClick={() => setSelectedDate(null)} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
          <p className="font-medium mb-2">
            {new Date(selectedDate).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
            <div><span className="text-muted-foreground">Dynamisch:</span> <strong>{Math.round(selectedRate.dynamicPrice)}€</strong></div>
            {selectedRate.finalPrice != null && (
              <div><span className="text-muted-foreground">Manuell:</span> <strong>{Math.round(selectedRate.finalPrice)}€</strong></div>
            )}
            {selectedRate.marketOccupancy != null && (
              <div><span className="text-muted-foreground">Markt:</span> <strong>{Math.round(Number(selectedRate.marketOccupancy) * 100)}%</strong></div>
            )}
          </div>
          {selectedRate.factors && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mb-4">
              {Object.entries(selectedRate.factors).map(([k, v]) => {
                const tone = v > 1 ? 'text-green-700' : v < 1 ? 'text-red-700' : 'text-muted-foreground';
                return (
                  <div key={k} className="flex justify-between bg-background rounded px-2 py-1">
                    <span className="text-muted-foreground capitalize">{k}</span>
                    <span className={tone}>×{Number(v).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Preis manuell überschreiben…"
              value={overrideValue}
              onChange={(e) => setOverrideValue(e.target.value)}
            />
            <Button onClick={handleSaveOverride} disabled={!overrideValue}>Speichern</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export default PricingDashboard;