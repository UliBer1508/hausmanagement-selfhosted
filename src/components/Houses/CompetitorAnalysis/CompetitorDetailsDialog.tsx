import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, MapPin, Users, BedDouble, Bath, Star, Calendar } from "lucide-react";
import { CompetitorProperty } from "@/hooks/useCompetitorAnalysis";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface CompetitorDetailsDialogProps {
  competitor: CompetitorProperty;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const platformColors: Record<string, string> = {
  'booking.com': 'bg-blue-600',
  'airbnb': 'bg-pink-600',
  'vrbo': 'bg-purple-600',
  'fewo-direkt': 'bg-orange-600',
  'other': 'bg-gray-600',
};

const CompetitorDetailsDialog = ({ competitor, open, onOpenChange }: CompetitorDetailsDialogProps) => {
  const { data: pricingHistory } = useQuery({
    queryKey: ['competitor-pricing-history', competitor.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_pricing')
        .select('*')
        .eq('competitor_property_id', competitor.id)
        .order('scraped_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const amenities = Array.isArray(competitor.amenities) ? competitor.amenities as string[] : [];
  const googleMapsUrl = competitor.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(competitor.address)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl">{competitor.property_name}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">von {competitor.competitor_name}</p>
            </div>
            <div className="flex gap-2 items-center">
              {competitor.platform && (
                <Badge className={platformColors[competitor.platform] || platformColors.other}>
                  {competitor.platform}
                </Badge>
              )}
              {competitor.property_url && (
                <Button size="sm" variant="outline" onClick={() => window.open(competitor.property_url, '_blank')}>
                  <ExternalLink className="w-4 h-4 mr-1" /> Öffnen
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-100px)]">
          <div className="px-6 pb-6 space-y-5">
            {/* Bewertungen */}
            {competitor.rating && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                    <span className="text-lg font-semibold">{competitor.rating}/10</span>
                  </div>
                  {competitor.normalized_rating && (
                    <span className="text-sm text-muted-foreground">(normalisiert: {competitor.normalized_rating.toFixed(1)})</span>
                  )}
                  {competitor.review_count != null && competitor.review_count > 0 && (
                    <span className="text-sm text-muted-foreground">• {competitor.review_count} Bewertungen</span>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Lage */}
            {(competitor.address || competitor.distance_km) && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" /> Lage
                  </h3>
                  {competitor.address && (
                    <p className="text-sm text-muted-foreground">
                      {googleMapsUrl ? (
                        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                          {competitor.address}
                        </a>
                      ) : competitor.address}
                    </p>
                  )}
                  {competitor.distance_km && (
                    <p className="text-sm text-muted-foreground mt-1">Entfernung: {competitor.distance_km} km</p>
                  )}
                </div>
                <Separator />
              </>
            )}

            {/* Immobilien-Details */}
            {(competitor.max_guests || competitor.bedrooms || competitor.bathrooms) && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Immobilien-Details</h3>
                  <div className="flex flex-wrap gap-4">
                    {competitor.max_guests && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span>{competitor.max_guests} Gäste</span>
                      </div>
                    )}
                    {competitor.bedrooms && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <BedDouble className="w-4 h-4 text-muted-foreground" />
                        <span>{competitor.bedrooms} Schlafzimmer</span>
                      </div>
                    )}
                    {competitor.bathrooms && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Bath className="w-4 h-4 text-muted-foreground" />
                        <span>{competitor.bathrooms} Badezimmer</span>
                      </div>
                    )}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Ausstattung */}
            {amenities.length > 0 && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Ausstattung</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {amenities.map((amenity, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{amenity}</Badge>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Notizen */}
            {competitor.notes && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Notizen</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{competitor.notes}</p>
                </div>
                <Separator />
              </>
            )}

            {/* Preishistorie */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Calendar className="w-4 h-4" /> Preishistorie
              </h3>
              {pricingHistory && pricingHistory.length > 0 ? (
                <div className="space-y-2">
                  {pricingHistory.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-2">
                      <div>
                        <span>
                          {p.check_in_date && p.check_out_date
                            ? `${format(new Date(p.check_in_date), 'dd.MM.yy', { locale: de })} – ${format(new Date(p.check_out_date), 'dd.MM.yy', { locale: de })}`
                            : '–'}
                        </span>
                        {p.nights && <span className="text-muted-foreground ml-2">({p.nights} Nächte)</span>}
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-primary">
                          €{p.final_price_7nights ?? p.base_price_7nights ?? '–'}
                        </span>
                        {p.scraped_at && (
                          <span className="text-xs text-muted-foreground ml-2">
                            {format(new Date(p.scraped_at), 'dd.MM.yy', { locale: de })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Keine Preisdaten vorhanden.</p>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CompetitorDetailsDialog;
