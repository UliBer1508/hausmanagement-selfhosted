import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Package, Trash2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLinenColorLabel, LinenColor, getItemColorLabel, ItemColor } from '@/types/linen';

// Artikel die eine Farbauswahl (weiß/grau) haben
const ITEMS_WITH_COLOR_SELECTION = [
  'bedding',         // Bettwäsche
  'large_towels',    // Badetücher
  'small_towels',    // Handtücher
  'bath_mats',       // Badvorleger
  'sink_towels',     // WB-Handtücher
  'sauna_towels'     // Saunatücher
];

interface LaundryOrderCardProps {
  order: any;
  colorVariant: 'green' | 'blue' | 'purple';
  isPending?: boolean;
  onEdit?: (order: any) => Promise<void> | void;
  onDelete?: (order: any) => Promise<void> | void;
  onConfirm?: (order: any) => Promise<void> | void;
}

const LaundryOrderCard = ({ order, colorVariant, isPending = false, onEdit, onDelete, onConfirm }: LaundryOrderCardProps) => {
  const getBorderColor = (variant: string) => {
    switch (variant) {
      case 'green':
        return 'border-l-green-500';
      case 'blue':
        return 'border-l-blue-500';
      case 'purple':
        return 'border-l-purple-500';
      default:
        return 'border-l-gray-500';
    }
  };

  const getStatusBadge = (status: string, isPending: boolean) => {
    if (isPending) {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">⏳ Ausstehend</Badge>;
    }
    switch (status) {
      case 'offen':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300">📝 Offen</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">⏳ Ausstehend</Badge>;
      case 'assigned':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">👤 Zugewiesen</Badge>;
      case 'in_progress':
      case 'in-progress':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300">🔄 In Bearbeitung</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 border-green-300">✅ Abgeschlossen</Badge>;
      case 'delivered':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">📦 Geliefert</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 border-red-300">❌ Storniert</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTotalItems = () => {
    // Handle both laundry_order_items (array) and linen order items (JSON object)
    if (order.laundry_order_items) {
      return order.laundry_order_items
        .filter((item: any) => item.quantity > 0)
        .reduce((sum: number, item: any) => sum + item.quantity, 0);
    } else if (order.items) {
      // For linen orders, items is a JSON object like {"kitchen_towels": 1}
      return Object.entries(order.items)
        .filter(([_, count]: [string, any]) => count > 0)
        .reduce((sum: number, [_, count]: [string, any]) => sum + count, 0);
    }
    return order.total_items || 0;
  };

  const houseName = order.houses?.name || 'Unbekannt';
  const houseAddress = order.houses?.address || '';
  const orderDate = order.order_date ? new Date(order.order_date).toLocaleDateString('de-DE') : '-';
  
  // Booking information
  const checkIn = order.bookings?.check_in ? new Date(order.bookings.check_in).toLocaleDateString('de-DE') : null;
  const checkOut = order.bookings?.check_out ? new Date(order.bookings.check_out).toLocaleDateString('de-DE') : null;
  const numberOfGuests = order.bookings?.number_of_guests || null;
  const guestName = order.bookings?.guest_name || null;

  return (
    <Card className={cn(
      `border-l-4 ${getBorderColor(colorVariant)} bg-laundry-bg relative`,
      isPending && "border-dashed opacity-90"
    )}>
      <CardContent className="p-3 relative pb-10">
        <div className="grid grid-cols-2 gap-4">
          {/* Left Column: House Info & Booking */}
          <div className="space-y-2">
            {/* Header with House Name */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">📦</span>
                <h4 className="font-medium text-sm">Wäschebestellung - {houseName}</h4>
              </div>
            </div>

            {/* House Address */}
            {houseAddress && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-base">📍</span>
                <span className="text-muted-foreground">{houseAddress}</span>
              </div>
            )}

            {/* Guest Name - über Buchung */}
            {guestName && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-base">👤</span>
                <span>
                  <span className="text-muted-foreground">Gast:</span> {guestName}
                </span>
              </div>
            )}

            {/* Booking Information - direkt unter Gastname */}
            {(checkIn || checkOut || numberOfGuests) && (
              <div className="space-y-1">
                {checkIn && checkOut && (
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-base">📅</span>
                    <span>
                      <span className="text-muted-foreground">Buchung:</span> {checkIn} - {checkOut}
                    </span>
                  </div>
                )}

                {numberOfGuests && (
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-base">👤</span>
                    <span>{numberOfGuests} {numberOfGuests === 1 ? 'Gast' : 'Gäste'}</span>
                  </div>
                )}
              </div>
            )}

            {/* Delivery Date - unter Gästeanzahl */}
            {order.delivery_date && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-base">🚚</span>
                <span>
                  <span className="text-muted-foreground">Lieferung:</span> {new Date(order.delivery_date).toLocaleDateString('de-DE')}
                </span>
              </div>
            )}

            {/* Linen Color */}
            {order.linen_color && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-base">🎨</span>
                <span>
                  <span className="text-muted-foreground">Farbe:</span> {getLinenColorLabel(order.linen_color as LinenColor)}
                </span>
              </div>
            )}
          </div>

          {/* Right Column: All Items */}
          <div className="space-y-2 text-sm">
            {order.pickup_date && (
              <div>
                <span className="text-muted-foreground">Abholung: </span>
                <span>{new Date(order.pickup_date).toLocaleDateString('de-DE')}</span>
              </div>
            )}

            {/* Items Table - Artikel mit Farbe und Anzahl */}
            {((order.laundry_order_items && order.laundry_order_items.length > 0) || order.items) && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium">Artikel ({getTotalItems()} gesamt):</p>
                
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left font-medium pb-1">Artikel</th>
                      <th className="text-center font-medium pb-1">Farbe</th>
                      <th className="text-right font-medium pb-1">Anz.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Handle laundry_order_items (array format) */}
                    {order.laundry_order_items && order.laundry_order_items
                      .filter((item: any) => item.quantity > 0)
                      .map((item: any) => (
                      <tr key={item.id}>
                        <td className="py-0.5">{item.item_name}</td>
                        <td className="text-center py-0.5 text-muted-foreground">-</td>
                        <td className="text-right text-muted-foreground py-0.5">{item.quantity}x</td>
                      </tr>
                    ))}
                    
                    {/* Handle linen order items (JSON object format) */}
                    {order.items && Object.entries(order.items)
                      .filter(([_, count]: [string, any]) => count > 0)
                      .map(([itemType, count]: [string, any]) => {
                        const itemVariants = order.item_variants as Record<string, ItemColor> | null;
                        const itemColor = itemVariants?.[itemType];
                        const hasColorSelection = ITEMS_WITH_COLOR_SELECTION.includes(itemType);
                        
                        const translateItemType = (type: string) => {
                          const translations: Record<string, string> = {
                            'kitchen_towels': 'Geschirrtücher',
                            'bedding': 'Bettwäsche',
                            'large_towels': 'Badetücher',
                            'small_towels': 'Handtücher',
                            'bath_mats': 'Badematten',
                            'sauna_towels': 'Saunatücher',
                            'sink_towels': 'WB-Handtücher',
                            'blankets': 'Decken',
                            'pillow_cases': 'Kissenbezüge'
                          };
                          return translations[type] || type;
                        };
                        
                        return (
                          <tr key={itemType}>
                            <td className="py-0.5">{translateItemType(itemType)}</td>
                            <td className="text-center py-0.5">
                              {hasColorSelection 
                                ? (itemColor ? getItemColorLabel(itemColor) : '⬜ Weiß')
                                : <span className="text-muted-foreground">-</span>
                              }
                            </td>
                            <td className="text-right text-muted-foreground py-0.5">{count}x</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {order.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Notizen:</p>
                <p className="text-xs">{order.notes}</p>
              </div>
            )}
          </div>
        </div>


        {/* Action Buttons - Top Right */}
        {!isPending && (onEdit || onDelete || (onConfirm && order.status === 'offen')) && (
          <div className="absolute top-2 right-2 flex gap-1 z-10">
            {/* Confirm Button - nur bei Status 'offen' */}
            {onConfirm && order.status === 'offen' && (
              <Button
                size="sm"
                className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await onConfirm(order);
                  } catch (error) {
                    console.error('Error in onConfirm:', error);
                  }
                }}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Bestätigen
              </Button>
            )}

            {/* Edit Button */}
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await onEdit(order);
                  } catch (error) {
                    console.error('Error in onEdit:', error);
                  }
                }}
              >
                <Edit className="w-4 h-4" />
              </Button>
            )}

            {/* Delete Button */}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (window.confirm('Möchten Sie diese Wäschebestellung wirklich löschen?')) {
                    try {
                      await onDelete(order);
                    } catch (error) {
                      console.error('Error in onDelete:', error);
                    }
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}

        {/* Status Badge - Bottom Right */}
        <div className="absolute bottom-2 right-2">
          {getStatusBadge(order.status, isPending)}
        </div>
      </CardContent>
    </Card>
  );
};

export default LaundryOrderCard;