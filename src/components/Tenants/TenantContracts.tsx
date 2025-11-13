import { useState } from "react";
import { useHouses } from "@/hooks/useHouses";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Edit, Euro, Calendar, CreditCard, FileText } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { House } from "@/types";
import EditHouseDialog from "@/components/Houses/EditHouseDialog";

const TenantContracts = () => {
  const { data: houses } = useHouses();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [houseFilter, setHouseFilter] = useState("all");
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const longTermRentals = houses?.filter(h => 
    h.rental_type === 'long_term' && h.tenant_info
  ) || [];

  const getContractStatus = (house: House) => {
    const tenantInfo = house.tenant_info as any;
    if (!tenantInfo?.contract_end) return 'active';
    
    const today = new Date();
    const endDate = new Date(tenantInfo.contract_end);
    const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) return 'expired';
    if (daysUntilExpiry <= 60) return 'expiring';
    return 'active';
  };

  const filteredRentals = longTermRentals.filter(house => {
    const tenantInfo = house.tenant_info as any;
    const matchesSearch = tenantInfo?.tenant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         house.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || getContractStatus(house) === statusFilter;
    const matchesHouse = houseFilter === 'all' || house.id === houseFilter;
    
    return matchesSearch && matchesStatus && matchesHouse;
  });

  const handleEdit = (house: House) => {
    setSelectedHouse(house);
    setIsEditDialogOpen(true);
  };

  const getPaymentMethodLabel = (method?: string) => {
    switch (method) {
      case 'bank_transfer': return 'Überweisung';
      case 'cash': return 'Bar';
      case 'direct_debit': return 'Lastschrift';
      default: return '-';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Nach Mieter oder Objekt suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="expiring">Läuft bald aus</SelectItem>
            <SelectItem value="expired">Abgelaufen</SelectItem>
          </SelectContent>
        </Select>

        <Select value={houseFilter} onValueChange={setHouseFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Objekt" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Objekte</SelectItem>
            {longTermRentals.map(house => (
              <SelectItem key={house.id} value={house.id}>
                {house.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredRentals.map(house => {
          const tenantInfo = house.tenant_info as any;
          const status = getContractStatus(house);
          
          return (
            <Card key={house.id} className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{house.name}</h3>
                  <p className="text-sm text-muted-foreground">{tenantInfo?.tenant_name}</p>
                </div>
                <Badge variant={
                  status === 'active' ? 'default' : 
                  status === 'expiring' ? 'secondary' : 
                  'destructive'
                }>
                  {status === 'active' ? 'Aktiv' : 
                   status === 'expiring' ? 'Läuft bald aus' : 
                   'Abgelaufen'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Vertragslaufzeit</p>
                    <p className="text-sm text-muted-foreground">
                      {tenantInfo?.contract_start ? format(new Date(tenantInfo.contract_start), 'dd.MM.yyyy', { locale: de }) : '-'}
                      {' - '}
                      {tenantInfo?.contract_end ? format(new Date(tenantInfo.contract_end), 'dd.MM.yyyy', { locale: de }) : 'Unbefristet'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Euro className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Monatliche Miete</p>
                    <p className="text-sm text-muted-foreground">
                      {tenantInfo?.monthly_rent ? `${tenantInfo.monthly_rent.toLocaleString('de-DE')} €` : '-'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Kaution</p>
                    <p className="text-sm text-muted-foreground">
                      {tenantInfo?.deposit_amount ? `${tenantInfo.deposit_amount.toLocaleString('de-DE')} €` : '-'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Zahlungsweise</p>
                    <p className="text-sm text-muted-foreground">
                      {getPaymentMethodLabel(tenantInfo?.payment_method)}
                      {tenantInfo?.payment_day && ` (${tenantInfo.payment_day}. des Monats)`}
                    </p>
                  </div>
                </div>
              </div>

              {tenantInfo?.notes && (
                <div className="mb-4 p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium mb-1">Notizen</p>
                  <p className="text-sm text-muted-foreground">{tenantInfo.notes}</p>
                </div>
              )}

              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleEdit(house)}
              >
                <Edit className="h-4 w-4 mr-1" />
                Details bearbeiten
              </Button>
            </Card>
          );
        })}
      </div>

      {selectedHouse && (
        <EditHouseDialog
          house={selectedHouse}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
        />
      )}
    </div>
  );
};

export default TenantContracts;
