import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Euro, CheckCircle, Calendar } from "lucide-react";
import { House, TenantPayment } from "@/types";
import MonthlyPaymentTimeline from "./MonthlyPaymentTimeline";
import { format, isBefore } from "date-fns";
import { de } from "date-fns/locale";

interface Props {
  house: House;
  payments: TenantPayment[];
  selectedYear: number;
  onNavigateToPayments?: () => void;
}

const ObjectPerformanceCard = ({ 
  house, 
  payments, 
  selectedYear,
  onNavigateToPayments 
}: Props) => {
  const tenantInfo = house.tenant_info;
  
  // Metriken berechnen
  const paidPayments = payments.filter(p => p.status === 'paid');
  const yearRevenue = paidPayments.reduce((sum, p) => sum + p.amount, 0);
  
  const paidOnTime = paidPayments.filter(p => {
    if (!p.payment_date) return false;
    const paymentDate = new Date(p.payment_date);
    const dueDate = new Date(p.due_date);
    return isBefore(paymentDate, dueDate) || format(paymentDate, 'yyyy-MM-dd') === format(dueDate, 'yyyy-MM-dd');
  }).length;
  
  const punctuality = paidPayments.length > 0
    ? Math.round((paidOnTime / paidPayments.length) * 100)
    : 0;
    
  const overdueCount = payments.filter(p => p.status === 'overdue').length;
  const pendingCount = payments.filter(p => p.status === 'pending').length;
  
  // Status Badge
  const isActive = tenantInfo?.contract_end 
    ? new Date(tenantInfo.contract_end) > new Date()
    : true;

  return (
    <Card 
      className="p-4 sm:p-6 hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onNavigateToPayments}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold">{house.name}</h3>
          <p className="text-sm text-muted-foreground">{house.address}</p>
        </div>
        <Badge variant={isActive ? "default" : "secondary"}>
          {isActive ? "✓ Aktiv" : "Beendet"}
        </Badge>
      </div>

      {/* Timeline */}
      <div className="mb-4">
        <MonthlyPaymentTimeline 
          payments={payments}
          selectedYear={selectedYear}
        />
      </div>

      {/* Status-Zusammenfassung */}
      <div className="mb-4 text-sm space-y-1">
        <p className="text-green-600">
          ✓ {paidPayments.length}/12 Zahlungen eingegangen
        </p>
        {overdueCount > 0 && (
          <p className="text-red-600">
            • {overdueCount} Zahlung{overdueCount > 1 ? 'en' : ''} überfällig
          </p>
        )}
        {pendingCount > 0 && (
          <p className="text-muted-foreground">
            • {pendingCount} Zahlung{pendingCount > 1 ? 'en' : ''} steht aus
          </p>
        )}
      </div>

      {/* Metriken */}
      <div className="space-y-2 sm:space-y-3 mb-4 pb-4 border-b">
        <div className="flex justify-between items-center">
          <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 sm:gap-2">
            <Euro className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            <span className="hidden sm:inline">Jahreseinnahmen</span>
            <span className="sm:hidden">Einnahmen</span>
            {selectedYear}
          </span>
          <span className="font-semibold text-sm sm:text-base">
            {yearRevenue.toLocaleString('de-DE')} €
            <span className="text-xs text-muted-foreground ml-1">
              ({paidPayments.length}/12)
            </span>
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 sm:gap-2">
            <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
            Pünktlichkeit
          </span>
          <span className={`font-semibold text-sm sm:text-base ${punctuality >= 90 ? 'text-green-600' : 'text-orange-600'}`}>
            {punctuality}%
            <span className="text-xs text-muted-foreground ml-1">
              ({paidOnTime}/{paidPayments.length})
            </span>
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs sm:text-sm text-muted-foreground">
            <span className="hidden sm:inline">Monatliche Miete</span>
            <span className="sm:hidden">Miete/Monat</span>
          </span>
          <span className="font-medium text-sm sm:text-base">
            {tenantInfo?.monthly_rent?.toLocaleString('de-DE') || 0} €
          </span>
        </div>

        {tenantInfo?.contract_end && (
          <div className="flex justify-between items-center">
            <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 sm:gap-2">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              Vertrag bis
            </span>
            <span className="font-medium text-sm sm:text-base">
              {format(new Date(tenantInfo.contract_end), 'dd.MM.yyyy', { locale: de })}
            </span>
          </div>
        )}
      </div>

      {/* Button */}
      <Button 
        variant="outline" 
        className="w-full"
        onClick={(e) => {
          e.stopPropagation();
          onNavigateToPayments?.();
        }}
      >
        Zahlungen verwalten
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </Card>
  );
};

export default ObjectPerformanceCard;
