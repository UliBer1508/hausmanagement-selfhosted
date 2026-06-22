import { ClickableCard } from "@/components/ui/clickable-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { House } from "@/types";
import { Mail, Phone, Calendar } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import EditHouseDialog from "@/components/Houses/EditHouseDialog";
import { useState } from "react";
import { buildMailtoHref } from "@/lib/mailtoHelper";

interface TenantCardProps {
  house: House;
}

const TenantCard = ({ house }: TenantCardProps) => {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const tenantInfo = house.tenant_info as any;
  const today = new Date();
  
  const getContractStatus = () => {
    if (!tenantInfo?.contract_end) {
      return { label: 'Aktiv', variant: 'default' as const };
    }
    
    const endDate = new Date(tenantInfo.contract_end);
    const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry < 0) {
      return { label: 'Abgelaufen', variant: 'destructive' as const };
    } else if (daysUntilExpiry <= 60) {
      return { label: 'Läuft bald aus', variant: 'secondary' as const };
    }
    return { label: 'Aktiv', variant: 'default' as const };
  };

  const status = getContractStatus();

  const handleEmailClick = () => {
    window.open(
      buildMailtoHref({ to: tenantInfo?.tenant_email ?? '' }),
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <>
      <ClickableCard
        onActivate={() => setIsEditDialogOpen(true)}
        className="p-6 hover:shadow-lg"
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{house.name}</h3>
            <p className="text-sm text-muted-foreground">{house.address}</p>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Mieter</p>
            <p className="text-sm text-muted-foreground">{tenantInfo?.tenant_name || '-'}</p>
          </div>

          {tenantInfo?.tenant_email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a 
                href={buildMailtoHref({ to: tenantInfo.tenant_email })}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                {tenantInfo.tenant_email}
              </a>
            </div>
          )}

          {tenantInfo?.tenant_phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a 
                href={`tel:${tenantInfo.tenant_phone}`}
                className="text-sm text-primary hover:underline"
              >
                {tenantInfo.tenant_phone}
              </a>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {tenantInfo?.contract_start ? format(new Date(tenantInfo.contract_start), 'dd.MM.yyyy', { locale: de }) : '-'} 
              {' - '}
              {tenantInfo?.contract_end ? format(new Date(tenantInfo.contract_end), 'dd.MM.yyyy', { locale: de }) : 'Unbefristet'}
            </p>
          </div>

          <div className="pt-3 border-t">
            <p className="text-lg font-semibold text-foreground">
              {tenantInfo?.monthly_rent ? `${tenantInfo.monthly_rent.toLocaleString('de-DE')} € / Monat` : '-'}
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              handleEmailClick();
            }}
          >
            <Mail className="h-4 w-4 mr-1" />
            Email
          </Button>
        </div>
      </ClickableCard>

      <EditHouseDialog
        house={house}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
    </>
  );
};

export default TenantCard;
