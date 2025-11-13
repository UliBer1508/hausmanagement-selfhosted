import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import TenantOverview from "./TenantOverview";
import TenantContracts from "./TenantContracts";
import TenantPayments from "./TenantPayments";
import TenantAnalytics from "./TenantAnalytics";
import { useHouses } from "@/hooks/useHouses";
import { toast } from "sonner";

const TenantManagement = () => {
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

      <Card className="p-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Übersicht</TabsTrigger>
            <TabsTrigger value="contracts">Verträge</TabsTrigger>
            <TabsTrigger value="payments">Zahlungen</TabsTrigger>
            <TabsTrigger value="analytics">Analyse</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <TenantOverview />
          </TabsContent>

          <TabsContent value="contracts" className="space-y-6">
            <TenantContracts />
          </TabsContent>

          <TabsContent value="payments" className="space-y-6">
            <TenantPayments />
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
