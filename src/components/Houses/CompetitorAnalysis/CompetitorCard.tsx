import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Trash2, MapPin } from "lucide-react";
import { CompetitorProperty, useDeleteCompetitor } from "@/hooks/useCompetitorAnalysis";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface CompetitorCardProps {
  competitor: CompetitorProperty;
  house_id: string;
}

const CompetitorCard = ({ competitor, house_id }: CompetitorCardProps) => {
  const deleteMutation = useDeleteCompetitor();

  const handleDelete = () => {
    deleteMutation.mutate({ 
      competitor_id: competitor.id, 
      house_id 
    });
  };

  const platformColors: { [key: string]: string } = {
    'booking.com': 'bg-blue-600',
    'airbnb': 'bg-pink-600',
    'vrbo': 'bg-purple-600',
    'fewo-direkt': 'bg-orange-600',
    'other': 'bg-gray-600'
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">{competitor.property_name}</CardTitle>
            <CardDescription className="text-sm mt-1">
              von {competitor.competitor_name}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {competitor.property_url && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open(competitor.property_url, '_blank')}
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Wettbewerber löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Möchten Sie "{competitor.property_name}" wirklich aus Ihrer Wettbewerbsanalyse entfernen?
                    Alle zugehörigen Preisdaten werden gelöscht.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    Löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Platform & Distance */}
        <div className="flex flex-wrap gap-2">
          {competitor.platform && (
            <Badge className={platformColors[competitor.platform] || platformColors.other}>
              {competitor.platform}
            </Badge>
          )}
          {competitor.distance_km && (
            <Badge variant="secondary">
              <MapPin className="w-3 h-3 mr-1" />
              {competitor.distance_km} km
            </Badge>
          )}
        </div>

        {/* Address */}
        {competitor.address && (
          <p className="text-sm text-muted-foreground">{competitor.address}</p>
        )}

        {/* Property Details */}
        <div className="flex flex-wrap gap-2 text-sm">
          {competitor.max_guests && (
            <span className="text-muted-foreground">
              👥 {competitor.max_guests} Gäste
            </span>
          )}
          {competitor.bedrooms && (
            <span className="text-muted-foreground">
              🛏️ {competitor.bedrooms} SZ
            </span>
          )}
          {competitor.bathrooms && (
            <span className="text-muted-foreground">
              🚿 {competitor.bathrooms} Bad
            </span>
          )}
        </div>

        {/* Amenities */}
        {competitor.amenities && competitor.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {competitor.amenities.slice(0, 6).map((amenity, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {amenity}
              </Badge>
            ))}
            {competitor.amenities.length > 6 && (
              <Badge variant="outline" className="text-xs">
                +{competitor.amenities.length - 6}
              </Badge>
            )}
          </div>
        )}

        {/* Notes */}
        {competitor.notes && (
          <p className="text-sm text-muted-foreground italic border-l-2 border-muted pl-3">
            {competitor.notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default CompetitorCard;
