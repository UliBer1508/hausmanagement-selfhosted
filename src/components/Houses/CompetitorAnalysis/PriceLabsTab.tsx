import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Link2, Unlink, TrendingUp, BarChart3, Activity, Clock, AlertCircle } from "lucide-react";
import { 
  usePriceLabsListings, 
  useLinkedListings, 
  useLinkListing, 
  useUnlinkListing,
  useSyncNeighborhood, 
  usePriceLabsMarketData,
  PriceLabsListing 
} from "@/hooks/usePriceLabs";
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface PriceLabsTabProps {
  house_id: string;
}

const PriceLabsTab = ({ house_id }: PriceLabsTabProps) => {
  const [selectedListingId, setSelectedListingId] = useState<string>('');
  
  const { data: availableListings, isLoading: listingsLoading, refetch: refetchListings } = usePriceLabsListings();
  const { data: linkedListings, isLoading: linkedLoading } = useLinkedListings(house_id);
  const { data: marketData, isLoading: marketLoading } = usePriceLabsMarketData(house_id);
  
  const linkMutation = useLinkListing();
  const unlinkMutation = useUnlinkListing();
  const syncMutation = useSyncNeighborhood();

  const handleLink = () => {
    if (!selectedListingId || !availableListings) return;
    const listing = availableListings.find(l => (l.listing_id || l.id) === selectedListingId);
    if (listing) {
      linkMutation.mutate({ house_id, listing });
      setSelectedListingId('');
    }
  };

  const handleSync = (listing_id: string, pms?: string) => {
    syncMutation.mutate({ house_id, listing_id, pms: pms || undefined });
  };

  const neighborhood = marketData?.neighborhood_data;

  return (
    <div className="space-y-6">
      {/* Listing-Verknüpfung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            PriceLabs Listings verknüpfen
          </CardTitle>
          <CardDescription>
            Verknüpfen Sie Ihre PriceLabs-Listings mit diesem Haus für Marktdaten
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bereits verknüpfte Listings */}
          {linkedListings && linkedListings.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Verknüpfte Listings:</p>
              {linkedListings.map(linked => (
                <div key={linked.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{linked.listing_name || linked.pricelabs_listing_id}</span>
                      {linked.pms_name && (
                        <Badge variant="secondary" className="text-xs">{linked.pms_name}</Badge>
                      )}
                      {linked.health_score && (
                        <Badge 
                          variant={linked.health_score === 'good' ? 'default' : 'destructive'}
                          className="text-xs"
                        >
                          Health: {linked.health_score}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                      {linked.base_price && <span>Basis: €{linked.base_price}</span>}
                      {linked.min_price && <span>Min: €{linked.min_price}</span>}
                      {linked.max_price && <span>Max: €{linked.max_price}</span>}
                      {linked.last_synced_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Zuletzt: {format(new Date(linked.last_synced_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(linked.pricelabs_listing_id, linked.pms_name || undefined)}
                      disabled={syncMutation.isPending}
                    >
                      <RefreshCw className={`w-4 h-4 mr-1 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                      Sync
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unlinkMutation.mutate({ id: linked.id, house_id })}
                      disabled={unlinkMutation.isPending}
                    >
                      <Unlink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Neues Listing verknüpfen */}
          <div className="flex gap-2">
            <Select value={selectedListingId} onValueChange={setSelectedListingId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={
                  listingsLoading ? "Lade Listings..." : 
                  availableListings?.length ? "PriceLabs Listing auswählen..." : 
                  "Keine Listings verfügbar"
                } />
              </SelectTrigger>
              <SelectContent>
                {availableListings?.map(listing => (
                  <SelectItem key={listing.listing_id || listing.id} value={listing.listing_id || listing.id}>
                    {listing.name} ({listing.pms})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              onClick={handleLink} 
              disabled={!selectedListingId || linkMutation.isPending}
            >
              <Link2 className="w-4 h-4 mr-1" />
              Verknüpfen
            </Button>
            <Button 
              variant="outline"
              onClick={() => refetchListings()}
              disabled={listingsLoading}
            >
              <RefreshCw className={`w-4 h-4 ${listingsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Hinweis wenn kein API-Key */}
          {availableListings === undefined && !listingsLoading && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">PriceLabs API-Key fehlt</p>
                <p className="text-amber-700 dark:text-amber-300 mt-1">
                  Bitte hinterlegen Sie Ihren PriceLabs API-Key in den Supabase Secrets (PRICELABS_API_KEY), 
                  um die Integration zu nutzen.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Marktdaten Dashboard */}
      {neighborhood && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {neighborhood.occupancy_rate !== undefined && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Activity className="w-4 h-4" />
                  Auslastung
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.round(neighborhood.occupancy_rate * 100)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">Marktdurchschnitt</p>
              </CardContent>
            </Card>
          )}

          {neighborhood.median_price !== undefined && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  Medianpreis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  €{Math.round(neighborhood.median_price)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">pro Nacht im Markt</p>
              </CardContent>
            </Card>
          )}

          {neighborhood.demand_score !== undefined && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <BarChart3 className="w-4 h-4" />
                  Nachfrage-Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {neighborhood.demand_score}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {neighborhood.demand_score > 7 ? 'Hohe Nachfrage' :
                   neighborhood.demand_score > 4 ? 'Mittlere Nachfrage' : 'Niedrige Nachfrage'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Comp Set Data */}
      {neighborhood?.comp_set && (
        <Card>
          <CardHeader>
            <CardTitle>Wettbewerber-Set (PriceLabs)</CardTitle>
            <CardDescription>
              Automatisch erkannte vergleichbare Properties in Ihrer Region
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4">Property</th>
                    <th className="text-right py-2 px-4">Preis/Nacht</th>
                    <th className="text-right py-2 px-4">Bewertung</th>
                    <th className="text-right py-2 pl-4">Auslastung</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(neighborhood.comp_set) ? neighborhood.comp_set : []).map((comp: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4">{comp.name || `Comp ${i + 1}`}</td>
                      <td className="text-right py-2 px-4">€{Math.round(comp.price || 0)}</td>
                      <td className="text-right py-2 px-4">{comp.rating || '-'}</td>
                      <td className="text-right py-2 pl-4">
                        {comp.occupancy ? `${Math.round(comp.occupancy * 100)}%` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw Neighborhood Data als Fallback */}
      {neighborhood && !neighborhood.comp_set && !neighborhood.occupancy_rate && (
        <Card>
          <CardHeader>
            <CardTitle>Marktdaten (Rohdaten)</CardTitle>
            <CardDescription>
              Zuletzt geladen: {marketData?.fetched_at ? format(new Date(marketData.fetched_at), 'dd.MM.yyyy HH:mm', { locale: de }) : '-'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto max-h-96">
              {JSON.stringify(neighborhood, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Leerer State */}
      {!neighborhood && !marketLoading && linkedListings && linkedListings.length > 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Keine Marktdaten vorhanden</p>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
              Klicken Sie bei einem verknüpften Listing auf "Sync", um Marktdaten abzurufen.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PriceLabsTab;
