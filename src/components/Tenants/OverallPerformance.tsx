import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Euro, CheckCircle, AlertCircle } from "lucide-react";
import { TenantPayment } from "@/types";

interface Props {
  totalRevenue: number;
  avgMonthlyRent: number;
  punctuality: number;
  openClaims: number;
  yearPayments: TenantPayment[];
  selectedYear: number;
}

const OverallPerformance = ({ 
  totalRevenue, 
  avgMonthlyRent, 
  punctuality, 
  openClaims,
  yearPayments,
  selectedYear 
}: Props) => {
  
  // Monatliche kumulierte Einnahmen berechnen
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const monthPayments = yearPayments.filter(p => {
      if (!p.payment_date) return false;
      const paymentMonth = new Date(p.payment_date).getMonth() + 1;
      return p.status === 'paid' && paymentMonth <= month;
    });
    
    const cumulative = monthPayments.reduce((sum, p) => sum + p.amount, 0);
    
    return {
      month: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 
              'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][i],
      revenue: cumulative
    };
  });

  return (
    <div className="space-y-6">
      {/* KPI-Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Gesamteinnahmen {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalRevenue.toLocaleString('de-DE')} €
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              Kumulierte Einnahmen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ø Monatsmiete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgMonthlyRent.toLocaleString('de-DE')} €
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Durchschnitt aller Objekte
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pünktlichkeit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${punctuality >= 90 ? 'text-green-600' : 'text-orange-600'}`}>
              {punctuality}%
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Rechtzeitige Zahlungen
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Offene Forderungen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${openClaims > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {openClaims.toLocaleString('de-DE')} €
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {openClaims > 0 ? 'Überfällige Zahlungen' : 'Keine offenen Beträge'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* LineChart */}
      <Card>
        <CardHeader>
          <CardTitle>Einnahmen-Entwicklung {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k €`}
              />
              <Tooltip 
                formatter={(value: number) => [`${value.toLocaleString('de-DE')} €`, 'Einnahmen']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default OverallPerformance;
