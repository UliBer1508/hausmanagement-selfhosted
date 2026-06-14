import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  usePricingConfig,
  AdditionalFeesV2,
  FeeMode,
  calcFeeItem,
} from '@/hooks/usePricingConfig';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AdditionalFeesTabProps {
  houseId: string;
}

const DEFAULT_V2: AdditionalFeesV2 = {
  service_fee: { mode: 'flat', amount: 0 },
  tourist_tax: { mode: 'per_person', amount: 2.5 },
  cleaning_fee: { mode: 'flat', amount: 80 },
  electricity_fee: { mode: 'flat', amount: 40 },
  linen_fee: { mode: 'flat', amount: 30 },
  vat_percentage: 19,
};

type FeeKey = Exclude<keyof AdditionalFeesV2, 'vat_percentage'>;

const FEE_FIELDS: { key: FeeKey; label: string; touristTax?: boolean }[] = [
  { key: 'service_fee', label: 'Service-Gebühr' },
  { key: 'tourist_tax', label: 'Kurtaxe', touristTax: true },
  { key: 'cleaning_fee', label: 'Reinigungsgebühr' },
  { key: 'electricity_fee', label: 'Stromkosten' },
  { key: 'linen_fee', label: 'Wäschekosten' },
];

const AdditionalFeesTab = ({ houseId }: AdditionalFeesTabProps) => {
  const { feesV2, isLoading, saveFees, isSaving } = usePricingConfig(houseId);

  const [localFees, setLocalFees] = useState<AdditionalFeesV2>(DEFAULT_V2);
  const initializedRef = useRef(false);

  // Only initialize local state once from the server, so React Query refetches
  // (e.g. on window focus) don't overwrite in-progress edits.
  useEffect(() => {
    if (feesV2 && !initializedRef.current) {
      setLocalFees(feesV2);
      initializedRef.current = true;
    }
  }, [feesV2]);

  // Reset when switching to a different house.
  useEffect(() => {
    initializedRef.current = false;
  }, [houseId]);

  const updateItem = (key: FeeKey, patch: Partial<{ mode: FeeMode; amount: number }>) => {
    setLocalFees((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  const handleSave = () => {
    saveFees(localFees);
  };

  // Beispielberechnung für 7 Nächte, 6 Personen
  const exampleBooking = { nights: 7, guests: 6 };
  const calcForGuests = (guests: number) =>
    FEE_FIELDS.reduce(
      (sum, f) =>
        sum +
        calcFeeItem(localFees[f.key], { guests, nights: exampleBooking.nights }, !!f.touristTax),
      0,
    );
  const totalCosts = calcForGuests(exampleBooking.guests);
  const extraPerPerson = calcForGuests(exampleBooking.guests + 1) - totalCosts;

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
            Definieren Sie pro Posten den Betrag und ob er pauschal pro Aufenthalt
            oder pro Person berechnet wird.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {FEE_FIELDS.map((f) => {
              const item = localFees[f.key];
              const unitHint =
                item.mode === 'per_person'
                  ? f.touristTax
                    ? '€ pro Person & Nacht'
                    : '€ pro Person'
                  : '€ pro Aufenthalt';
              return (
                <div
                  key={f.key}
                  className="grid grid-cols-1 md:grid-cols-[1fr_160px_180px] gap-3 md:items-end border rounded-md p-3"
                >
                  <div className="space-y-1">
                    <Label htmlFor={f.key}>{f.label}</Label>
                    <p className="text-xs text-muted-foreground">{unitHint}</p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={f.key} className="text-xs">Betrag (€)</Label>
                    <Input
                      id={f.key}
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.amount}
                      onChange={(e) =>
                        updateItem(f.key, {
                          amount: Math.round((parseFloat(e.target.value) || 0) * 100) / 100,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Berechnung</Label>
                    <Select
                      value={item.mode}
                      onValueChange={(v) => updateItem(f.key, { mode: v as FeeMode })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">Pauschale</SelectItem>
                        <SelectItem value="per_person">pro Person</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="vat">MwSt-Satz (%)</Label>
                <Input
                  id="vat"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={localFees.vat_percentage}
                  onChange={(e) =>
                    setLocalFees({
                      ...localFees,
                      vat_percentage:
                        Math.round((parseFloat(e.target.value) || 0) * 100) / 100,
                    })
                  }
                />
              </div>
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
            {FEE_FIELDS.map((f) => {
              const item = localFees[f.key];
              const value = calcFeeItem(
                item,
                { guests: exampleBooking.guests, nights: exampleBooking.nights },
                !!f.touristTax,
              );
              const detail =
                item.mode === 'per_person'
                  ? f.touristTax
                    ? ` (${item.amount.toFixed(2)} × ${exampleBooking.guests} P. × ${exampleBooking.nights} N.)`
                    : ` (${item.amount.toFixed(2)} × ${exampleBooking.guests} P.)`
                  : '';
              return (
                <div key={f.key} className="flex justify-between">
                  <span>
                    {f.label}
                    <span className="text-muted-foreground">{detail}</span>
                  </span>
                  <span>€{value.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="flex justify-between pt-2 border-t-2 font-bold text-primary">
              <span>Gesamte Nebenkosten:</span>
              <span>€{totalCosts.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Mehrkosten je zusätzlicher Person (bei {exampleBooking.nights} Nächten):</span>
              <span>€{extraPerPerson.toFixed(2)}</span>
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
