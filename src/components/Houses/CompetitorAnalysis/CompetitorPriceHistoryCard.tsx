import { useCompetitorPriceHistory } from "@/hooks/useCompetitorAnalysis";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

interface CompetitorPriceHistoryCardProps {
  competitor_id: string;
}

const CompetitorPriceHistoryCard = ({ competitor_id }: CompetitorPriceHistoryCardProps) => {
  const { data: history, isLoading } = useCompetitorPriceHistory(competitor_id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Noch keine Preisdaten für diesen Wettbewerber erfasst.
      </div>
    );
  }

  // Statistiken berechnen
  const avgPrice = history.reduce((sum, h) => sum + h.avg_price, 0) / history.length;
  const minEntry = history.reduce((min, h) => h.avg_price < min.avg_price ? h : min, history[0]);
  const maxEntry = history.reduce((max, h) => h.avg_price > max.avg_price ? h : max, history[0]);
  
  // Trend: Vergleich erste vs. letzte Erfassung
  const firstCapture = history[history.length - 1];
  const lastCapture = history[0];
  const trendPercent = ((lastCapture.avg_price - firstCapture.avg_price) / firstCapture.avg_price) * 100;

  // Chart-Daten vorbereiten: X-Achse = Erfassungsdatum, Y-Achse = Durchschnittspreis
  const chartData = [...history].reverse().map(entry => ({
    date: format(new Date(entry.captured_at), 'dd.MM.yy'),
    price: entry.avg_price,
    label: `${entry.period_start} - ${entry.period_end}`
  }));

  return (
    <div className="space-y-6">
      {/* Statistik-Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Erfassungen</p>
              <p className="text-2xl font-bold">{history.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Durchschnitt</p>
              <p className="text-2xl font-bold">{Math.round(avgPrice)} €</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Minimum</p>
              <p className="text-xl font-bold text-green-600">
                {Math.round(minEntry.avg_price)} €
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(minEntry.captured_at), 'MMM yyyy', { locale: de })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Maximum</p>
              <p className="text-xl font-bold text-orange-600">
                {Math.round(maxEntry.avg_price)} €
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(maxEntry.captured_at), 'MMM yyyy', { locale: de })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Trend</p>
              <div className="flex items-center gap-2">
                {trendPercent > 5 ? (
                  <>
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                    <span className="text-xl font-bold text-orange-600">
                      +{Math.round(trendPercent)}%
                    </span>
                  </>
                ) : trendPercent < -5 ? (
                  <>
                    <TrendingDown className="w-5 h-5 text-green-600" />
                    <span className="text-xl font-bold text-green-600">
                      {Math.round(trendPercent)}%
                    </span>
                  </>
                ) : (
                  <>
                    <Minus className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xl font-bold text-muted-foreground">
                      stabil
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Graph */}
      <Card>
        <CardContent className="pt-6">
          <h4 className="text-sm font-medium mb-4">Preisverlauf über Zeit</h4>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis 
                tick={{ fontSize: 11 }}
                label={{ value: 'Preis (€/Nacht)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
                formatter={(value: number, name, props: any) => [
                  `${value.toFixed(2)} €/Nacht`,
                  props.payload.label
                ]}
              />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Erfassungs-Tabelle */}
      <Card>
        <CardContent className="pt-6">
          <h4 className="text-sm font-medium mb-4">Alle Erfassungen</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Erfasst am</TableHead>
                <TableHead>Zeitraum</TableHead>
                <TableHead className="text-right">Nächte</TableHead>
                <TableHead className="text-right">Ø Preis</TableHead>
                <TableHead className="text-right">Änderung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.captured_at}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      {format(new Date(entry.captured_at), 'dd.MM.yyyy', { locale: de })}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(entry.period_start), 'dd.MM.')} - 
                    {format(new Date(entry.period_end), 'dd.MM.yyyy')}
                  </TableCell>
                  <TableCell className="text-right">{entry.nights_count}</TableCell>
                  <TableCell className="text-right font-medium">
                    {entry.avg_price.toFixed(2)} {entry.currency}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.price_change_percent !== undefined ? (
                      <span className={`flex items-center justify-end gap-1 ${
                        entry.price_change_percent > 0 
                          ? 'text-orange-600' 
                          : 'text-green-600'
                      }`}>
                        {entry.price_change_percent > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {entry.price_change_percent > 0 ? '+' : ''}
                        {entry.price_change_percent}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompetitorPriceHistoryCard;
