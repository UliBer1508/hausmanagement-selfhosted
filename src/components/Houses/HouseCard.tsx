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
      { key: 'large_towels', label: 'Badetücher', count: linenStock.large_towels || 0 },
      { key: 'small_towels', label: 'Handtücher', count: linenStock.small_towels || 0 },
      { key: 'sauna_towels', label: 'Saunatücher', count: linenStock.sauna_towels || 0 },
      { key: 'bath_mats', label: 'Badematten', count: linenStock.bath_mats || 0 },
      { key: 'sink_towels', label: 'WB-Handtücher', count: linenStock.sink_towels || 0 },
    ];
    
    return items.filter(item => item.count > 0);
  };

  // Format tenant info dates
  const formatTenantDate = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString('de-DE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  // Get payment method label
  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      'bank_transfer': 'Überweisung',
      'cash': 'Bar',
      'direct_debit': 'Lastschrift'
    };
    return labels[method] || method;
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
              
              {/* Property Type & Rental Type Badges */}
              <div className="flex gap-2 mb-2">
                <Badge variant="secondary">
                  {house.property_type === 'house' && '🏠 Haus'}
                  {house.property_type === 'apartment' && '🏢 Wohnung'}
                  {house.property_type === 'studio' && '🛏️ Studio'}
                  {house.property_type === 'other' && '🏗️ Sonstige'}
                  {!house.property_type && '🏠 Haus'}
                </Badge>
                <Badge variant={house.rental_type === 'tourist' || !house.rental_type ? 'default' : 'outline'}>
                  {house.rental_type === 'long_term' && '🏘️ Festvermietung'}
                  {(house.rental_type === 'tourist' || !house.rental_type) && '🏖️ Touristisch'}
                </Badge>
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

            {/* Linen Inventory - nur für touristische Vermietungen */}
            {(house.rental_type === 'tourist' || !house.rental_type) && (
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
            )}

            {/* Tenant Info - nur für Festvermietungen */}
            {house.rental_type === 'long_term' && house.tenant_info && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Mietvertrag</h4>
                </div>
                
                <div className="space-y-3 text-sm">
                  {/* Mieter-Informationen */}
                  <div>
                    <h5 className="font-medium text-xs uppercase text-muted-foreground mb-1.5">Mieter</h5>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Name:</span>
                        <span className="font-medium">{house.tenant_info.tenant_name || 'Nicht angegeben'}</span>
                      </div>
                      {house.tenant_info.tenant_email && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Email:</span>
                          <a 
                            href={`mailto:${house.tenant_info.tenant_email}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {house.tenant_info.tenant_email}
                          </a>
                        </div>
                      )}
                      {house.tenant_info.tenant_phone && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Telefon:</span>
                          <a 
                            href={`tel:${house.tenant_info.tenant_phone}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {house.tenant_info.tenant_phone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Vertragsdaten */}
                  {(house.tenant_info.contract_start || house.tenant_info.contract_end) && (
                    <div>
                      <h5 className="font-medium text-xs uppercase text-muted-foreground mb-1.5">Vertrag</h5>
                      <div className="space-y-1">
                        {house.tenant_info.contract_start && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Beginn:</span>
                            <span className="font-medium">{formatTenantDate(house.tenant_info.contract_start)}</span>
                          </div>
                        )}
                        {house.tenant_info.contract_end ? (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Ende:</span>
                            <span className="font-medium">{formatTenantDate(house.tenant_info.contract_end)}</span>
                          </div>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Laufzeit:</span>
                            <Badge variant="secondary" className="text-xs">Unbefristet</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Finanzielle Details */}
                  {(house.tenant_info.monthly_rent || house.tenant_info.deposit_amount) && (
                    <div>
                      <h5 className="font-medium text-xs uppercase text-muted-foreground mb-1.5">Finanzen</h5>
                      <div className="space-y-1">
                        {house.tenant_info.monthly_rent && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Miete:</span>
                            <span className="font-medium">
                              {new Intl.NumberFormat('de-DE', {
                                style: 'currency',
                                currency: 'EUR'
                              }).format(house.tenant_info.monthly_rent)} / Monat
                            </span>
                          </div>
                        )}
                        {house.tenant_info.deposit_amount && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Kaution:</span>
                            <span className="font-medium">
                              {new Intl.NumberFormat('de-DE', {
                                style: 'currency',
                                currency: 'EUR'
                              }).format(house.tenant_info.deposit_amount)}
                            </span>
                          </div>
                        )}
                        {house.tenant_info.payment_day && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Zahltag:</span>
                            <span className="font-medium">{house.tenant_info.payment_day}. des Monats</span>
                          </div>
                        )}
                        {house.tenant_info.payment_method && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Zahlungsart:</span>
                            <span className="font-medium">{getPaymentMethodLabel(house.tenant_info.payment_method)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notizen */}
                  {house.tenant_info.notes && (
                    <div>
                      <h5 className="font-medium text-xs uppercase text-muted-foreground mb-1.5">Notizen</h5>
                      <p className="text-xs text-muted-foreground italic">{house.tenant_info.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Fallback wenn keine tenant_info vorhanden */}
            {house.rental_type === 'long_term' && !house.tenant_info && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Mietvertrag</h4>
                </div>
                <p className="text-sm text-muted-foreground">Keine Mietvertragsdaten hinterlegt</p>
              </div>
            )}

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