import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Euro } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface OwnPricingDialogProps {
  house_id: string;
  trigger?: React.ReactNode;
}

const OwnPricingDialog = ({ house_id, trigger }: OwnPricingDialogProps) => {
  const [open, setOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [price, setPrice] = useState<string>('');
  const [currency, setCurrency] = useState('EUR');
  const [minStay, setMinStay] = useState<string>('1');
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!dateFrom || !price) {
      toast({
        title: "Fehlende Daten",
        description: "Bitte geben Sie mindestens ein Startdatum und einen Preis ein.",
        variant: "destructive",
      });
      return;
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      toast({
        title: "Ungültiger Preis",
        description: "Bitte geben Sie einen gültigen Preis ein.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Wenn kein End-Datum, nur ein Tag
      const endDate = dateTo || dateFrom;
      
      // Erstelle Array mit allen Tagen im Bereich
      const dates: Date[] = [];
      const currentDate = new Date(dateFrom);
      const finalDate = new Date(endDate);
      
      while (currentDate <= finalDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Füge Preise für jeden Tag hinzu
      const priceEntries = dates.map(date => ({
        house_id,
        date: format(date, 'yyyy-MM-dd'),
        price: priceNum,
        currency,
        min_stay: parseInt(minStay) || 1,
        is_available: true,
        source: 'manual'
      }));

      const { error } = await supabase
        .from('daily_pricing')
        .upsert(priceEntries, {
          onConflict: 'house_id,date',
          ignoreDuplicates: false
        });

      if (error) throw error;

      toast({
        title: "Preise gespeichert",
        description: `${priceEntries.length} Tagespreise erfolgreich hinzugefügt.`,
      });

      // Query invalidieren
      queryClient.invalidateQueries({ queryKey: ['price-comparison'] });

      // Dialog schließen und Formular zurücksetzen
      setOpen(false);
      setDateFrom(undefined);
      setDateTo(undefined);
      setPrice('');
      setMinStay('1');

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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Eigene Preise erfassen</DialogTitle>
          <DialogDescription>
            Geben Sie Ihre Tagespreise ein, um sie mit Wettbewerbern zu vergleichen.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Von Datum */}
            <div className="space-y-2">
              <Label>Von Datum *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd.MM.yyyy', { locale: de }) : 'Datum wählen'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    locale={de}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Bis Datum */}
            <div className="space-y-2">
              <Label>Bis Datum (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd.MM.yyyy', { locale: de }) : 'Datum wählen'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    disabled={(date) => dateFrom ? date < dateFrom : false}
                    locale={de}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Preis */}
          <div className="space-y-2">
            <Label htmlFor="price">Preis pro Nacht *</Label>
            <div className="flex gap-2">
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="150.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                className="flex-1"
              />
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-20"
                placeholder="EUR"
              />
            </div>
          </div>

          {/* Mindestaufenthalt */}
          <div className="space-y-2">
            <Label htmlFor="minStay">Mindestaufenthalt (Nächte)</Label>
            <Input
              id="minStay"
              type="number"
              min="1"
              value={minStay}
              onChange={(e) => setMinStay(e.target.value)}
            />
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
              {isLoading ? 'Wird gespeichert...' : 'Preise speichern'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default OwnPricingDialog;
