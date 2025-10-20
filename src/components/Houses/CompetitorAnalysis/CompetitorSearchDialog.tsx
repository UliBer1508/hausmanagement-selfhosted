import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Plus, RefreshCw } from "lucide-react";
import { useSearchCompetitors, useAddCompetitor } from "@/hooks/useCompetitorAnalysis";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface CompetitorSearchDialogProps {
  house_id: string;
}

const CompetitorSearchDialog = ({ house_id }: CompetitorSearchDialogProps) => {
  const [open, setOpen] = useState(false);
  const [searchRadius, setSearchRadius] = useState(10);
  const [minRating, setMinRating] = useState(8.5);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['booking.com', 'airbnb']);
  const [selectedPropertyTypes, setSelectedPropertyTypes] = useState<string[]>(['chalet', 'ferienhaus']);

  const searchMutation = useSearchCompetitors();
  const addMutation = useAddCompetitor();

  const handleSearch = async () => {
    if (selectedPlatforms.length === 0) {
      return;
    }
    
    const result = await searchMutation.mutateAsync({ 
      house_id, 
      search_radius_km: searchRadius,
      min_rating: minRating,
      platforms: selectedPlatforms,
      property_types: selectedPropertyTypes
    });
    
    if (result.competitors) {
      setSearchResults(result.competitors);
    }
  };

  const handleAddCompetitor = async (competitor: any) => {
    await addMutation.mutateAsync({
      house_id,
      competitor_data: competitor,
      enable_scraping: true
    });
    
    // Entferne aus Suchergebnissen
    setSearchResults(prev => prev.filter(c => 
      c.property_name !== competitor.property_name
    ));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Search className="w-4 h-4 mr-2" />
          Wettbewerber suchen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Wettbewerber suchen</DialogTitle>
          <DialogDescription>
            Finden Sie vergleichbare Ferienhäuser in Ihrer Umgebung mit KI-Unterstützung
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Suchparameter */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="radius">Suchradius: {searchRadius} km</Label>
              <Input
                id="radius"
                type="range"
                min="5"
                max="50"
                step="5"
                value={searchRadius}
                onChange={(e) => setSearchRadius(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="minRating">Mindest-Bewertung: {minRating}/10</Label>
              <Input
                id="minRating"
                type="range"
                min="7.0"
                max="10.0"
                step="0.5"
                value={minRating}
                onChange={(e) => setMinRating(parseFloat(e.target.value))}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Nur Premium-Objekte ab {minRating}/10
              </p>
            </div>
          </div>

          {/* Plattform-Auswahl */}
          <div className="space-y-2">
            <Label>Plattformen durchsuchen:</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPlatforms.includes('booking.com')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPlatforms([...selectedPlatforms, 'booking.com']);
                    } else {
                      setSelectedPlatforms(selectedPlatforms.filter(p => p !== 'booking.com'));
                    }
                  }}
                  className="w-4 h-4"
                />
                <span>Booking.com</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPlatforms.includes('airbnb')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPlatforms([...selectedPlatforms, 'airbnb']);
                    } else {
                      setSelectedPlatforms(selectedPlatforms.filter(p => p !== 'airbnb'));
                    }
                  }}
                  className="w-4 h-4"
                />
                <span>Airbnb</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Mindestens eine Plattform muss ausgewählt sein
            </p>
          </div>

          {/* Objekttyp-Auswahl */}
          <div className="space-y-2">
            <Label>Objekttyp:</Label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPropertyTypes.includes('chalet')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPropertyTypes([...selectedPropertyTypes, 'chalet']);
                    } else {
                      setSelectedPropertyTypes(selectedPropertyTypes.filter(t => t !== 'chalet'));
                    }
                  }}
                  className="w-4 h-4"
                />
                <span>Chalet</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPropertyTypes.includes('ferienhaus')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPropertyTypes([...selectedPropertyTypes, 'ferienhaus']);
                    } else {
                      setSelectedPropertyTypes(selectedPropertyTypes.filter(t => t !== 'ferienhaus'));
                    }
                  }}
                  className="w-4 h-4"
                />
                <span>Ferienhaus</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPropertyTypes.includes('ferienwohnung')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPropertyTypes([...selectedPropertyTypes, 'ferienwohnung']);
                    } else {
                      setSelectedPropertyTypes(selectedPropertyTypes.filter(t => t !== 'ferienwohnung'));
                    }
                  }}
                  className="w-4 h-4"
                />
                <span>Ferienwohnung</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Mehrfachauswahl möglich
            </p>
          </div>

          <Button 
            onClick={handleSearch} 
            disabled={searchMutation.isPending || selectedPlatforms.length === 0}
            className="w-full"
          >
            {searchMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Suche läuft...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Wettbewerber finden
              </>
            )}
          </Button>

          {/* Suchergebnisse */}
          {searchResults.length > 0 && (
            <div className="space-y-3 mt-6">
              <h3 className="font-semibold text-sm text-muted-foreground">
                {searchResults.length} Wettbewerber gefunden
              </h3>
              
              {searchResults.map((competitor, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {competitor.property_name}
                        </CardTitle>
                        <CardDescription className="text-sm mt-1">
                          {competitor.address}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">
                        {competitor.distance_km}km
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {competitor.rating && (
                        <Badge variant={competitor.normalized_rating >= 9 ? "default" : "secondary"}>
                          ⭐ {competitor.rating}/10
                          {competitor.review_count && ` (${competitor.review_count})`}
                        </Badge>
                      )}
                      {competitor.platform && (
                        <Badge variant="outline">{competitor.platform}</Badge>
                      )}
                      {competitor.max_guests && (
                        <Badge variant="outline">{competitor.max_guests} Gäste</Badge>
                      )}
                      {competitor.bedrooms && (
                        <Badge variant="outline">{competitor.bedrooms} SZ</Badge>
                      )}
                      {competitor.estimated_price && (
                        <Badge className="bg-green-600">
                          ~€{competitor.estimated_price}/Nacht
                        </Badge>
                      )}
                    </div>

                    {competitor.amenities && competitor.amenities.length > 0 && (
                      <p className="text-xs text-muted-foreground mb-3">
                        {competitor.amenities.slice(0, 5).join(', ')}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAddCompetitor(competitor)}
                        disabled={addMutation.isPending}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Hinzufügen
                      </Button>
                      {competitor.property_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(competitor.property_url, '_blank')}
                        >
                          Ansehen
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {searchMutation.isSuccess && searchResults.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>Keine Wettbewerber gefunden.</p>
              <p className="text-sm mt-2">Versuchen Sie einen größeren Suchradius.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CompetitorSearchDialog;
