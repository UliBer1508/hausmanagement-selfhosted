import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Zap, CheckCircle2, XCircle, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ScrapePricesDialogProps {
  house_id: string;
  disabled?: boolean;
}

const PLATFORMS = [
  { id: 'alle', label: 'Alle Portale' },
  { id: 'booking.com', label: 'Booking.com' },
  { id: 'airbnb', label: 'Airbnb' },
  { id: 'vrbo', label: 'VRBO' },
  { id: 'belvilla', label: 'Belvilla' },
  { id: 'fewo-direkt', label: 'FeWo-direkt' },
  { id: 'holidu', label: 'Holidu' },
  { id: 'traum-ferienwohnungen', label: 'Traum-Ferienwohnungen' },
];

interface ScrapeResult {
  property: string;
  success: boolean;
  price?: number;
  check_in?: string;
  check_out?: string;
  nights?: number;
  platform_source?: string;
  attempts?: number;
  error?: string;
  errors?: string[];
}

const ScrapePricesDialog = ({ house_id, disabled }: ScrapePricesDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [checkInFrom, setCheckInFrom] = useState<Date>(now);
  const [checkInTo, setCheckInTo] = useState<Date>(endOfMonth);
  const [minNights, setMinNights] = useState(7);
  const [guestsAdults, setGuestsAdults] = useState(2);
  const [guestsChildren, setGuestsChildren] = useState(0);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['alle']);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ScrapeResult[] | null>(null);

  const togglePlatform = (platformId: string) => {
    if (platformId === 'alle') {
      setSelectedPlatforms(['alle']);
      return;
    }
    setSelectedPlatforms(prev => {
      const withoutAlle = prev.filter(p => p !== 'alle');
      if (withoutAlle.includes(platformId)) {
        const next = withoutAlle.filter(p => p !== platformId);
        return next.length === 0 ? ['alle'] : next;
      }
      return [...withoutAlle, platformId];
    });
  };

  const handleScrape = async () => {
    setIsLoading(true);
    setResults(null);

    try {
      toast({
        title: "Scraping gestartet",
        description: `Suche ${minNights}-Nächte-Preise (${guestsAdults} Erw.${guestsChildren > 0 ? `, ${guestsChildren} Kinder` : ''})...`,
      });

      const { data, error } = await supabase.functions.invoke('scrape-competitor-prices', {
        body: { 
          manual: true,
          check_in_from: format(checkInFrom, 'yyyy-MM-dd'),
          check_in_to: format(checkInTo, 'yyyy-MM-dd'),
          min_nights: minNights,
          guests_adults: guestsAdults,
          guests_children: guestsChildren,
          platforms: selectedPlatforms,
        }
      });

      if (error) throw error;

      if (data?.success) {
        setResults(data.results || []);
        toast({
          title: "✅ Scraping abgeschlossen",
          description: `${data.successful_properties || 0} von ${data.total_properties} erfolgreich`,
        });
      } else {
        throw new Error(data?.error || 'Scraping fehlgeschlagen');
      }
    } catch (error) {
      console.error('Scraping error:', error);
      toast({
        title: "Fehler beim Scraping",
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetAndClose = () => {
    setResults(null);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Preise aktualisieren
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Wettbewerber-Preise scrapen</DialogTitle>
          <DialogDescription>
            Konfiguriere die Suchparameter für das Preis-Scraping über Perplexity AI.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-5 py-2">
            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-in von</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !checkInFrom && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {checkInFrom ? format(checkInFrom, "dd.MM.yyyy", { locale: de }) : "Datum wählen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={checkInFrom} onSelect={(d) => d && setCheckInFrom(d)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Check-in bis</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !checkInTo && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {checkInTo ? format(checkInTo, "dd.MM.yyyy", { locale: de }) : "Datum wählen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={checkInTo} onSelect={(d) => d && setCheckInTo(d)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Nights & Guests */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Min. Nächte</Label>
                <Input type="number" min={1} max={30} value={minNights} onChange={(e) => setMinNights(parseInt(e.target.value) || 7)} />
              </div>
              <div className="space-y-2">
                <Label>Erwachsene</Label>
                <Input type="number" min={1} max={20} value={guestsAdults} onChange={(e) => setGuestsAdults(parseInt(e.target.value) || 2)} />
              </div>
              <div className="space-y-2">
                <Label>Kinder</Label>
                <Input type="number" min={0} max={10} value={guestsChildren} onChange={(e) => setGuestsChildren(parseInt(e.target.value) || 0)} />
              </div>
            </div>

            {/* Platform Selection */}
            <div className="space-y-2">
              <Label>Portale durchsuchen</Label>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map((platform) => (
                  <div key={platform.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`platform-${platform.id}`}
                      checked={selectedPlatforms.includes(platform.id)}
                      onCheckedChange={() => togglePlatform(platform.id)}
                    />
                    <label htmlFor={`platform-${platform.id}`} className="text-sm cursor-pointer">
                      {platform.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Scrape Button */}
            <Button
              onClick={handleScrape}
              disabled={isLoading || disabled}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Scraping läuft...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Jetzt scrapen
                </>
              )}
            </Button>

            {/* Results */}
            {results && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Ergebnisse</Label>
                <div className="space-y-2">
                  {results.map((r, i) => (
                    <div key={i} className="border rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.property}</span>
                        {r.success ? (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Gefunden
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="w-3 h-3 mr-1" />
                            Fehler
                          </Badge>
                        )}
                      </div>
                      {r.success && r.price ? (
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <div className="flex justify-between">
                            <span>€{r.price.toLocaleString('de-DE')}</span>
                            {r.platform_source && <span className="text-xs">{r.platform_source}</span>}
                          </div>
                          <div className="text-xs">
                            {r.check_in} → {r.check_out} ({r.nights || minNights}N)
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-destructive">
                          {r.errors?.join(', ') || r.error || 'Unbekannter Fehler'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScrapePricesDialog;
