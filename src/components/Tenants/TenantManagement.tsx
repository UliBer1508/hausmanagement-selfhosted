import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import TenantOverview from "./TenantOverview";
import TenantContracts from "./TenantContracts";
import TenantPayments from "./TenantPayments";
import TenantAnalytics from "./TenantAnalytics";
import UtilityCostsPanel from "./UtilityCostsPanel";
import RentalInquiries from "./RentalInquiries";
import { useRentalInquiries, useRentalOffers } from "@/hooks/useRentalInquiries";
import { useHouses } from "@/hooks/useHouses";
import { toast } from "sonner";
import { todayISO } from '@/lib/dateHelpers';

const TenantManagement = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const { data: houses } = useHouses();
  const location = useLocation();
  // Sprung aus dem Hinweis-Banner der Übersicht direkt zu den Interessenten
  useEffect(() => {
    const sub = (location.state as { tenantSubTab?: string } | null)?.tenantSubTab;
    if (sub) setActiveTab(sub);
  }, [location.state]);
  const { data: mietanfragen = [] } = useRentalInquiries();
  const { data: mietangebote = [] } = useRentalOffers();
  const offeneInteressenten =
    mietanfragen.filter(a => a.status === 'new').length +
    mietangebote.filter(o => ['accepted', 'question'].includes(o.status) && !o.response_seen_at).length;
  
  const longTermRentals = houses?.filter(h => 
    h.rental_type === 'long_term' && h.tenant_info
  ) || [];

  const handleExport = () => {
    const csvData = longTermRentals.map(house => ({
      Objekt: house.name,
      Adresse: house.address,
      Mieter: (house.tenant_info as any)?.tenant_name || '',
      Email: (house.tenant_info as any)?.tenant_email || '',
      Telefon: (house.tenant_info as any)?.tenant_phone || '',
      Vertragsbeginn: (house.tenant_info as any)?.contract_start || '',
      Vertragsende: (house.tenant_info as any)?.contract_end || 'Unbefristet',
      Miete: (house.tenant_info as any)?.monthly_rent || '',
      Kaution: (house.tenant_info as any)?.deposit_amount || '',
    }));

    const csv = [
      Object.keys(csvData[0] || {}).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mietvertraege-${todayISO()}.csv`;
    a.click();
    toast.success('Export erfolgreich');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Mieter-Verwaltung</h1>
          <p className="text-muted-foreground mt-1">
            Verwaltung von Festvermietungen und Mietverträgen
          </p>
        </div>
        <Button onClick={handleExport} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Exportieren
        </Button>
      </div>

      <Card className="p-3 sm:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 w-full justify-center sm:grid sm:grid-cols-6">
            <TabsTrigger value="overview">Übersicht</TabsTrigger>
            <TabsTrigger value="contracts">Verträge</TabsTrigger>
            <TabsTrigger value="payments">
              <span className="hidden sm:inline">Zahlungen</span>
              <span className="sm:hidden">Zahlung.</span>
            </TabsTrigger>
            <TabsTrigger value="utilities">
              <span className="hidden sm:inline">NK-Abrechnung</span>
              <span className="sm:hidden">NK-Abr.</span>
            </TabsTrigger>
            <TabsTrigger value="analytics">Analyse</TabsTrigger>
            <TabsTrigger value="interessenten">
              Interessenten{offeneInteressenten > 0 ? ` (${offeneInteressenten})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <TenantOverview onNavigateToPayments={() => setActiveTab("payments")} />
          </TabsContent>

          <TabsContent value="contracts" className="space-y-6">
            <TenantContracts />
          </TabsContent>

          <TabsContent value="payments" className="space-y-6">
            <TenantPayments />
          </TabsContent>

          <TabsContent value="utilities" className="space-y-6">
            <UtilityCostsPanel />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <TenantAnalytics />
          </TabsContent>

          <TabsContent value="interessenten" className="space-y-6">
            <RentalInquiries />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};

export default TenantManagement;
