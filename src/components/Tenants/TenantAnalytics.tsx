import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHouses } from "@/hooks/useHouses";
import { useTenantPayments } from "@/hooks/useTenantPayments";
import { LineChart, Line, PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { Euro, TrendingUp, AlertCircle, CheckCircle, FileText, Calendar, Clock } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, differenceInMonths } from "date-fns";
import { de } from "date-fns/locale";

const TenantAnalytics = () => {
  const [selectedHouseId, setSelectedHouseId] = useState<string>("all");
  const { data: houses } = useHouses();
  const { data: allPayments } = useTenantPayments();

  const longTermRentals = houses?.filter(h => h.rental_type === 'long_term' && h.tenant_info) || [];
  
  const payments = selectedHouseId === "all" 
    ? allPayments 
    : allPayments?.filter(p => p.house_id === selectedHouseId);

  // Zahlungsübersicht-Statistiken
  const totalRevenue = payments?.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0) || 0;
  const averageMonthlyRent = longTermRentals.length > 0 
    ? longTermRentals.reduce((sum, h) => sum + ((h.tenant_info as any)?.monthly_rent || 0), 0) / longTermRentals.length 
    : 0;
  const outstandingAmount = payments?.filter(p => p.status === 'overdue' || p.status === 'pending').reduce((sum, p) => sum + p.amount, 0) || 0;
  
  const paidOnTime = payments?.filter(p => p.status === 'paid' && p.payment_date && p.payment_date <= p.due_date).length || 0;
  const totalPaid = payments?.filter(p => p.status === 'paid').length || 0;
  const paymentPunctuality = totalPaid > 0 ? Math.round((paidOnTime / totalPaid) * 100) : 0;

  // Jahresgesamten für spezifische Jahre berechnen
  const year2024Total = payments?.filter(p => {
    const paymentYear = new Date(p.payment_date || p.due_date).getFullYear();
    return paymentYear === 2024 && p.status === 'paid';
  }).reduce((sum, p) => sum + p.amount, 0) || 0;

  const year2025Total = payments?.filter(p => {
    const paymentYear = new Date(p.payment_date || p.due_date).getFullYear();
    return paymentYear === 2025 && p.status === 'paid';
  }).reduce((sum, p) => sum + p.amount, 0) || 0;

  // Monatliche Einnahmen (letzte 12 Monate)
  const monthlyRevenueData = useMemo(() => {
    const data = [];
    for (let i = 11; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      
      const revenue = payments?.filter(p => {
        const paymentDate = new Date(p.payment_date || p.due_date);
        return p.status === 'paid' && paymentDate >= monthStart && paymentDate <= monthEnd;
      }).reduce((sum, p) => sum + p.amount, 0) || 0;
      
      data.push({
        month: format(date, 'MMM yy', { locale: de }),
        revenue: revenue
      });
    }
    return data;
  }, [payments]);

  // Zahlungsstatus-Verteilung
  const statusDistribution = useMemo(() => {
    const paid = payments?.filter(p => p.status === 'paid').length || 0;
    const overdue = payments?.filter(p => p.status === 'overdue').length || 0;
    const pending = payments?.filter(p => p.status === 'pending').length || 0;
    
    return [
      { name: 'Bezahlt', value: paid, color: '#22c55e' },
      { name: 'Überfällig', value: overdue, color: '#ef4444' },
      { name: 'Ausstehend', value: pending, color: '#eab308' }
    ].filter(item => item.value > 0);
  }, [payments]);

  // Einnahmen pro Objekt
  const revenuePerHouse = useMemo(() => {
    const houseRevenues = longTermRentals.map(house => {
      const housePayments = allPayments?.filter(p => p.house_id === house.id && p.status === 'paid') || [];
      const revenue = housePayments.reduce((sum, p) => sum + p.amount, 0);
      return {
        name: house.name,
        revenue: revenue
      };
    });
    return houseRevenues.sort((a, b) => b.revenue - a.revenue);
  }, [longTermRentals, allPayments]);

  // Vertragsanalyse
  const fixedTermContracts = longTermRentals.filter(h => (h.tenant_info as any)?.contract_end).length;
  const unlimitedContracts = longTermRentals.filter(h => !(h.tenant_info as any)?.contract_end).length;
  
  const averageContractDuration = useMemo(() => {
    const fixedContracts = longTermRentals.filter(h => (h.tenant_info as any)?.contract_end);
    if (fixedContracts.length === 0) return 0;
    
    const totalMonths = fixedContracts.reduce((sum, h) => {
      const info = h.tenant_info as any;
      const start = new Date(info.contract_start);
      const end = new Date(info.contract_end);
      return sum + differenceInMonths(end, start);
    }, 0);
    
    return Math.round(totalMonths / fixedContracts.length);
  }, [longTermRentals]);

  const expiringNextQuarter = useMemo(() => {
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
    
    return longTermRentals.filter(h => {
      const contractEnd = (h.tenant_info as any)?.contract_end;
      if (!contractEnd) return false;
      const endDate = new Date(contractEnd);
      return endDate <= threeMonthsFromNow && endDate >= new Date();
    }).length;
  }, [longTermRentals]);

  return (
    <div className="space-y-6">
      {/* Haus-Filter */}
      <div className="flex justify-between items-center">
        <Select value={selectedHouseId} onValueChange={setSelectedHouseId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Objekt wählen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Objekte</SelectItem>
            {longTermRentals.map(house => (
              <SelectItem key={house.id} value={house.id}>{house.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Zahlungsübersicht-Statistiken */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Gesamteinnahmen</p>
              <p className="text-2xl font-bold">{totalRevenue.toLocaleString('de-DE')} €</p>
            </div>
            <Euro className="h-8 w-8 text-green-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Ø Monatsmiete</p>
              <p className="text-2xl font-bold">{Math.round(averageMonthlyRent).toLocaleString('de-DE')} €</p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Ausstehend</p>
              <p className="text-2xl font-bold">{outstandingAmount.toLocaleString('de-DE')} €</p>
            </div>
            <AlertCircle className="h-8 w-8 text-orange-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pünktlichkeit</p>
              <p className="text-2xl font-bold">{paymentPunctuality}%</p>
            </div>
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Gesamt 2024</p>
              <p className="text-2xl font-bold">{year2024Total.toLocaleString('de-DE')} €</p>
            </div>
            <Calendar className="h-8 w-8 text-purple-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Gesamt 2025</p>
              <p className="text-2xl font-bold">{year2025Total.toLocaleString('de-DE')} €</p>
            </div>
            <TrendingUp className="h-8 w-8 text-indigo-600" />
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monatliche Einnahmen */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Monatliche Mieteinnahmen</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyRevenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `${Number(value).toLocaleString('de-DE')} €`} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name="Einnahmen" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Zahlungsstatus-Verteilung */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Zahlungsstatus-Verteilung</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {statusDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Einnahmen pro Objekt */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Einnahmen pro Objekt</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={revenuePerHouse}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value) => `${Number(value).toLocaleString('de-DE')} €`} />
            <Legend />
            <Bar dataKey="revenue" fill="#8b5cf6" name="Einnahmen" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Vertragsanalyse */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Befristete Verträge</p>
              <p className="text-2xl font-bold">{fixedTermContracts}</p>
            </div>
            <FileText className="h-8 w-8 text-purple-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Unbefristete Verträge</p>
              <p className="text-2xl font-bold">{unlimitedContracts}</p>
            </div>
            <FileText className="h-8 w-8 text-indigo-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Ø Vertragslaufzeit</p>
              <p className="text-2xl font-bold">{averageContractDuration} Monate</p>
            </div>
            <Clock className="h-8 w-8 text-cyan-600" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Läuft in 3 Mon. aus</p>
              <p className="text-2xl font-bold">{expiringNextQuarter}</p>
            </div>
            <Calendar className="h-8 w-8 text-red-600" />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default TenantAnalytics;
