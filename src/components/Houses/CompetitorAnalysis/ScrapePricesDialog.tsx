import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, Zap } from "lucide-react";
import { useUpdateScrapingParams, useScrapePrices } from "@/hooks/useCompetitorAnalysis";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ScrapePricesDialogProps {
  house_id: string;
  disabled?: boolean;
}

const ScrapePricesDialog = ({ house_id, disabled }: ScrapePricesDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const updateParams = useUpdateScrapingParams();
  const scrapePrices = useScrapePrices();

  const handleMonthlyScrapNow = async () => {
    try {
      const now = new Date();
      const monthName = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      
      toast({
        title: "Scraping gestartet",
        description: `Suche 7-Nächte-Preise für ${monthName} (flexibles Check-in)...`,
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
          description: `${data.successful_properties || 0} von ${data.total_properties} Wettbewerbern erfolgreich`,
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
          <DialogTitle>Wettbewerber-Preise aktualisieren</DialogTitle>
          <DialogDescription>
            Scrapt automatisch 7-Nächte-Preise für den aktuellen Monat. Check-in-Datum ist flexibel (beliebiger Tag im Monat).
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                Aktueller Monat (flexibel)
              </h4>
              <p className="text-sm text-muted-foreground mt-2">
                Perplexity sucht nach verfügbaren 7-Nächte-Preisen irgendwann im aktuellen Monat. Check-in-Datum wird automatisch erkannt.
              </p>
            </div>
          </div>
          <Button
            onClick={handleMonthlyScrapNow}
            disabled={updateParams.isPending || scrapePrices.isPending || disabled}
            className="w-full"
            size="lg"
          >
            {(updateParams.isPending || scrapePrices.isPending) ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Scraping läuft...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Jetzt scrapen (flexibel)
              </>
            )}
          </Button>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScrapePricesDialog;
