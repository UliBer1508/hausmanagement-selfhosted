import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';

export interface PricingCardProps {
  basePrice: number;
  checkInDate: Date;
  marketOccupancy: number;
  hasLocalEvent?: boolean;
  eventSize?: 'small' | 'large' | 'festival';
  isGapDay?: boolean;
  gapLength?: number;
  onPriceAccepted?: (price: number) => void;
}

const FACTOR_LABELS: Record<string, string> = {
  seasonality: 'Saison',
  dayOfWeek: 'Wochentag',
  leadTime: 'Vorlauf',
  occupancy: 'Auslastung',
  event: 'Event',
  gapDiscount: 'Lücke',
};

function FactorPill({ name, value }: { name: string; value: number }) {
  const pct = Math.round((value - 1) * 100);
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  const tone =
    pct > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    pct < 0 ? 'bg-rose-50 text-rose-700 border-rose-200' :
    'bg-muted text-muted-foreground border-border';
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${tone}`}>
      <Icon className="h-3 w-3" />
      <span>{FACTOR_LABELS[name] ?? name}</span>
      <span className="tabular-nums">{pct > 0 ? '+' : ''}{pct}%</span>
    </div>
  );
}

export function PricingCard(props: PricingCardProps) {
  const result = useDynamicPricing({
    basePrice: props.basePrice,
    checkInDate: props.checkInDate,
    marketOccupancy: props.marketOccupancy,
    hasLocalEvent: props.hasLocalEvent,
    eventSize: props.eventSize,
    isGapDay: props.isGapDay,
    gapLength: props.gapLength,
  });

  const [price, setPrice] = useState(result.recommendedPrice);
  useEffect(() => setPrice(result.recommendedPrice), [result.recommendedPrice]);

  const strategyTone =
    result.strategy === 'last-minute' ? 'destructive' :
    result.strategy === 'far-out' ? 'default' : 'secondary';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Empfohlener Preis · {props.checkInDate.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </CardTitle>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums">{price}</span>
              <span className="text-lg text-muted-foreground">€ / Nacht</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Basis {props.basePrice} € · Range {result.minPrice}–{result.maxPrice} €
            </p>
          </div>
          <Badge variant={strategyTone as any} className="shrink-0">
            {result.strategy === 'last-minute' && 'Last Minute'}
            {result.strategy === 'far-out' && 'Frühbucher'}
            {result.strategy === 'standard' && 'Standard'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Slider */}
        <div>
          <Slider
            min={result.minPrice}
            max={result.maxPrice}
            step={1}
            value={[price]}
            onValueChange={(v) => setPrice(v[0])}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1 tabular-nums">
            <span>{result.minPrice} €</span>
            <span>{result.maxPrice} €</span>
          </div>
        </div>

        {/* Factors */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Preisfaktoren</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(result.factors).map(([k, v]) => (
              <FactorPill key={k} name={k} value={v} />
            ))}
          </div>
        </div>

        {/* Booking probability */}
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Buchungswahrscheinlichkeit</span>
            <span className="font-semibold tabular-nums">{Math.round(result.bookingProbability * 100)}%</span>
          </div>
          <Progress value={result.bookingProbability * 100} className="h-2" />
        </div>

        {/* Tags */}
        {result.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px] font-normal">{t}</Badge>
            ))}
          </div>
        )}

        {props.onPriceAccepted && (
          <Button className="w-full" onClick={() => props.onPriceAccepted!(price)}>
            Preis übernehmen ({price} €)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default PricingCard;