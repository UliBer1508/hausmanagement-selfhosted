import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { useAdditionalFees, calculateAdditionalFees } from '@/hooks/useAdditionalFees';

interface AdditionalFeesTabProps {
  houseId: string;
}

const AdditionalFeesTab = ({ houseId }: AdditionalFeesTabProps) => {
  const { fees, isLoading, saveFees, isSaving } = useAdditionalFees(houseId);
  
  const [bookingCom, setBookingCom] = useState(fees.booking_com);
  const [airbnb, setAirbnb] = useState(fees.airbnb);

  useEffect(() => {
    if (fees) {
      setBookingCom(fees.booking_com);
      setAirbnb(fees.airbnb);
    }
  }, [fees]);

  const handleCopyToAirbnb = () => {
    setAirbnb(bookingCom);
  };

  const handleSave = () => {
    saveFees({
      booking_com: bookingCom,
      airbnb: airbnb,
    });
  };

  if (isLoading) {
    return <div className="text-center py-8">Laden...</div>;
  }

  // Beispielrechnung: 7 Nächte, 4 Personen
  const exampleBooking = { nights: 7, guests: 4 };
  const bookingComTotal = calculateAdditionalFees(bookingCom, exampleBooking);
  const airbnbTotal = calculateAdditionalFees(airbnb, exampleBooking);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Booking.com Spalte */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🏨 Booking.com
            </CardTitle>
            <CardDescription>Nebenkosten für Booking.com-Buchungen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bc-service">Servicegebühr (pro Aufenthalt)</Label>
              <div className="flex gap-2">
                <Input
                  id="bc-service"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bookingCom.service_fee_per_stay}
                  onChange={(e) => setBookingCom({
                    ...bookingCom,
                    service_fee_per_stay: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">EUR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bc-tourist">Kurtaxe (pro Person/Nacht)</Label>
              <div className="flex gap-2">
                <Input
                  id="bc-tourist"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bookingCom.tourist_tax_per_night}
                  onChange={(e) => setBookingCom({
                    ...bookingCom,
                    tourist_tax_per_night: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">EUR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bc-cleaning">Reinigungsgebühr (pro Aufenthalt)</Label>
              <div className="flex gap-2">
                <Input
                  id="bc-cleaning"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bookingCom.cleaning_fee_per_stay}
                  onChange={(e) => setBookingCom({
                    ...bookingCom,
                    cleaning_fee_per_stay: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">EUR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bc-electricity">Stromkosten (pro Aufenthalt)</Label>
              <div className="flex gap-2">
                <Input
                  id="bc-electricity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bookingCom.electricity_fee_per_stay}
                  onChange={(e) => setBookingCom({
                    ...bookingCom,
                    electricity_fee_per_stay: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">EUR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bc-linen">Bettwäsche (pro Aufenthalt)</Label>
              <div className="flex gap-2">
                <Input
                  id="bc-linen"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bookingCom.linen_fee_per_stay}
                  onChange={(e) => setBookingCom({
                    ...bookingCom,
                    linen_fee_per_stay: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">EUR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bc-vat">Mehrwertsteuer</Label>
              <div className="flex gap-2">
                <Input
                  id="bc-vat"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={bookingCom.vat_percentage}
                  onChange={(e) => setBookingCom({
                    ...bookingCom,
                    vat_percentage: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Airbnb Spalte */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  🏠 Airbnb
                </CardTitle>
                <CardDescription>Nebenkosten für Airbnb-Buchungen</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyToAirbnb}
                className="gap-2"
              >
                <Copy className="w-4 h-4" />
                Von Booking.com kopieren
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ab-service">Servicegebühr (pro Aufenthalt)</Label>
              <div className="flex gap-2">
                <Input
                  id="ab-service"
                  type="number"
                  step="0.01"
                  min="0"
                  value={airbnb.service_fee_per_stay}
                  onChange={(e) => setAirbnb({
                    ...airbnb,
                    service_fee_per_stay: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">EUR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ab-tourist">Kurtaxe (pro Person/Nacht)</Label>
              <div className="flex gap-2">
                <Input
                  id="ab-tourist"
                  type="number"
                  step="0.01"
                  min="0"
                  value={airbnb.tourist_tax_per_night}
                  onChange={(e) => setAirbnb({
                    ...airbnb,
                    tourist_tax_per_night: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">EUR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ab-cleaning">Reinigungsgebühr (pro Aufenthalt)</Label>
              <div className="flex gap-2">
                <Input
                  id="ab-cleaning"
                  type="number"
                  step="0.01"
                  min="0"
                  value={airbnb.cleaning_fee_per_stay}
                  onChange={(e) => setAirbnb({
                    ...airbnb,
                    cleaning_fee_per_stay: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">EUR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ab-electricity">Stromkosten (pro Aufenthalt)</Label>
              <div className="flex gap-2">
                <Input
                  id="ab-electricity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={airbnb.electricity_fee_per_stay}
                  onChange={(e) => setAirbnb({
                    ...airbnb,
                    electricity_fee_per_stay: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">EUR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ab-linen">Bettwäsche (pro Aufenthalt)</Label>
              <div className="flex gap-2">
                <Input
                  id="ab-linen"
                  type="number"
                  step="0.01"
                  min="0"
                  value={airbnb.linen_fee_per_stay}
                  onChange={(e) => setAirbnb({
                    ...airbnb,
                    linen_fee_per_stay: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">EUR</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ab-vat">Mehrwertsteuer</Label>
              <div className="flex gap-2">
                <Input
                  id="ab-vat"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={airbnb.vat_percentage}
                  onChange={(e) => setAirbnb({
                    ...airbnb,
                    vat_percentage: parseFloat(e.target.value) || 0
                  })}
                />
                <span className="flex items-center px-3 text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Beispielrechnung */}
      <Card>
        <CardHeader>
          <CardTitle>💡 Beispielrechnung</CardTitle>
          <CardDescription>
            Kostenübersicht für einen Musteraufenthalt (7 Nächte, 4 Personen)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Booking.com</p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>Servicegebühr: {bookingCom.service_fee_per_stay.toFixed(2)} EUR</li>
                <li>
                  Kurtaxe: {exampleBooking.guests} × {exampleBooking.nights} × {bookingCom.tourist_tax_per_night.toFixed(2)} = {' '}
                  {(exampleBooking.guests * exampleBooking.nights * bookingCom.tourist_tax_per_night).toFixed(2)} EUR
                </li>
                <li>Reinigung: {bookingCom.cleaning_fee_per_stay.toFixed(2)} EUR</li>
                <li>Strom: {bookingCom.electricity_fee_per_stay.toFixed(2)} EUR</li>
                <li>Bettwäsche: {bookingCom.linen_fee_per_stay.toFixed(2)} EUR</li>
                <li className="font-semibold text-foreground pt-2">
                  Gesamt Nebenkosten: {(
                    bookingCom.service_fee_per_stay +
                    exampleBooking.guests * exampleBooking.nights * bookingCom.tourist_tax_per_night +
                    bookingCom.cleaning_fee_per_stay +
                    bookingCom.electricity_fee_per_stay +
                    bookingCom.linen_fee_per_stay
                  ).toFixed(2)} EUR
                </li>
                <li className="text-xs">
                  + {bookingCom.vat_percentage}% MwSt = {bookingComTotal.toFixed(2)} EUR
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Airbnb</p>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>Servicegebühr: {airbnb.service_fee_per_stay.toFixed(2)} EUR</li>
                <li>
                  Kurtaxe: {exampleBooking.guests} × {exampleBooking.nights} × {airbnb.tourist_tax_per_night.toFixed(2)} = {' '}
                  {(exampleBooking.guests * exampleBooking.nights * airbnb.tourist_tax_per_night).toFixed(2)} EUR
                </li>
                <li>Reinigung: {airbnb.cleaning_fee_per_stay.toFixed(2)} EUR</li>
                <li>Strom: {airbnb.electricity_fee_per_stay.toFixed(2)} EUR</li>
                <li>Bettwäsche: {airbnb.linen_fee_per_stay.toFixed(2)} EUR</li>
                <li className="font-semibold text-foreground pt-2">
                  Gesamt Nebenkosten: {(
                    airbnb.service_fee_per_stay +
                    exampleBooking.guests * exampleBooking.nights * airbnb.tourist_tax_per_night +
                    airbnb.cleaning_fee_per_stay +
                    airbnb.electricity_fee_per_stay +
                    airbnb.linen_fee_per_stay
                  ).toFixed(2)} EUR
                </li>
                <li className="text-xs">
                  + {airbnb.vat_percentage}% MwSt = {airbnbTotal.toFixed(2)} EUR
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Speichern Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Speichern...' : 'Änderungen speichern'}
        </Button>
      </div>
    </div>
  );
};

export default AdditionalFeesTab;
