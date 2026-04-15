import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, CheckCircle2, XCircle, Search, TrendingUp, ChevronDown, ChevronUp, MapPin, Users, BedDouble, Bath, Star, ExternalLink, Award } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, nextSaturday } from "date-fns";
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
  { id: 'alle', label: 'Beide Portale' },
  { id: 'booking.com', label: 'Booking.com', color: 'bg-blue-600' },
  { id: 'airbnb', label: 'Airbnb', color: 'bg-rose-500' },
];

const RENTAL_PLATFORMS = [
  { id: 'alle', label: 'Alle Portale' },
  { id: 'immoscout24', label: 'ImmoScout24' },
  { id: 'immowelt', label: 'Immowelt' },
  { id: 'ebay-kleinanzeigen', label: 'eBay Kleinanzeigen' },
  { id: 'wg-gesucht', label: 'WG-gesucht' },
];

interface ListingResult {
  name: string;
  price_total?: number | null;
  price_per_night?: number | null;
  price_info?: string | null;
  platform?: string | null;
  description?: string | null;
  max_guests?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  size_sqm?: number | null;
  rating?: number | null;
  review_count?: number | null;
  amenities?: string[];
  address?: string | null;
  highlights?: string[];
  listing_url?: string | null;
  superhost?: boolean;
  cleaning_fee?: number | null;
  service_fee?: number | null;
  booking_rating_score?: number | null;
}

interface RentalResult {
  property?: string;
  success: boolean;
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

const getNextSaturday = () => {
  const now = new Date();
  const day = now.getDay();
  if (day === 6) return addDays(now, 7);
  return nextSaturday(now);
};

// Listing Card component
const ListingCard = ({ listing, index, isExpanded, onToggle }: {
  listing: ListingResult;
  index: number;
  isExpanded: boolean;
  onToggle: (open: boolean) => void;
}) => {
  const hasDetails = !!(listing.description || listing.amenities?.length || listing.highlights?.length);
  const isBooking = listing.platform === 'Booking.com';
  const isAirbnb = listing.platform === 'Airbnb';

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="border rounded-lg p-3 space-y-2 hover:border-primary/50 transition-colors">
        <CollapsibleTrigger asChild>
          <div className="flex items-start justify-between cursor-pointer">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {hasDetails && (isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />)}
                <span className="font-medium text-sm truncate">{listing.name}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1 ml-6">
                {/* Portal Badge */}
                {isBooking && (
                  <Badge className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white">Booking.com</Badge>
                )}
                {isAirbnb && (
                  <Badge className="text-[10px] bg-rose-500 hover:bg-rose-600 text-white">Airbnb</Badge>
                )}
                {!isBooking && !isAirbnb && listing.platform && (
                  <Badge variant="outline" className="text-[10px]">{listing.platform}</Badge>
                )}

                {/* Rating */}
                {listing.rating && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    {isBooking ? (
                      <span className="bg-blue-700 text-white text-[10px] font-bold px-1 py-0.5 rounded">{listing.rating}</span>
                    ) : (
                      <>
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                        {listing.rating}
                      </>
                    )}
                    {listing.review_count && <span className="text-muted-foreground">({listing.review_count})</span>}
                  </span>
                )}

                {/* Superhost */}
                {isAirbnb && listing.superhost && (
                  <Badge variant="outline" className="text-[10px] border-rose-300 text-rose-600">
                    <Award className="w-3 h-3 mr-0.5" />Superhost
                  </Badge>
                )}

                {listing.max_guests && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Users className="w-3 h-3" />{listing.max_guests}
                  </span>
                )}
                {listing.bedrooms && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <BedDouble className="w-3 h-3" />{listing.bedrooms}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              {listing.price_total ? (
                <span className="font-bold text-primary text-base">€{listing.price_total.toLocaleString('de-DE')}</span>
              ) : listing.price_per_night ? (
                <span className="font-bold text-primary text-base">€{listing.price_per_night.toLocaleString('de-DE')}/N</span>
              ) : (
                <Badge variant="secondary">Kein Preis</Badge>
              )}
              {listing.price_per_night && listing.price_total && (
                <div className="text-[10px] text-muted-foreground">€{listing.price_per_night}/Nacht</div>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        {listing.price_info && (
          <p className="text-[11px] text-muted-foreground italic ml-6">{listing.price_info}</p>
        )}

        {/* Fee breakdown for Airbnb */}
        {isAirbnb && (listing.cleaning_fee || listing.service_fee) && (
          <div className="flex gap-3 ml-6 text-[10px] text-muted-foreground">
            {listing.cleaning_fee && <span>Reinigung: €{listing.cleaning_fee}</span>}
            {listing.service_fee && <span>Service: €{listing.service_fee}</span>}
          </div>
        )}

        <div className="flex gap-2 ml-6">
          {listing.listing_url && (
            <a
              href={listing.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1 text-xs hover:underline",
                isBooking ? "text-blue-600 hover:text-blue-800" : isAirbnb ? "text-rose-600 hover:text-rose-800" : "text-blue-600 hover:text-blue-800"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
              Angebot ansehen
            </a>
          )}
        </div>

        <CollapsibleContent>
          <div className="mt-2 pt-2 border-t space-y-2 ml-6">
            {listing.description && (
              <p className="text-xs text-muted-foreground">{listing.description}</p>
            )}
            <div className="flex flex-wrap gap-3 text-xs">
              {listing.bathrooms && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Bath className="w-3 h-3" />{listing.bathrooms} Bäder
                </span>
              )}
              {listing.size_sqm && <span className="text-muted-foreground">{listing.size_sqm} m²</span>}
              {listing.address && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="w-3 h-3" />{listing.address}
                </span>
              )}
            </div>
            {listing.amenities && listing.amenities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {listing.amenities.map((a, ai) => (
                  <Badge key={ai} variant="secondary" className="text-[10px] px-1.5 py-0">{a}</Badge>
                ))}
              </div>
            )}
            {listing.highlights && listing.highlights.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {listing.highlights.map((h, hi) => (
                  <Badge key={hi} variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">{h}</Badge>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

const ScrapePricesDialog = ({ house_id, disabled, triggerButton }: ScrapePricesDialogProps) => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: houses } = useQuery({
    queryKey: ['houses-for-scrape'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name, rental_type, address, bedrooms, max_guests, tenant_info, scrape_search_params')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const [selectedHouseId, setSelectedHouseId] = useState<string>(house_id || '');
  const selectedHouse = houses?.find(h => h.id === selectedHouseId);
  const isRental = selectedHouse?.rental_type === 'long_term';

  const defaultCheckIn = useMemo(() => getNextSaturday(), []);
  const defaultCheckOut = useMemo(() => addDays(defaultCheckIn, 7), [defaultCheckIn]);

  const [location, setLocation] = useState('');
  const [checkIn, setCheckIn] = useState<Date>(defaultCheckIn);
  const [checkOut, setCheckOut] = useState<Date>(defaultCheckOut);
  const [guests, setGuests] = useState(6);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['alle']);
  
  const [sqm, setSqm] = useState(60);
  const [rooms, setRooms] = useState(2);
  const [radiusKm, setRadiusKm] = useState(10);
  
  const [isLoading, setIsLoading] = useState(false);
  const [touristResults, setTouristResults] = useState<ListingResult[] | null>(null);
  const [resultsByPlatform, setResultsByPlatform] = useState<Record<string, { listings: ListingResult[]; citations: string[] }> | null>(null);
  const [rentalResults, setRentalResults] = useState<RentalResult[] | null>(null);
  const [searchSummary, setSearchSummary] = useState<string | null>(null);
  const [expandedListings, setExpandedListings] = useState<Set<number>>(new Set());
  const [expandedComparables, setExpandedComparables] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('alle');

  const handleHouseChange = (houseId: string) => {
    setSelectedHouseId(houseId);
    setTouristResults(null);
    setResultsByPlatform(null);
    setRentalResults(null);
    setSearchSummary(null);
    const house = houses?.find(h => h.id === houseId);
    if (house) {
      const addr = house.address || '';
      const parts = addr.split(',').map(s => s.trim());
      const city = parts.length > 1 ? parts[parts.length - 1] : addr;
      setLocation(city);

      const saved = house.scrape_search_params as any;
      if (house.rental_type === 'long_term') {
        setSqm(saved?.sqm || 60);
        setRooms(saved?.rooms || house.bedrooms || 2);
        setRadiusKm(saved?.radius_km || 10);
        setSelectedPlatforms(saved?.platforms || ['alle']);
      } else {
        setGuests(saved?.guests || house.max_guests || 6);
        setSelectedPlatforms(saved?.platforms || ['alle']);
        if (saved?.location) setLocation(saved.location);
      }
    }
  };

  const platformOptions = isRental ? RENTAL_PLATFORMS : TOURIST_PLATFORMS;

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
    setTouristResults(null);
    setResultsByPlatform(null);
    setRentalResults(null);
    setSearchSummary(null);

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
        toast({ title: "Mietpreisanalyse gestartet", description: `Suche Vergleichsmieten für ${sqm} qm, ${rooms} Zimmer...` });
      } else {
        body.analysis_type = 'tourist';
        body.location = location;
        body.check_in = format(checkIn, 'yyyy-MM-dd');
        body.check_out = format(checkOut, 'yyyy-MM-dd');
        body.guests = guests;

        const portalNames = selectedPlatforms.includes('alle') 
          ? 'Booking.com & Airbnb' 
          : selectedPlatforms.map(p => TOURIST_PLATFORMS.find(t => t.id === p)?.label || p).join(' & ');
        toast({ title: "Suche gestartet", description: `Suche auf ${portalNames} in ${location}...` });
      }

      const { data, error } = await supabase.functions.invoke('scrape-competitor-prices', { body });
      if (error) throw error;

      if (data?.success) {
        if (isRental) {
          setRentalResults(data.results || []);
        } else {
          setTouristResults(data.results || []);
          setResultsByPlatform(data.results_by_platform || null);
          setSearchSummary(data.search_summary || null);
          setActiveTab('alle');
        }
        toast({
          title: "✅ Suche abgeschlossen",
          description: isRental
            ? `Mietpreisanalyse für ${selectedHouse?.name} abgeschlossen`
            : `${data.total_listings || 0} Angebote gefunden`,
        });
      } else {
        throw new Error(data?.error || 'Analyse fehlgeschlagen');
      }
    } catch (error) {
      console.error('Scraping error:', error);
      toast({ title: "Fehler bei der Suche", description: error instanceof Error ? error.message : 'Unbekannter Fehler', variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const resetAndClose = () => {
    setTouristResults(null);
    setResultsByPlatform(null);
    setRentalResults(null);
    setSearchSummary(null);
    setOpen(false);
  };

  const nightsCount = Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  const bookingListings = resultsByPlatform?.['booking.com']?.listings || [];
  const airbnbListings = resultsByPlatform?.['airbnb']?.listings || [];

  const getTabListings = (tab: string): ListingResult[] => {
    if (tab === 'booking.com') return bookingListings;
    if (tab === 'airbnb') return airbnbListings;
    return touristResults || [];
  };

  const defaultTrigger = (
    <Button variant="outline" disabled={disabled} className="bg-green-600 text-white hover:bg-green-700 border-green-600">
      <TrendingUp className="w-4 h-4 mr-2" />
      Preisanalyse
    </Button>
  );

  const renderListings = (listings: ListingResult[]) => (
    <div className="space-y-2">
      {listings.map((listing, i) => {
        const globalIdx = touristResults?.indexOf(listing) ?? i;
        return (
          <ListingCard
            key={`${listing.platform}-${i}`}
            listing={listing}
            index={i}
            isExpanded={expandedListings.has(globalIdx)}
            onToggle={(open) => {
              setExpandedListings(prev => {
                const next = new Set(prev);
                if (open) next.add(globalIdx); else next.delete(globalIdx);
                return next;
              });
            }}
          />
        );
      })}
      {listings.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <p>Keine Angebote gefunden.</p>
          <p className="text-sm mt-1">Versuche einen anderen Ort oder Zeitraum.</p>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        {triggerButton || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isRental ? 'Mietpreisanalyse' : 'Angebote suchen'}</DialogTitle>
          <DialogDescription>
            {isRental 
              ? 'Suche Vergleichsmieten in der Region über Perplexity AI.'
              : 'Suche auf Booking.com und Airbnb nach Unterkünften mit Preisen.'}
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
                </p>
              )}
            </div>

            {/* Tourist Mode - Booking.com Style Search Bar */}
            {!isRental && selectedHouseId && (
              <>
                <div className="bg-[#003580] rounded-xl p-3 space-y-3">
                  {/* Search Bar Row */}
                  <div className="flex gap-1.5 items-stretch">
                    {/* Location */}
                    <div className="flex-[2] relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10">
                        <BedDouble className="w-4 h-4" />
                      </div>
                      <Input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Wohin möchten Sie?"
                        className="pl-10 h-12 bg-white border-2 border-[#febb02] rounded-lg text-sm font-medium focus-visible:ring-[#febb02]"
                      />
                    </div>

                    {/* Date Range */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="flex-[1.5] h-12 justify-start text-left font-normal bg-white border-2 border-[#febb02] rounded-lg hover:bg-gray-50 text-sm">
                          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate">
                            {format(checkIn, "EE, dd. MMM.", { locale: de })} — {format(checkOut, "EE, dd. MMM.", { locale: de })}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <div className="p-3 space-y-3">
                          <div className="text-sm font-medium">Check-in</div>
                          <Calendar mode="single" selected={checkIn} onSelect={(d) => {
                            if (d) { setCheckIn(d); setCheckOut(addDays(d, nightsCount)); }
                          }} initialFocus className="pointer-events-auto" />
                          <div className="text-sm font-medium">Check-out</div>
                          <Calendar mode="single" selected={checkOut} onSelect={(d) => d && setCheckOut(d)} initialFocus className="pointer-events-auto" />
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* Guests */}
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="flex-[1.2] h-12 justify-start text-left font-normal bg-white border-2 border-[#febb02] rounded-lg hover:bg-gray-50 text-sm">
                          <Users className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{guests} Erw. · {nightsCount} N.</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56" align="end">
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label className="text-xs">Personen</Label>
                            <Input type="number" min={1} max={20} value={guests} onChange={(e) => setGuests(parseInt(e.target.value) || 6)} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Nächte</Label>
                            <Input type="number" min={1} max={30} value={nightsCount} onChange={(e) => {
                              const n = parseInt(e.target.value) || 7;
                              setCheckOut(addDays(checkIn, n));
                            }} />
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* Search Button */}
                    <Button
                      onClick={handleScrape}
                      disabled={isLoading || disabled || !selectedHouseId || !location}
                      className="h-12 px-6 bg-[#0071c2] hover:bg-[#005999] text-white font-bold rounded-lg text-base shrink-0"
                    >
                      {isLoading ? (
                        <RefreshCw className="h-5 w-5 animate-spin" />
                      ) : (
                        <>Suche</>
                      )}
                    </Button>
                  </div>

                  {/* Platform Toggles Row */}
                  <div className="flex items-center gap-3 px-1">
                    {platformOptions.map((platform) => (
                      <div key={platform.id} className="flex items-center space-x-1.5">
                        <Checkbox
                          id={`platform-bar-${platform.id}`}
                          checked={selectedPlatforms.includes(platform.id)}
                          onCheckedChange={() => togglePlatform(platform.id)}
                          className="border-white/60 data-[state=checked]:bg-[#febb02] data-[state=checked]:border-[#febb02]"
                        />
                        <label htmlFor={`platform-bar-${platform.id}`} className="text-xs cursor-pointer text-white/90">
                          {platform.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save params button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={async () => {
                    if (!selectedHouseId) return;
                    const params = { location, guests, platforms: selectedPlatforms };
                    const { error } = await supabase
                      .from('houses')
                      .update({ scrape_search_params: params } as any)
                      .eq('id', selectedHouseId);
                    if (error) {
                      toast({ title: "Fehler beim Speichern", variant: "destructive" });
                    } else {
                      queryClient.invalidateQueries({ queryKey: ['houses'] });
                      queryClient.invalidateQueries({ queryKey: ['houses-for-scrape'] });
                      toast({ title: "✅ Suchparameter gespeichert" });
                    }
                  }}
                >
                  💾 Suchparameter speichern
                </Button>
              </>
            )}

            {/* Rental Mode */}
            {isRental && selectedHouseId && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Wohnfläche (qm)</Label>
                  <Input type="number" min={10} max={500} value={sqm} onChange={(e) => setSqm(parseInt(e.target.value) || 60)} />
                </div>
                <div className="space-y-2">
                  <Label>Zimmeranzahl</Label>
                  <Input type="number" min={1} max={10} value={rooms} onChange={(e) => setRooms(parseInt(e.target.value) || 2)} />
                </div>
                <div className="space-y-2">
                  <Label>Umkreis (km)</Label>
                  <Input type="number" min={1} max={50} value={radiusKm} onChange={(e) => setRadiusKm(parseInt(e.target.value) || 10)} />
                </div>
              </div>
            )}

            {/* Rental Platform Selection & Search */}
            {isRental && selectedHouseId && (
              <>
                <div className="space-y-2">
                  <Label>Immobilienportale</Label>
                  <div className="flex gap-3">
                    {platformOptions.map((platform) => (
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
                <Button
                  onClick={handleScrape}
                  disabled={isLoading || disabled || !selectedHouseId}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Analyse läuft...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Mietpreise analysieren
                    </>
                  )}
                </Button>
              </>
            )}
            {/* Tourist Results with Tabs */}
            {touristResults && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">
                    {touristResults.length} Angebote gefunden
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {format(checkIn, "dd.MM.", { locale: de })} – {format(checkOut, "dd.MM.yyyy", { locale: de })}, {guests} Pers.
                  </span>
                </div>
                {searchSummary && (
                  <p className="text-xs text-muted-foreground italic">{searchSummary}</p>
                )}

                {/* Tabs for portal filtering */}
                {resultsByPlatform && (
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="w-full grid grid-cols-3">
                      <TabsTrigger value="alle" className="text-xs">
                        Alle ({touristResults.length})
                      </TabsTrigger>
                      <TabsTrigger value="booking.com" className="text-xs">
                        <span className="w-2 h-2 rounded-full bg-blue-600 mr-1.5 inline-block"></span>
                        Booking ({bookingListings.length})
                      </TabsTrigger>
                      <TabsTrigger value="airbnb" className="text-xs">
                        <span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5 inline-block"></span>
                        Airbnb ({airbnbListings.length})
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="alle" className="mt-3">
                      {renderListings(touristResults)}
                    </TabsContent>
                    <TabsContent value="booking.com" className="mt-3">
                      {renderListings(bookingListings)}
                    </TabsContent>
                    <TabsContent value="airbnb" className="mt-3">
                      {renderListings(airbnbListings)}
                    </TabsContent>
                  </Tabs>
                )}

                {/* Fallback if no results_by_platform */}
                {!resultsByPlatform && renderListings(touristResults)}
              </div>
            )}

            {/* Rental Results */}
            {rentalResults && rentalResults.map((r, i) => (
              <div key={i} className="space-y-3">
                <Label className="text-base font-semibold">Mietpreisanalyse</Label>
                <div className="border rounded-lg p-3 space-y-2">
                  {r.avg_rent && (
                    <div className="flex justify-between text-sm">
                      <span>Ø Kaltmiete:</span>
                      <span className="font-medium">€{r.avg_rent.toLocaleString('de-DE')}</span>
                    </div>
                  )}
                  {r.price_per_sqm && (
                    <div className="flex justify-between text-sm">
                      <span>Ø €/qm:</span>
                      <span className="font-medium">€{r.price_per_sqm.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {(r.min_rent || r.max_rent) && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Spanne:</span>
                      <span>€{r.min_rent?.toLocaleString('de-DE')} – €{r.max_rent?.toLocaleString('de-DE')}</span>
                    </div>
                  )}
                  {r.comparable_count && (
                    <div className="text-xs text-muted-foreground">{r.comparable_count} Vergleichsobjekte gefunden</div>
                  )}

                  {r.comparables && r.comparables.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-xs font-medium">Gefundene Objekte:</div>
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
                                    {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                      {c.floor && <span>📍 {c.floor}</span>}
                                      {c.year_built && <span>🏗️ Baujahr {c.year_built}</span>}
                                      {c.available_from && <span>📅 Ab {c.available_from}</span>}
                                    </div>
                                    {c.features && c.features.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {c.features.map((f, fi) => (
                                          <Badge key={fi} variant="secondary" className="text-[10px] px-1.5 py-0">{f}</Badge>
                                        ))}
                                      </div>
                                    )}
                                    {c.listing_url && !c.listing_url.includes('...') && c.listing_url.length > 15 && (
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
              </div>
            ))}
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
