import { useHouses } from "@/hooks/useHouses";
import TenantStats from "./TenantStats";
import TenantCard from "./TenantCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

const TenantOverview = () => {
  const { data: houses, isLoading } = useHouses();
  
  const longTermRentals = houses?.filter(h => 
    h.rental_type === 'long_term' && h.tenant_info
  ) || [];

  if (isLoading) {
    return <div>Lade Mieter-Daten...</div>;
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

  return (
    <div className="space-y-6">
      <TenantStats rentals={longTermRentals} />

      <div>
        <h2 className="text-lg font-semibold mb-4">Alle Mietverträge</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {longTermRentals.map(house => (
            <TenantCard key={house.id} house={house} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TenantOverview;
