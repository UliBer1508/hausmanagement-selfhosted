import { Card } from "@/components/ui/card";
import { Home, CheckCircle2, Euro, AlertCircle } from "lucide-react";
import { House } from "@/types";

interface TenantStatsProps {
  rentals: House[];
}

const TenantStats = ({ rentals }: TenantStatsProps) => {
  const today = new Date();
  
  const activeContracts = rentals.filter(house => {
    const tenantInfo = house.tenant_info as any;
    if (!tenantInfo?.contract_end) return true;
    return new Date(tenantInfo.contract_end) > today;
  }).length;

  const totalMonthlyRent = rentals.reduce((sum, house) => {
    const tenantInfo = house.tenant_info as any;
    return sum + (tenantInfo?.monthly_rent || 0);
  }, 0);

  const expiringContracts = rentals.filter(house => {
    const tenantInfo = house.tenant_info as any;
    if (!tenantInfo?.contract_end) return false;
    const endDate = new Date(tenantInfo.contract_end);
    const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry > 0 && daysUntilExpiry <= 60;
  }).length;

  const stats = [
    {
      title: "Festvermietungen",
      value: rentals.length,
      icon: Home,
      color: "text-blue-600",
      bgColor: "bg-blue-100"
    },
    {
      title: "Aktive Verträge",
      value: activeContracts,
      icon: CheckCircle2,
      color: "text-green-600",
      bgColor: "bg-green-100"
    },
    {
      title: "Monatliche Einnahmen",
      value: `${totalMonthlyRent.toLocaleString('de-DE')} €`,
      icon: Euro,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100"
    },
    {
      title: "Läuft bald aus",
      value: expiringContracts,
      icon: AlertCircle,
      color: "text-orange-600",
      bgColor: "bg-orange-100"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{stat.title}</p>
              <p className="text-2xl font-bold mt-1">{stat.value}</p>
            </div>
            <div className={`p-3 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-6 w-6 ${stat.color}`} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default TenantStats;
