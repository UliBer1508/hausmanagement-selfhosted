import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useHouses } from '@/hooks/useHouses';
import { PricingCard } from '@/components/PricingCard';
import { calculateDynamicPrice } from '@/hooks/useDynamicPricing';

export default function DynamicPricingPanel() {
  const { data: houses = [] } = useHouses({ rental_type: 'tourist' });
  const [houseId, setHouseId] = useState<string>('');
  const [date, setDate] = useState<string>(format(addDays(new Date(), 14), 'yyyy-MM-dd'));
  const [basePrice, setBasePrice] = useState<number>(120);
  const [hasEvent, setHasEvent] = useState(false);
  const [eventSize, setEventSize] = useState<'small' | 'large' | 'festival'>('small');
  const [occupancyOverride, setOccupancyOverride] = useState<number | null>(null);

  useEffect(() => {
    if (!houseId && houses.length) setHouseId(houses[0].id);
  }, [houses, houseId]);

  const checkInDate = useMemo(() => startOfDay(new Date(date)), [date]);

  // Marktauslastung ±14 Tage über alle Tourist-Häuser
  const { data: marketOcc = 0.5 } = useQuery({
    queryKey: ['market-occ', date, houses.map(h => h.id).join(',')],
    enabled: houses.length > 0,
    queryFn: async () => {
      const from = addDays(checkInDate, -14).toISOString();
      const to = addDays(checkInDate, 14).toISOString();
      const { data } = await supabase
        .from('bookings')
        .select('check_in,check_out,house_id,status')
        .in('house_id', houses.map(h => h.id))
        .in('status', ['confirmed', 'checked_in', 'completed'] as any)
        .lte('check_in', to)
        .gte('check_out', from);
      const totalNights = houses.length * 29;
      let booked = 0;
      (data ?? []).forEach((b: any) => {
        const ci = new Date(b.check_in);
        const co = new Date(b.check_out);
        const start = ci > addDays(checkInDate, -14) ? ci : addDays(checkInDate, -14);
        const end = co < addDays(checkInDate, 14) ? co : addDays(checkInDate, 14);
        booked += Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
      });
      return Math.min(1, booked / Math.max(1, totalNights));
    },
  });

  // Gap-Day-Erkennung für ausgewähltes Haus
  const { data: gapInfo } = useQuery({
    queryKey: ['gap-day', houseId, date],
    enabled: !!houseId,
    queryFn: async () => {
      const from = addDays(checkInDate, -3).toISOString();
      const to = addDays(checkInDate, 4).toISOString();
      const { data } = await supabase
        .from('bookings')
        .select('check_in,check_out,status')
        .eq('house_id', houseId)
        .in('status', ['confirmed', 'checked_in', 'completed'] as any)
        .lte('check_in', to)
        .gte('check_out', from);

      const occupied = (d: Date) =>
        (data ?? []).some((b: any) => new Date(b.check_in) <= d && new Date(b.check_out) > d);

      const self = occupied(checkInDate);
      if (self) return { isGapDay: false, gapLength: 0 };

      const before = occupied(addDays(checkInDate, -1));
      const after = occupied(addDays(checkInDate, 1));
      if (before && after) return { isGapDay: true, gapLength: 1 };
      if (before || after) return { isGapDay: true, gapLength: 2 };
      return { isGapDay: false, gapLength: 0 };
    },
  });

  const occupancy = occupancyOverride ?? marketOcc;

  const previewDays = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = addDays(checkInDate, i);
      const r = calculateDynamicPrice({
        basePrice,
        checkInDate: d,
        marketOccupancy: occupancy,
        hasLocalEvent: hasEvent,
        eventSize,
      });
      return { date: d, price: r.recommendedPrice, strategy: r.strategy };
    });
  }, [basePrice, checkInDate, occupancy, hasEvent, eventSize]);

  const handleAccept = async (price: number) => {
    if (!houseId) return;
    const { error } = await supabase
      .from('daily_pricing')
      .upsert(
        { house_id: houseId, date, price, currency: 'EUR', source: 'dynamic_pricing' },
        { onConflict: 'house_id,date' } as any,
      );
    if (error) toast.error('Speichern fehlgeschlagen: ' + error.message);
    else toast.success(`Preis ${price} € für ${format(checkInDate, 'dd.MM.yyyy')} gespeichert`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dynamic Pricing</CardTitle>
          <p className="text-sm text-muted-foreground">
            PriceLabs-Logik: Saison, Wochentag, Vorlauf, Marktauslastung, Events und Lückentage.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Haus</Label>
            <Select value={houseId} onValueChange={setHouseId}>
              <SelectTrigger><SelectValue placeholder="Haus wählen" /></SelectTrigger>
              <SelectContent>
                {houses.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Check-in-Datum</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Basispreis (€)</Label>
            <Input
              type="number" min={20} value={basePrice}
              onChange={(e) => setBasePrice(Number(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="flex justify-between">
              <Label>Marktauslastung</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(occupancy * 100)}% {occupancyOverride === null && '(automatisch)'}
              </span>
            </div>
            <Slider
              min={0} max={100} step={1}
              value={[Math.round(occupancy * 100)]}
              onValueChange={(v) => setOccupancyOverride(v[0] / 100)}
            />
            {occupancyOverride !== null && (
              <Button variant="ghost" size="sm" onClick={() => setOccupancyOverride(null)}>
                Auf automatisch zurücksetzen
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lokales Event</Label>
              <Switch checked={hasEvent} onCheckedChange={setHasEvent} />
            </div>
            {hasEvent && (
              <Select value={eventSize} onValueChange={(v: any) => setEventSize(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Klein (+15%)</SelectItem>
                  <SelectItem value="large">Groß (+35%)</SelectItem>
                  <SelectItem value="festival">Festival (+60%)</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {gapInfo?.isGapDay && (
            <div className="md:col-span-2 lg:col-span-3 text-xs px-3 py-2 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
              Lückentag erkannt (Lückenlänge {gapInfo.gapLength}) — Rabatt aktiv.
            </div>
          )}
        </CardContent>
      </Card>

      <PricingCard
        basePrice={basePrice}
        checkInDate={checkInDate}
        marketOccupancy={occupancy}
        hasLocalEvent={hasEvent}
        eventSize={eventSize}
        isGapDay={gapInfo?.isGapDay}
        gapLength={gapInfo?.gapLength}
        onPriceAccepted={handleAccept}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">14-Tage-Vorschau</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {previewDays.map((d) => (
              <div key={d.date.toISOString()} className="rounded-md border p-2 text-center">
                <p className="text-[10px] uppercase text-muted-foreground">
                  {format(d.date, 'EEE', { locale: de })}
                </p>
                <p className="text-xs">{format(d.date, 'dd.MM.')}</p>
                <p className="text-lg font-semibold tabular-nums mt-1">{d.price}€</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}