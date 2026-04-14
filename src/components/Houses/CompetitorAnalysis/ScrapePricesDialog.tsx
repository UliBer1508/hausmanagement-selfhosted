import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, CheckCircle2, XCircle, Search, TrendingUp } from "lucide-react";
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
  house_id?: string;
  disabled?: boolean;
  triggerButton?: React.ReactNode;
}

const TOURIST_PLATFORMS = [
  { id: 'alle', label: 'Alle Portale' },
  { id: 'booking.com', label: 'Booking.com' },
  { id: 'airbnb', label: 'Airbnb' },
  { id: 'vrbo', label: 'VRBO' },
  { id: 'belvilla', label: 'Belvilla' },
  { id: 'fewo-direkt', label: 'FeWo-direkt' },
  { id: 'holidu', label: 'Holidu' },
  { id: 'traum-ferienwohnungen', label: 'Traum-Ferienwohnungen' },
];

const RENTAL_PLATFORMS = [
  { id: 'alle', label: 'Alle Portale' },
  { id: 'immoscout24', label: 'ImmoScout24' },
  { id: 'immowelt', label: 'Immowelt' },
  { id: 'ebay-kleinanzeigen', label: 'eBay Kleinanzeigen' },
  { id: 'wg-gesucht', label: 'WG-gesucht' },
];

interface PriceEntry {
  total_price?: number;
  price_per_night?: number;
  check_in?: string;
  check_out?: string;
  nights?: number;
  guests?: number;
  platform?: string;
  type?: string; // exact, seasonal, range, per_night
  notes?: string;
}

interface ScrapeResult {
  property?: string;
  success: boolean;
  found?: boolean;
  prices?: PriceEntry[];
  general_info?: string;
  best_price?: number;
  attempts?: number;
  error?: string;
  errors?: string[];
  // rental fields
  avg_rent?: number;
  min_rent?: number;
  max_rent?: number;
  price_per_sqm?: number;
  comparable_count?: number;
  sources?: string[];
}

const ScrapePricesDialog = ({ house_id, disabled, triggerButton }: ScrapePricesDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  // Load all houses for selection
  const { data: houses } = useQuery({
    queryKey: ['houses-for-scrape'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name, rental_type, address, living_area_sqm, bedrooms, max_guests, tenant_info')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const [selectedHouseId, setSelectedHouseId] = useState<string>(house_id || '');
  const selectedHouse = houses?.find(h => h.id === selectedHouseId);
  const isRental = selectedHouse?.rental_type === 'long_term';

  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [checkInFrom, setCheckInFrom] = useState<Date>(now);
  const [checkInTo, setCheckInTo] = useState<Date>(endOfMonth);
  const [minNights, setMinNights] = useState(7);
  const [maxGuests, setMaxGuests] = useState(6);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['alle']);
  
  // Rental-specific fields
  const [sqm, setSqm] = useState(selectedHouse?.living_area_sqm || 60);
  const [rooms, setRooms] = useState(selectedHouse?.bedrooms || 2);
  
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ScrapeResult[] | null>(null);

  // Update rental fields when house changes
  const handleHouseChange = (houseId: string) => {
    setSelectedHouseId(houseId);
    setResults(null);
    const house = houses?.find(h => h.id === houseId);
    if (house) {
      if (house.rental_type === 'long_term') {
        setSqm(house.living_area_sqm || 60);
        setRooms(house.bedrooms || 2);
        setSelectedPlatforms(['alle']);
      } else {
        setSelectedPlatforms(['alle']);
      }
    }
  };

  const platforms = isRental ? RENTAL_PLATFORMS : TOURIST_PLATFORMS;

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
    if (!selectedHouseId) {
      toast({ title: "Bitte wähle ein Haus aus", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setResults(null);

    try {
      const body: Record<string, any> = {
        manual: true,
        house_id: selectedHouseId,
        platforms: selectedPlatforms,
      };

      if (isRental) {
        body.analysis_type = 'rental';
        body.address = selectedHouse?.address || '';
        body.sqm = sqm;
        body.rooms = rooms;
        body.current_rent = (selectedHouse?.tenant_info as any)?.monthly_rent || null;

        toast({
          title: "Mietpreisanalyse gestartet",
          description: `Suche Vergleichsmieten für ${sqm} qm, ${rooms} Zimmer...`,
        });
      } else {
        body.analysis_type = 'tourist';
        body.check_in_from = format(checkInFrom, 'yyyy-MM-dd');
        body.check_in_to = format(checkInTo, 'yyyy-MM-dd');
        body.min_nights = minNights;
        body.max_guests = maxGuests;

        toast({
          title: "Scraping gestartet",
          description: `Suche Preise für bis zu ${maxGuests} Personen...`,
        });
      }

      const { data, error } = await supabase.functions.invoke('scrape-competitor-prices', { body });

      if (error) throw error;

      if (data?.success) {
        setResults(data.results || []);
        toast({
          title: "✅ Analyse abgeschlossen",
          description: isRental
            ? `Mietpreisanalyse für ${selectedHouse?.name} abgeschlossen`
            : `${data.successful_properties || 0} von ${data.total_properties} erfolgreich`,
        });
      } else {
        throw new Error(data?.error || 'Analyse fehlgeschlagen');
      }
    } catch (error) {
      console.error('Scraping error:', error);
      toast({
        title: "Fehler bei der Analyse",
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

  const defaultTrigger = (
    <Button variant="outline" disabled={disabled}>
      <TrendingUp className="w-4 h-4 mr-2" />
      Preisanalyse
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        {triggerButton || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isRental ? 'Mietpreisanalyse' : 'Wettbewerber-Preise scrapen'}</DialogTitle>
          <DialogDescription>
            {isRental 
              ? 'Suche Vergleichsmieten in der Region über Perplexity AI.'
              : 'Konfiguriere die Suchparameter für das Preis-Scraping über Perplexity AI.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-5 py-2">
            {/* House Selection */}
            <div className="space-y-2">
              <Label>Haus / Objekt</Label>
              <Select value={selectedHouseId} onValueChange={handleHouseChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Haus auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {houses?.map((house) => (
                    <SelectItem key={house.id} value={house.id}>
                      <span className="flex items-center gap-2">
                        {house.rental_type === 'long_term' ? '🏘️' : '🏖️'}
                        {house.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedHouse && (
                <p className="text-xs text-muted-foreground">
                  {selectedHouse.address}
                  {isRental ? ` • Festvermietung` : ` • Touristisch`}
                  {selectedHouse.living_area_sqm ? ` • ${selectedHouse.living_area_sqm} qm` : ''}
                </p>
              )}
            </div>

            {/* Tourist Mode: Date Range, Nights, Guests */}
            {!isRental && selectedHouseId && (
              <>
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Min. Nächte</Label>
                    <Input type="number" min={1} max={30} value={minNights} onChange={(e) => setMinNights(parseInt(e.target.value) || 7)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Max. Personen</Label>
                    <Input type="number" min={1} max={20} value={maxGuests} onChange={(e) => setMaxGuests(parseInt(e.target.value) || 6)} />
                  </div>
                </div>
              </>
            )}

            {/* Rental Mode: sqm, rooms */}
            {isRental && selectedHouseId && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Wohnfläche (qm)</Label>
                  <Input type="number" min={10} max={500} value={sqm} onChange={(e) => setSqm(parseInt(e.target.value) || 60)} />
                </div>
                <div className="space-y-2">
                  <Label>Zimmeranzahl</Label>
                  <Input type="number" min={1} max={10} value={rooms} onChange={(e) => setRooms(parseInt(e.target.value) || 2)} />
                </div>
              </div>
            )}

            {/* Platform Selection */}
            {selectedHouseId && (
              <div className="space-y-2">
                <Label>{isRental ? 'Immobilienportale' : 'Portale durchsuchen'}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {platforms.map((platform) => (
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
            )}

            {/* Scrape Button */}
            {selectedHouseId && (
              <Button
                onClick={handleScrape}
                disabled={isLoading || disabled || !selectedHouseId}
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    {isRental ? 'Analyse läuft...' : 'Scraping läuft...'}
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    {isRental ? 'Mietpreise analysieren' : 'Jetzt scrapen'}
                  </>
                )}
              </Button>
            )}

            {/* Results */}
            {results && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Ergebnisse</Label>
                <div className="space-y-3">
                  {results.map((r, i) => (
                    <div key={i} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.property || selectedHouse?.name}</span>
                        {r.success && r.found ? (
                          <Badge variant="default" className="bg-primary">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            {r.prices?.length || 0} Preise
                          </Badge>
                        ) : r.success && !r.found ? (
                          <Badge variant="secondary">Keine Preise</Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="w-3 h-3 mr-1" />
                            Fehler
                          </Badge>
                        )}
                      </div>

                      {r.success && !isRental && r.prices && r.prices.length > 0 && (
                        <div className="space-y-1.5">
                          {r.prices.map((p, j) => (
                            <div key={j} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1.5">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {p.type === 'exact' ? 'Exakt' : p.type === 'seasonal' ? 'Saison' : p.type === 'range' ? 'Spanne' : p.type === 'per_night' ? '/Nacht' : p.type || '?'}
                                </Badge>
                                <span className="font-medium">
                                  {p.total_price ? `€${p.total_price.toLocaleString('de-DE')}` : p.price_per_night ? `€${p.price_per_night}/N` : '–'}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground text-right">
                                {p.platform && <span className="block">{p.platform}</span>}
                                {p.check_in && p.nights && <span className="block">{p.check_in} • {p.nights}N</span>}
                                {p.notes && <span className="block italic">{p.notes}</span>}
                              </div>
                            </div>
                          ))}
                          {r.general_info && (
                            <p className="text-xs text-muted-foreground mt-1 italic">{r.general_info}</p>
                          )}
                        </div>
                      )}

                      {r.success && isRental && (
                        <div className="text-sm text-muted-foreground space-y-1">
                          {r.avg_rent && (
                            <div className="flex justify-between">
                              <span>Ø Kaltmiete:</span>
                              <span className="font-medium">€{r.avg_rent.toLocaleString('de-DE')}</span>
                            </div>
                          )}
                          {r.price_per_sqm && (
                            <div className="flex justify-between">
                              <span>Ø €/qm:</span>
                              <span className="font-medium">€{r.price_per_sqm.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          {(r.min_rent || r.max_rent) && (
                            <div className="flex justify-between text-xs">
                              <span>Spanne:</span>
                              <span>€{r.min_rent?.toLocaleString('de-DE')} – €{r.max_rent?.toLocaleString('de-DE')}</span>
                            </div>
                          )}
                          {r.comparable_count && (
                            <div className="text-xs">{r.comparable_count} Vergleichsobjekte</div>
                          )}
                        </div>
                      )}

                      {!r.success && (
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
