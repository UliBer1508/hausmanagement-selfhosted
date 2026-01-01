import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Euro, TrendingUp, CheckCircle, Clock } from 'lucide-react';
import { RevenueData } from '@/hooks/useOperationsDashboard';

interface RevenueCardProps {
  revenue: RevenueData;
}

export function RevenueCard({ revenue }: RevenueCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const paidPercentage = revenue.total > 0 ? Math.round((revenue.paid / revenue.total) * 100) : 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Euro className="h-4 w-4 text-emerald-500" />
          Einnahmen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Gesamt</span>
          </div>
          <span className="text-lg font-bold">{formatCurrency(revenue.total)}</span>
        </div>

        {/* Paid / Open */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="flex items-center gap-1 text-xs text-green-700 mb-1">
              <CheckCircle className="h-3 w-3" />
              Bezahlt
            </div>
            <span className="text-sm font-bold text-green-700">{formatCurrency(revenue.paid)}</span>
          </div>
          <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
            <div className="flex items-center gap-1 text-xs text-orange-700 mb-1">
              <Clock className="h-3 w-3" />
              Offen
            </div>
            <span className="text-sm font-bold text-orange-700">{formatCurrency(revenue.open)}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Zahlungsfortschritt</span>
            <span>{paidPercentage}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${paidPercentage}%` }}
            />
          </div>
        </div>

        {/* By House */}
        {revenue.byHouse.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Nach Haus</p>
            <div className="space-y-1 max-h-[120px] overflow-y-auto">
              {revenue.byHouse.map((house, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm p-2 rounded bg-muted/30"
                >
                  <span className="truncate flex-1">{house.houseName}</span>
                  <Badge variant="secondary" className="ml-2">
                    {formatCurrency(house.amount)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
