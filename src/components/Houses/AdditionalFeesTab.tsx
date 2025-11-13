import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePricingConfig } from '@/hooks/usePricingConfig';

interface AdditionalFeesTabProps {
  houseId: string;
}

const AdditionalFeesTab = ({ houseId }: AdditionalFeesTabProps) => {
  const { fees, isLoading, saveFees, isSaving } = usePricingConfig(houseId);
  
  const [localFees, setLocalFees] = useState({
    service_fee_per_stay: 0,
    tourist_tax_per_night: 2.50,
    cleaning_fee_per_stay: 80,
    electricity_fee_per_stay: 40,
    linen_fee_per_stay: 30,
    vat_percentage: 19
  });

  useEffect(() => {
    if (fees) {
      setLocalFees(fees);
    }
  }, [fees]);

  const handleSave = () => {
    saveFees(localFees);
  };

  // Beispielberechnung für 7 Nächte, 6 Personen
  const exampleBooking = { nights: 7, guests: 6 };
  const totalCosts = (
    localFees.service_fee_per_stay +
    localFees.tourist_tax_per_night * exampleBooking.nights * exampleBooking.guests +
    localFees.cleaning_fee_per_stay +
    localFees.electricity_fee_per_stay +
    localFees.linen_fee_per_stay
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Nebenkosten-Konfiguration</CardTitle>
          <CardDescription>
            Definieren Sie die Nebenkosten, die zu Ihrem Basispreis addiert werden
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="service">Service-Gebühr pro Aufenthalt (€)</Label>
              <Input
                id="service"
                type="number"
                step="0.01"
                min="0"
                value={localFees.service_fee_per_stay}
                onChange={(e) => setLocalFees({ ...localFees, service_fee_per_stay: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tourist-tax">Kurtaxe pro Nacht/Person (€)</Label>
              <Input
                id="tourist-tax"
                type="number"
                step="0.01"
                min="0"
                value={localFees.tourist_tax_per_night}
                onChange={(e) => setLocalFees({ ...localFees, tourist_tax_per_night: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cleaning">Reinigungsgebühr pro Aufenthalt (€)</Label>
              <Input
                id="cleaning"
                type="number"
                step="0.01"
                min="0"
                value={localFees.cleaning_fee_per_stay}
                onChange={(e) => setLocalFees({ ...localFees, cleaning_fee_per_stay: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="electricity">Stromkosten pro Aufenthalt (€)</Label>
              <Input
                id="electricity"
                type="number"
                step="0.01"
                min="0"
                value={localFees.electricity_fee_per_stay}
                onChange={(e) => setLocalFees({ ...localFees, electricity_fee_per_stay: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linen">Wäschekosten pro Aufenthalt (€)</Label>
              <Input
                id="linen"
                type="number"
                step="0.01"
                min="0"
                value={localFees.linen_fee_per_stay}
                onChange={(e) => setLocalFees({ ...localFees, linen_fee_per_stay: parseFloat(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vat">MwSt-Satz (%)</Label>
              <Input
                id="vat"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={localFees.vat_percentage}
                onChange={(e) => setLocalFees({ ...localFees, vat_percentage: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="w-full md:w-auto"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </CardContent>
      </Card>

      {/* Beispielberechnung */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Beispielberechnung</CardTitle>
          <CardDescription>
            Für eine typische Buchung (7 Nächte, 6 Personen)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Service-Gebühr:</span>
              <span>€{localFees.service_fee_per_stay.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Kurtaxe (7 Nächte × 6 Personen):</span>
              <span>€{(localFees.tourist_tax_per_night * 7 * 6).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Reinigung:</span>
              <span>€{localFees.cleaning_fee_per_stay.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Strom:</span>
              <span>€{localFees.electricity_fee_per_stay.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Wäsche:</span>
              <span>€{localFees.linen_fee_per_stay.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t-2 font-bold text-primary">
              <span>Gesamte Nebenkosten:</span>
              <span>€{totalCosts.toFixed(2)}</span>
            </div>
          </div>

          <Alert className="mt-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Diese Nebenkosten werden zu Ihrem Basispreis addiert. Markup und MwSt werden anschließend im Preisaufschlag-Tab berechnet.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdditionalFeesTab;
