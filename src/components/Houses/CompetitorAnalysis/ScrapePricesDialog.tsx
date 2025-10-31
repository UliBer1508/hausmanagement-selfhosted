import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, RefreshCw, Zap } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useUpdateScrapingParams, useScrapePrices } from "@/hooks/useCompetitorAnalysis";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ScrapePricesDialogProps {
  house_id: string;
  disabled?: boolean;
}

const ScrapePricesDialog = ({ house_id, disabled }: ScrapePricesDialogProps) => {
  const [open, setOpen] = useState(false);
  const [checkIn, setCheckIn] = useState<Date>();
  const [checkOut, setCheckOut] = useState<Date>();
  const { toast } = useToast();

  const updateParams = useUpdateScrapingParams();
  const scrapePrices = useScrapePrices();

  const handleScrape = async () => {
    if (!checkIn || !checkOut) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie Check-in und Check-out Datum",
        variant: "destructive",
      });
      return;
    }

    if (checkOut <= checkIn) {
      toast({
        title: "Fehler",
        description: "Check-out muss nach Check-in liegen",
        variant: "destructive",
      });
      return;
    }

    try {
      // 1. Scraping-Params für alle Wettbewerber dieses Hauses speichern
      await updateParams.mutateAsync({
        house_id,
        check_in: format(checkIn, 'yyyy-MM-dd'),
        check_out: format(checkOut, 'yyyy-MM-dd'),
      });

      // 2. Scraping starten
      await scrapePrices.mutateAsync();

      setOpen(false);
      setCheckIn(undefined);
      setCheckOut(undefined);
    } catch (error) {
      console.error('Error in scrape process:', error);
    }
  };

  const handleMonthlyScrapNow = async () => {
    try {
      toast({
        title: "Scraping gestartet",
        description: "Hole Wochenpreise für alle 12 Monate (15. jedes Monats)...",
      });

      const { data, error } = await supabase.functions.invoke('scrape-competitor-prices', {
        body: { 
          manual: true, 
          year: new Date().getFullYear() 
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "✅ Scraping erfolgreich",
          description: `${data.total_months_scraped} Monate für ${data.successful_properties} Wettbewerber geholt`,
        });
      } else {
        throw new Error(data?.error || 'Scraping fehlgeschlagen');
      }

      setOpen(false);
    } catch (error) {
      console.error('Error during monthly scraping:', error);
      toast({
        title: "Fehler beim Scraping",
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Preise aktualisieren
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Preise aktualisieren</DialogTitle>
          <DialogDescription>
            Monatliches Scraping (15. jeden Monats) oder eigenen Zeitraum wählen
          </DialogDescription>
        </DialogHeader>

        {/* Monatliches Scraping - SCHNELLAKTION */}
        <div className="py-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                Monatliches Scraping
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                Holt automatisch Wochenpreise für alle 12 Monate (15. → 22. jedes Monats)
              </p>
            </div>
          </div>
          <Button
            onClick={handleMonthlyScrapNow}
            disabled={updateParams.isPending || scrapePrices.isPending || disabled}
            className="w-full"
            variant="default"
          >
            {(updateParams.isPending || scrapePrices.isPending) ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Scraping läuft...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Jetzt scrapen (alle 12 Monate)
              </>
            )}
          </Button>
        </div>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="check-in">Check-in</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="check-in"
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !checkIn && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {checkIn ? format(checkIn, "PPP", { locale: de }) : "Datum wählen"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={checkIn}
                  onSelect={setCheckIn}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="check-out">Check-out</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="check-out"
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !checkOut && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {checkOut ? format(checkOut, "PPP", { locale: de }) : "Datum wählen"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={checkOut}
                  onSelect={setCheckOut}
                  disabled={(date) => checkIn ? date <= checkIn : false}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {checkIn && checkOut && (
            <div className="text-sm text-muted-foreground">
              Zeitraum: {Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))} Nächte
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleScrape}
            disabled={!checkIn || !checkOut || updateParams.isPending || scrapePrices.isPending}
          >
            {(updateParams.isPending || scrapePrices.isPending) && (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            )}
            Preise aktualisieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScrapePricesDialog;
