import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Euro } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface OwnPricingDialogProps {
  house_id: string;
  trigger?: React.ReactNode;
}

const MONTHS = [
  { value: '01', label: 'Januar' },
  { value: '02', label: 'Februar' },
  { value: '03', label: 'März' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Dezember' },
];

const OwnPricingDialog = ({ house_id, trigger }: OwnPricingDialogProps) => {
  const currentYear = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState<string>(currentYear.toString());
  const [monthlyPrices, setMonthlyPrices] = useState<Record<string, string>>({});
  const [currency] = useState('EUR');
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handlePriceChange = (month: string, value: string) => {
    setMonthlyPrices(prev => ({
      ...prev,
      [month]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filter out empty prices
    const validPrices = Object.entries(monthlyPrices).filter(([_, price]) => price && parseFloat(price) > 0);
    
    if (validPrices.length === 0) {
      toast({
        title: "Fehlende Daten",
        description: "Bitte geben Sie mindestens einen Preis ein.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Create entries for monthly_pricing table
      const priceEntries = validPrices.map(([month, price]) => {
        const checkInDate = `${year}-${month}-15`;
        const checkOutDate = new Date(checkInDate);
        checkOutDate.setDate(checkOutDate.getDate() + 7);
        
        return {
          house_id,
          competitor_property_id: null,
          check_in_date: checkInDate,
          check_out_date: checkOutDate.toISOString().split('T')[0],
          base_price_7nights: parseFloat(price),
          currency,
          source: 'manual'
        };
      });

      const { error } = await supabase
        .from('monthly_pricing')
        .upsert(priceEntries, {
          onConflict: 'house_id,check_in_date',
          ignoreDuplicates: false
        });

      if (error) throw error;

      toast({
        title: "Preise gespeichert",
        description: `${priceEntries.length} monatliche Preise erfolgreich hinzugefügt.`,
      });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['price-comparison'] });

      // Close dialog and reset
      setOpen(false);
      setMonthlyPrices({});

    } catch (error: any) {
      console.error('Fehler beim Speichern der Preise:', error);
      toast({
        title: "Fehler",
        description: error.message || "Preise konnten nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Euro className="w-4 h-4 mr-2" />
            Eigene Preise eingeben
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Eigene monatliche 7-Nächte-Preise erfassen</DialogTitle>
          <DialogDescription>
            Geben Sie Ihre Wochenpreise (7 Nächte, Check-in am 15.) ein, um sie mit Wettbewerbern zu vergleichen.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Jahr Auswahl */}
          <div className="space-y-2">
            <Label htmlFor="year">Jahr</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={(currentYear - 1).toString()}>{currentYear - 1}</SelectItem>
                <SelectItem value={currentYear.toString()}>{currentYear}</SelectItem>
                <SelectItem value={(currentYear + 1).toString()}>{currentYear + 1}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Monatliche Preise Tabelle */}
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-3 gap-px bg-muted">
              <div className="bg-background p-2 font-medium text-sm">Monat</div>
              <div className="bg-background p-2 font-medium text-sm">Check-in</div>
              <div className="bg-background p-2 font-medium text-sm">Preis (7 Nächte)</div>
            </div>
            {MONTHS.map((month) => (
              <div key={month.value} className="grid grid-cols-3 gap-px bg-muted">
                <div className="bg-background p-2 text-sm">{month.label}</div>
                <div className="bg-background p-2 text-sm text-muted-foreground">
                  15.{month.value}.{year}
                </div>
                <div className="bg-background p-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="1200.00"
                      value={monthlyPrices[month.value] || ''}
                      onChange={(e) => handlePriceChange(month.value, e.target.value)}
                      className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground">{currency}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Wird gespeichert...' : 'Alle Preise speichern'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default OwnPricingDialog;
