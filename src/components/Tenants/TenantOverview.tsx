import { useState } from "react";
import { useHouses } from "@/hooks/useHouses";
import { useTenantPayments } from "@/hooks/useTenantPayments";
import OverallPerformance from "./OverallPerformance";
import ObjectPerformanceCard from "./ObjectPerformanceCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { isBefore } from "date-fns";

interface TenantOverviewProps {
  onNavigateToPayments?: () => void;
}

const TenantOverview = ({ onNavigateToPayments }: TenantOverviewProps) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const { data: houses, isLoading: housesLoading } = useHouses();
  const { data: allPayments, isLoading: paymentsLoading } = useTenantPayments();
  
  const longTermRentals = houses?.filter(h => 
    h.rental_type === 'long_term' && h.tenant_info
  ) || [];
  
  // Payments für gewähltes Jahr filtern
  const yearPayments = allPayments?.filter(p => 
    new Date(p.due_date).getFullYear() === selectedYear
  ) || [];
  
  // Aggregierte Daten berechnen
  const totalRevenue = yearPayments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);
    
  const avgMonthlyRent = longTermRentals.length > 0
    ? longTermRentals.reduce((sum, h) => 
        sum + (h.tenant_info?.monthly_rent || 0), 0
      ) / longTermRentals.length
    : 0;
  
  const completedPayments = yearPayments.filter(p => p.status === 'paid');
  const paidOnTime = completedPayments.filter(p => {
    if (!p.payment_date) return false;
    const paymentDate = new Date(p.payment_date);
    const dueDate = new Date(p.due_date);
    return isBefore(paymentDate, dueDate) || paymentDate.toDateString() === dueDate.toDateString();
  }).length;
  
  const punctuality = completedPayments.length > 0 
    ? Math.round((paidOnTime / completedPayments.length) * 100)
    : 0;
    
  const openClaims = yearPayments
    .filter(p => p.status === 'overdue')
    .reduce((sum, p) => sum + p.amount, 0);

  const isLoading = housesLoading || paymentsLoading;

  if (isLoading) {
    return <div>Lade Performance-Daten...</div>;
  }

  if (longTermRentals.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Keine Festvermietungen vorhanden. Erstellen Sie ein neues Objekt mit Vermietungsart "Festvermietung".
        </AlertDescription>
      </Alert>
    );
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="space-y-6">
      {/* Jahr-Filter */}
      <div className="flex justify-end">
        <Select 
          value={selectedYear.toString()} 
          onValueChange={(value) => setSelectedYear(parseInt(value))}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(year => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Gesamt-Performance */}
      <OverallPerformance
        totalRevenue={totalRevenue}
        avgMonthlyRent={avgMonthlyRent}
        punctuality={punctuality}
        openClaims={openClaims}
        yearPayments={yearPayments}
        selectedYear={selectedYear}
      />

      {/* Objekt-Liste */}
      <div>
        <h2 className="text-xl font-semibold mb-4">
          Objekt-Performance {selectedYear}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {longTermRentals.map(house => {
            const housePayments = yearPayments.filter(p => 
              p.house_id === house.id
            );
            
            return (
              <ObjectPerformanceCard
                key={house.id}
                house={house}
                payments={housePayments}
                selectedYear={selectedYear}
                onNavigateToPayments={onNavigateToPayments}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TenantOverview;
