import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePricingConfig, calculateFinalPrice } from '@/hooks/usePricingConfig';

interface PricingConfigTabProps {
  houseId: string;
}

const PricingConfigTab = ({ houseId }: PricingConfigTabProps) => {
  const { config, fees, isLoading, saveConfig, isSaving } = usePricingConfig(houseId);
  
  const [markupPercentage, setMarkupPercentage] = useState(config.markup_percentage);
  const [standardGuests, setStandardGuests] = useState(config.standard_guests);

  useEffect(() => {
    setMarkupPercentage(config.markup_percentage);
    setStandardGuests(config.standard_guests);
  }, [config]);

  const handleSave = () => {
    saveConfig({
      markup_percentage: markupPercentage,
      standard_guests: standardGuests,
    });
  };

  // Beispielberechnung
  const exampleBasePrice = 1400;
  const calculation = calculateFinalPrice(
    exampleBasePrice,
    fees,
    markupPercentage,
    standardGuests,
    7
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
          <CardTitle>Preisaufschlag-Konfiguration</CardTitle>
          <CardDescription>
            Definieren Sie den prozentualen Aufschlag auf Ihren Basispreis + Nebenkosten
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="markup">Aufschlag-Prozentsatz (%)</Label>
              <Input
                id="markup"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={markupPercentage}
                onChange={(e) => setMarkupPercentage(parseFloat(e.target.value) || 0)}
              />
              <p className="text-sm text-muted-foreground">
                Dieser Aufschlag wird auf den Basispreis + Nebenkosten addiert (vor MwSt)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="guests">Standard-Gästezahl</Label>
              <Input
                id="guests"
                type="number"
                min="1"
                max="20"
                value={standardGuests}
                onChange={(e) => setStandardGuests(parseInt(e.target.value) || 6)}
              />
              <p className="text-sm text-muted-foreground">
                Wird für Kurtaxe-Berechnung verwendet
              </p>
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
            Für einen Basispreis von €{exampleBasePrice} (7 Nächte, {standardGuests} Gäste)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm">Basispreis (7 Nächte)</span>
              <span className="font-medium">€{calculation.basePrice.toFixed(2)}</span>
            </div>

            <div className="pl-4 space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>+ Service-Gebühr</span>
                <span>€{calculation.breakdown.serviceFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>+ Kurtaxe (7 Nächte × {standardGuests} Gäste)</span>
                <span>€{calculation.breakdown.touristTax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>+ Reinigung</span>
                <span>€{calculation.breakdown.cleaning.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>+ Strom</span>
                <span>€{calculation.breakdown.electricity.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>+ Wäsche</span>
                <span>€{calculation.breakdown.linen.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center py-2 border-t">
              <span className="text-sm font-medium">Zwischensumme</span>
              <span className="font-medium">€{calculation.subtotal.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-sm">+ Aufschlag ({markupPercentage}%)</span>
              <span className="font-medium text-primary">€{calculation.markup.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center py-2 border-t">
              <span className="text-sm">Netto-Gesamtpreis</span>
              <span className="font-medium">€{calculation.nettoTotal.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-sm">+ MwSt ({fees.vat_percentage}%)</span>
              <span className="font-medium">€{calculation.vat.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center py-3 border-t-2 border-primary/20">
              <span className="font-bold">Endpreis für Gast</span>
              <span className="font-bold text-lg text-primary">€{calculation.finalPrice.toFixed(2)}</span>
            </div>
          </div>

          <Alert className="mt-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Dieser Endpreis wird bei der monatlichen Preiskalkulation automatisch berechnet
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default PricingConfigTab;
