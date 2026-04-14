import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, CheckCircle2, XCircle, Search, TrendingUp, ChevronDown, ChevronUp, MapPin, Users, BedDouble, Bath, Star, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  price_per_night?: number;
  price_total?: number;
  check_in?: string;
  nights?: number;
  guests?: number;
  platform?: string;
  includes?: string;
  // legacy fields for backward compat
  total_price?: number;
  type?: string;
  notes?: string;
}

interface PropertyDetails {
  description?: string;
  max_guests?: number;
  bedrooms?: number;
  bathrooms?: number;
  size_sqm?: number;
  rating?: number;
  review_count?: number;
  amenities?: string[];
  address?: string;
  highlights?: string[];
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
  property_details?: PropertyDetails;
  // rental fields
  avg_rent?: number;
  min_rent?: number;
  max_rent?: number;
  price_per_sqm?: number;
  comparable_count?: number;
  sources?: string[];
  comparables?: Array<{
    address?: string;
    sqm?: number;
    rooms?: number;
    rent?: number;
    source?: string;
    description?: string;
    floor?: string;
    year_built?: number;
    features?: string[];
    available_from?: string;
    listing_url?: string;
  }>;
}

const ScrapePricesDialog = ({ house_id, disabled, triggerButton }: ScrapePricesDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
  const [radiusKm, setRadiusKm] = useState(10);
  
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<ScrapeResult[] | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [expandedComparables, setExpandedComparables] = useState<Set<string>>(new Set());

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
        body.radius_km = radiusKm;
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

            {/* Rental Mode: sqm, rooms, radius */}
            {isRental && selectedHouseId && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Wohnfläche (qm)</Label>
                  <Input type="number" min={10} max={500} value={sqm} onChange={(e) => setSqm(parseInt(e.target.value) || 60)} />
                </div>
                <div className="space-y-2">
                  <Label>Zimmeranzahl</Label>
                  <div className="flex gap-1">
                    <Input type="number" min={1} max={10} value={rooms} onChange={(e) => {
                      const val = parseInt(e.target.value) || 2;
                      setRooms(val);
                    }} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-xs px-2"
                      onClick={async () => {
                        if (!selectedHouseId) return;
                        const { error } = await supabase
                          .from('houses')
                          .update({ bedrooms: rooms })
                          .eq('id', selectedHouseId);
                        if (error) {
                          toast({ title: "Fehler beim Speichern", variant: "destructive" });
                        } else {
                          queryClient.invalidateQueries({ queryKey: ['houses'] });
                          queryClient.invalidateQueries({ queryKey: ['houses-for-scrape'] });
                          toast({ title: "Zimmeranzahl gespeichert" });
                        }
                      }}
                    >
                      💾
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Umkreis (km)</Label>
                  <Input type="number" min={1} max={50} value={radiusKm} onChange={(e) => setRadiusKm(parseInt(e.target.value) || 10)} />
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
                  {results.map((r, i) => {
                    const isExpanded = expandedResults.has(i);
                    const hasDetails = r.property_details && Object.keys(r.property_details).length > 0;
                    const details = r.property_details;

                    return (
                    <Collapsible key={i} open={isExpanded} onOpenChange={(open) => {
                      setExpandedResults(prev => {
                        const next = new Set(prev);
                        if (open) next.add(i); else next.delete(i);
                        return next;
                      });
                    }}>
                      <div className={cn("border rounded-lg p-3 space-y-2 transition-colors", hasDetails && "cursor-pointer hover:border-primary/50")}>
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {hasDetails && (isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
                              <span className="font-medium text-sm">{r.property || selectedHouse?.name}</span>
                            </div>
                            {r.success && r.found && r.prices && r.prices.length > 0 ? (
                              <Badge variant="default" className="bg-primary">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                {r.prices.length} Preise
                              </Badge>
                            ) : r.success && r.general_info ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-300">Info</Badge>
                            ) : r.success && !r.found ? (
                              <Badge variant="secondary">Keine Preise</Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="w-3 h-3 mr-1" />
                                Fehler
                              </Badge>
                            )}
                          </div>
                        </CollapsibleTrigger>

                        {/* Expandable Property Details */}
                        <CollapsibleContent>
                          {hasDetails && details && (
                            <div className="mt-3 pt-3 border-t space-y-3">
                              {details.description && (
                                <p className="text-sm text-muted-foreground">{details.description}</p>
                              )}

                              {/* Specs row */}
                              <div className="flex flex-wrap gap-3 text-sm">
                                {details.max_guests && (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{details.max_guests} Gäste</span>
                                  </div>
                                )}
                                {details.bedrooms && (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <BedDouble className="w-3.5 h-3.5" />
                                    <span>{details.bedrooms} Schlafz.</span>
                                  </div>
                                )}
                                {details.bathrooms && (
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Bath className="w-3.5 h-3.5" />
                                    <span>{details.bathrooms} Bäder</span>
                                  </div>
                                )}
                                {details.size_sqm && (
                                  <span className="text-muted-foreground">{details.size_sqm} m²</span>
                                )}
                              </div>

                              {/* Rating */}
                              {details.rating && (
                                <div className="flex items-center gap-1.5 text-sm">
                                  <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                                  <span className="font-medium">{details.rating}</span>
                                  {details.review_count && (
                                    <span className="text-muted-foreground">({details.review_count} Bewertungen)</span>
                                  )}
                                </div>
                              )}

                              {/* Address */}
                              {details.address && (
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                  <MapPin className="w-3.5 h-3.5" />
                                  <span>{details.address}</span>
                                </div>
                              )}

                              {/* Amenities */}
                              {details.amenities && details.amenities.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {details.amenities.map((a, ai) => (
                                    <Badge key={ai} variant="secondary" className="text-[10px] px-1.5 py-0">
                                      {a}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {/* Highlights */}
                              {details.highlights && details.highlights.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {details.highlights.map((h, hi) => (
                                    <Badge key={hi} variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                                      {h}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </CollapsibleContent>

                        {/* Tourist prices */}
                        {r.success && !isRental && r.prices && r.prices.length > 0 && (
                          <div className="space-y-1.5">
                            {r.prices.map((p, j) => {
                              const nightPrice = p.price_per_night || (p.total_price && p.nights ? Math.round(p.total_price / p.nights) : null);
                              const totalPrice = p.price_total || p.total_price || null;
                              const includesText = p.includes || p.notes || null;

                              return (
                                <div key={j} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-primary">
                                      {nightPrice ? `€${nightPrice}/N` : totalPrice ? `€${totalPrice.toLocaleString('de-DE')}` : '–'}
                                    </span>
                                    {nightPrice && totalPrice && (
                                      <span className="text-xs text-muted-foreground">
                                        (€{totalPrice.toLocaleString('de-DE')} ges.)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground text-right max-w-[55%]">
                                    {p.platform && <span className="block">{p.platform}</span>}
                                    {p.check_in && p.nights && <span className="block">{p.check_in} • {p.nights}N{p.guests ? ` • ${p.guests}P` : ''}</span>}
                                    {includesText && <span className="block italic truncate">{includesText}</span>}
                                  </div>
                                </div>
                              );
                            })}
                            {r.general_info && (
                              <p className="text-xs text-muted-foreground mt-1 italic">{r.general_info}</p>
                            )}
                          </div>
                        )}

                        {/* General info fallback when no prices */}
                        {r.success && !isRental && (!r.prices || r.prices.length === 0) && r.general_info && (
                          <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2">
                            <p className="text-xs text-amber-800 italic">{r.general_info}</p>
                          </div>
                        )}

                        {/* Rental results */}
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
                              <div className="text-xs">{r.comparable_count} Vergleichsobjekte gefunden</div>
                            )}
                            {r.comparables && r.comparables.length > 0 && (
                              <div className="mt-2 space-y-1.5">
                                <div className="text-xs font-medium text-foreground">Gefundene Objekte:</div>
                                {r.comparables.map((c, ci) => {
                                  const compKey = `${i}-${ci}`;
                                  const isCompExpanded = expandedComparables.has(compKey);
                                  const hasCompDetails = !!(c.description || c.floor || c.year_built || (c.features && c.features.length > 0) || c.available_from || c.listing_url);

                                  return (
                                    <Collapsible key={ci} open={isCompExpanded} onOpenChange={(open) => {
                                      setExpandedComparables(prev => {
                                        const next = new Set(prev);
                                        if (open) next.add(compKey); else next.delete(compKey);
                                        return next;
                                      });
                                    }}>
                                      <div className={cn("border rounded-lg bg-muted/30 transition-colors", hasCompDetails && "cursor-pointer hover:border-primary/50")}>
                                        <CollapsibleTrigger asChild>
                                          <div className="flex items-center justify-between px-2 py-1.5">
                                            <div className="flex items-center gap-1.5">
                                              {hasCompDetails && (isCompExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />)}
                                              <div>
                                                <span className="font-medium text-sm">{c.address || 'Unbekannt'}</span>
                                                <div className="text-xs text-muted-foreground">
                                                  {c.sqm && <span>{c.sqm} qm</span>}
                                                  {c.rooms && <span> • {c.rooms} Zi.</span>}
                                                  {c.source && <span> • {c.source}</span>}
                                                </div>
                                              </div>
                                            </div>
                                            {c.rent && (
                                              <span className="font-semibold text-primary whitespace-nowrap ml-2">
                                                €{c.rent.toLocaleString('de-DE')}/M
                                              </span>
                                            )}
                                          </div>
                                        </CollapsibleTrigger>

                                        <CollapsibleContent>
                                          {hasCompDetails && (
                                            <div className="px-3 pb-2.5 pt-1 border-t space-y-2">
                                              {c.description && (
                                                <p className="text-xs text-muted-foreground">{c.description}</p>
                                              )}
                                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                {c.floor && <span>📍 {c.floor}</span>}
                                                {c.year_built && <span>🏗️ Baujahr {c.year_built}</span>}
                                                {c.available_from && <span>📅 Ab {c.available_from}</span>}
                                              </div>
                                              {c.features && c.features.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                  {c.features.map((f, fi) => (
                                                    <Badge key={fi} variant="secondary" className="text-[10px] px-1.5 py-0">
                                                      {f}
                                                    </Badge>
                                                  ))}
                                                </div>
                                              )}
                                              {c.listing_url && (
                                                <a
                                                  href={c.listing_url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  <ExternalLink className="w-3 h-3" />
                                                  Inserat ansehen
                                                </a>
                                              )}
                                            </div>
                                          )}
                                        </CollapsibleContent>
                                      </div>
                                    </Collapsible>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {!r.success && (
                          <p className="text-xs text-destructive">
                            {r.errors?.join(', ') || r.error || 'Unbekannter Fehler'}
                          </p>
                        )}
                      </div>
                    </Collapsible>
                    );
                  })}
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
