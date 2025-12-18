import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import TenantOverview from "./TenantOverview";
import TenantContracts from "./TenantContracts";
import TenantPayments from "./TenantPayments";
import TenantAnalytics from "./TenantAnalytics";
import UtilityCostSettings from "./UtilityCostSettings";
import UtilityCostEntry from "./UtilityCostEntry";
import UtilityStatementGenerator from "./UtilityStatementGenerator";
import { useHouses } from "@/hooks/useHouses";
import { toast } from "sonner";

const TenantManagement = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const { data: houses } = useHouses();
  
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
    a.download = `mietvertraege-${new Date().toISOString().split('T')[0]}.csv`;
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
          <TabsList className="flex flex-wrap h-auto gap-1 w-full justify-center sm:grid sm:grid-cols-5">
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
            <Tabs defaultValue="settings" className="space-y-4">
              <TabsList>
                <TabsTrigger value="settings">Einstellungen</TabsTrigger>
                <TabsTrigger value="costs">Kosten erfassen</TabsTrigger>
                <TabsTrigger value="statement">Abrechnung</TabsTrigger>
              </TabsList>
              <TabsContent value="settings">
                <UtilityCostSettings />
              </TabsContent>
              <TabsContent value="costs">
                <UtilityCostEntry />
              </TabsContent>
              <TabsContent value="statement">
                <UtilityStatementGenerator />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <TenantAnalytics />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};

export default TenantManagement;
