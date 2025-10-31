import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PriceComparisonData } from "@/hooks/useCompetitorAnalysis";
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface PriceComparisonChartProps {
  data: PriceComparisonData[];
  competitors: Array<{ id: string; property_name: string }>;
}

const PriceComparisonChart = ({ data, competitors }: PriceComparisonChartProps) => {
  // Bereite Daten für Chart vor (basierend auf check_in Perioden)
  const chartData = data.map(row => {
    const checkIn = row.check_in || row.date;
    const checkOut = row.check_out;
    const periodLabel = checkOut 
      ? `${format(new Date(checkIn), 'dd.MM')} → ${format(new Date(checkOut), 'dd.MM')}`
      : format(new Date(checkIn), 'dd.MM');
    
    return {
      period: periodLabel,
      'Dein Preis': row.own_price || null,
      'Marktdurchschnitt': row.average_competitor_price ? Math.round(row.average_competitor_price) : null,
      ...Object.fromEntries(
        competitors.slice(0, 2).map(comp => [
          comp.property_name,
          row.competitor_prices[comp.id]?.price || null
        ])
      )
    };
  });

  const colors = [
    '#2563eb', // Blau für eigenen Preis
    '#f59e0b', // Orange für Durchschnitt
    '#10b981', // Grün für Competitor 1
    '#8b5cf6', // Lila für Competitor 2
  ];

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 10, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="period" 
            tick={{ fontSize: 11 }}
            angle={-45}
            textAnchor="end"
            height={80}
            className="text-muted-foreground"
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
            label={{ value: 'Gesamtpreis (€)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(var(--background))', 
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px'
            }}
            formatter={(value: number) => [`€${value}`, '']}
            labelFormatter={(label) => `Zeitraum: ${label}`}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="Dein Preis" 
            stroke={colors[0]}
            strokeWidth={3}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line 
            type="monotone" 
            dataKey="Marktdurchschnitt" 
            stroke={colors[1]}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3 }}
          />
          {competitors.slice(0, 2).map((comp, index) => (
            <Line 
              key={comp.id}
              type="monotone" 
              dataKey={comp.property_name} 
              stroke={colors[index + 2]}
              strokeWidth={1.5}
              dot={{ r: 2 }}
              opacity={0.6}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PriceComparisonChart;
