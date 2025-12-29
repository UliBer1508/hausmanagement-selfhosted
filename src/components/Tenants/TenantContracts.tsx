import { useState } from "react";
import { useHouses } from "@/hooks/useHouses";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Edit, Euro, Calendar, CreditCard, FileText, Mail, Phone, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { House } from "@/types";
import EditHouseDialog from "@/components/Houses/EditHouseDialog";
import { RentHistoryDialog } from "./RentHistoryDialog";
import { useTenantRentChanges, getActiveRent, getActiveAdditionalCosts, getPendingRentChanges } from "@/hooks/useTenantRentChanges";

const TenantContracts = () => {
  const { data: houses } = useHouses();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [houseFilter, setHouseFilter] = useState("all");
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [rentHistoryHouse, setRentHistoryHouse] = useState<House | null>(null);

  const longTermRentals = houses?.filter(h => 
    h.rental_type === 'long_term' && h.tenant_info
  ) || [];

  // Fetch rent changes for all long-term rentals
  const { data: allRentChanges = [] } = useTenantRentChanges();

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

  const getRentChangesForHouse = (houseId: string) => {
    return allRentChanges.filter(rc => rc.house_id === houseId);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
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
          const houseRentChanges = getRentChangesForHouse(house.id);
          const baseMonthlyRent = tenantInfo?.monthly_rent || 0;
          const baseAdditionalCosts = tenantInfo?.additional_costs || 0;
          const currentRent = getActiveRent(houseRentChanges, baseMonthlyRent);
          const currentAdditionalCosts = getActiveAdditionalCosts(houseRentChanges, baseAdditionalCosts);
          const currentWarmmiete = currentRent + currentAdditionalCosts;
          const pendingChanges = getPendingRentChanges(houseRentChanges);
          const nextChange = pendingChanges[0];
          
          return (
            <Card key={house.id} className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{house.name}</h3>
                  <p className="text-sm text-muted-foreground">{house.address}</p>
                </div>
                <div className="flex items-center gap-2">
                  {nextChange && (
                    <Badge variant="outline" className="text-amber-600 border-amber-400">
                      ⏰ Änderung geplant
                    </Badge>
                  )}
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
              </div>

              <div className="mb-3">
                <p className="text-sm font-medium">Mieter</p>
                <p className="text-sm text-muted-foreground">{tenantInfo?.tenant_name || '-'}</p>
              </div>

              {tenantInfo?.tenant_email && (
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={`mailto:${tenantInfo.tenant_email}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {tenantInfo.tenant_email}
                  </a>
                </div>
              )}

              {tenantInfo?.tenant_phone && (
                <div className="flex items-center gap-2 mb-4">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={`tel:${tenantInfo.tenant_phone}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {tenantInfo.tenant_phone}
                  </a>
                </div>
              )}

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
                    <p className="text-sm font-medium">Miete</p>
                    <div className="text-sm text-muted-foreground space-y-0.5">
                      <div>Kaltmiete: {formatCurrency(currentRent)}</div>
                      <div>Nebenkosten: {formatCurrency(currentAdditionalCosts)}</div>
                      <div className="font-semibold text-foreground">Warmmiete: {formatCurrency(currentWarmmiete)}</div>
                    </div>
                    {nextChange && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⏰ Ab {format(parseISO(nextChange.effective_date), 'dd.MM.yyyy', { locale: de })}: 
                        {' '}Warmmiete {formatCurrency(nextChange.new_rent)}
                        {' '}(Kaltmiete {formatCurrency(nextChange.new_rent - (nextChange.new_additional_costs || 0))}
                        {nextChange.new_additional_costs !== null && nextChange.new_additional_costs !== undefined && (
                          <>, NK {formatCurrency(nextChange.new_additional_costs)}</>
                        )})
                      </p>
                    )}
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

              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleEdit(house)}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Details bearbeiten
                </Button>

                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setRentHistoryHouse(house)}
                >
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Miethistorie
                </Button>
                
                {tenantInfo?.tenant_email && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.href = `mailto:${tenantInfo.tenant_email}`}
                  >
                    <Mail className="h-4 w-4 mr-1" />
                    Email
                  </Button>
                )}
              </div>
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

      {rentHistoryHouse && (
        <RentHistoryDialog
          house={rentHistoryHouse}
          open={!!rentHistoryHouse}
          onOpenChange={(open) => !open && setRentHistoryHouse(null)}
        />
      )}
    </div>
  );
};

export default TenantContracts;