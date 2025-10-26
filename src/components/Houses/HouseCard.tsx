import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Edit, RefreshCw, Trash2, Users, MapPin, Package, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import EditHouseDialog from './EditHouseDialog';
import CompetitorAnalysisDashboard from './CompetitorAnalysis/CompetitorAnalysisDashboard';

interface HouseCardProps {
  house: any;
  inventoryCount: {
    total: number;
    categories: Record<string, number>;
  };
}

const HouseCard = ({ house, inventoryCount }: HouseCardProps) => {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showPriceAnalysis, setShowPriceAnalysis] = useState(false);

  // Calculate total linen items
  const getTotalLinenItems = (linenStock: any) => {
    if (!linenStock) return 0;
    return Object.values(linenStock as Record<string, number>).reduce((sum, count) => sum + count, 0);
  };

  // Get linen breakdown for display
  const getLinenBreakdown = (linenStock: any) => {
    if (!linenStock) return [];
    
    const items = [
      { key: 'bedding', label: 'Bettwäsche', count: linenStock.bedding || 0 },
      { key: 'large_towels', label: 'Handtücher groß', count: linenStock.large_towels || 0 },
      { key: 'small_towels', label: 'Handtücher klein', count: linenStock.small_towels || 0 },
      { key: 'sauna_towels', label: 'Saunatücher', count: linenStock.sauna_towels || 0 },
      { key: 'bath_mats', label: 'Badematten', count: linenStock.bath_mats || 0 },
      { key: 'sink_towels', label: 'WB-Handtücher', count: linenStock.sink_towels || 0 },
    ];
    
    return items.filter(item => item.count > 0);
  };

  const totalLinenItems = getTotalLinenItems(house.linen_stock);
  const linenBreakdown = getLinenBreakdown(house.linen_stock);

  return (
    <>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        {/* House Image */}
        {house.image_url && (
          <div className="aspect-video overflow-hidden">
            <img
              src={house.image_url}
              alt={house.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        <CardContent className="p-6">
          {/* House Info */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xl font-semibold">{house.name}</h3>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditDialogOpen(true)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex items-center text-sm text-muted-foreground mb-2">
                <MapPin className="w-4 h-4 mr-1" />
                {house.address}
              </div>
              
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center">
                  <Users className="w-4 h-4 mr-1" />
                  <span>Max. Gäste: {house.max_guests}</span>
                </div>
                <div className="flex items-center">
                  <Package className="w-4 h-4 mr-1" />
                  <span>Inventar: {inventoryCount.total} Teile</span>
                </div>
              </div>

              {/* Property Details */}
              {(house.bedrooms || house.living_area_sqm) && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {house.bedrooms && <span>🛏️ {house.bedrooms} Schlafzimmer</span>}
                  {house.living_area_sqm && <span>📐 {house.living_area_sqm} qm</span>}
                </div>
              )}

              {/* Amenities */}
              {house.amenities && Object.values(house.amenities).some(v => v) && (
                <div className="flex flex-wrap gap-1.5">
                  {house.amenities.sauna && (
                    <Badge variant="secondary" className="text-xs">🧖 Sauna</Badge>
                  )}
                  {house.amenities.terrace && (
                    <Badge variant="secondary" className="text-xs">☀️ Terrasse</Badge>
                  )}
                  {house.amenities.ski_cellar && (
                    <Badge variant="secondary" className="text-xs">⛷️ Skikeller</Badge>
                  )}
                  {house.amenities.glacier_view && (
                    <Badge variant="secondary" className="text-xs">🏔️ Gletscherblick</Badge>
                  )}
                  {house.amenities.garage_spaces > 0 && (
                    <Badge variant="secondary" className="text-xs">🚗 Garage ({house.amenities.garage_spaces})</Badge>
                  )}
                  {house.amenities.additional_toilet && (
                    <Badge variant="secondary" className="text-xs">🚻 Zusätzliche Toilette</Badge>
                  )}
                </div>
              )}
            </div>

            {/* Linen Inventory */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Wäschebestand ({totalLinenItems} Teile)</h4>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                {linenBreakdown.map((item) => (
                  <div key={item.key} className="flex justify-between">
                    <span className="text-muted-foreground">{item.label}:</span>
                    <span className="font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
              
              {linenBreakdown.length === 0 && (
                <p className="text-sm text-muted-foreground">Keine Wäsche definiert</p>
              )}
            </div>

            {/* Inventory Categories */}
            {Object.keys(inventoryCount.categories).length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Inventar-Kategorien</h4>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(inventoryCount.categories).map(([category, count]) => (
                    <Badge key={category} variant="secondary" className="text-xs">
                      {category}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Price Analysis Button */}
            <Button 
              onClick={() => setShowPriceAnalysis(true)}
              variant="outline"
              className="w-full"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Preisanalyse
            </Button>
          </div>
        </CardContent>
      </Card>

      <EditHouseDialog
        house={house}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />

      <Dialog open={showPriceAnalysis} onOpenChange={setShowPriceAnalysis}>
        <DialogContent className="max-w-[95vw] h-[90vh] overflow-auto">
          <CompetitorAnalysisDashboard 
            house_id={house.id} 
            house_name={house.name}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default HouseCard;