import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Package } from 'lucide-react';

interface LaundryOrderCardProps {
  order: any;
  colorVariant: 'green' | 'blue' | 'purple';
  onEdit?: (order: any) => Promise<void> | void;
}

const LaundryOrderCard = ({ order, colorVariant, onEdit }: LaundryOrderCardProps) => {
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

  const getStatusBadge = (status: string) => {
    switch (status) {
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
      return order.laundry_order_items.reduce((sum: number, item: any) => sum + item.quantity, 0);
    } else if (order.items) {
      // For linen orders, items is a JSON object like {"kitchen_towels": 1}
      return Object.values(order.items).reduce((sum: number, count: any) => sum + count, 0);
    }
    return order.total_items || 0;
  };

  const houseName = order.houses?.name || 'Unbekannt';
  const orderDate = order.order_date ? new Date(order.order_date).toLocaleDateString('de-DE') : '-';

  return (
    <Card className={`border-l-4 ${getBorderColor(colorVariant)} bg-blue-50 relative`}>
      <CardContent className="p-3 relative pb-10">
        <div className="grid grid-cols-2 gap-4">
          {/* Left Column: Items & Dates */}
          <div className="space-y-2">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">📦</span>
                <h4 className="font-medium text-sm">Wäschebestellung - {houseName}</h4>
              </div>
            </div>

            {/* Items Summary */}
            <div className="text-sm">
              <span className="text-muted-foreground">Artikel gesamt: </span>
              <span className="font-medium">{getTotalItems()}</span>
            </div>

            {/* Items List */}
            {((order.laundry_order_items && order.laundry_order_items.length > 0) || order.items) && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Artikel:</p>
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {/* Handle laundry_order_items (array format) */}
                  {order.laundry_order_items && order.laundry_order_items.slice(0, 3).map((item: any) => (
                    <div key={item.id} className="flex gap-1 text-xs">
                      <span className="truncate">{item.item_name}:</span>
                      <span className="text-muted-foreground flex-shrink-0">{item.quantity}x</span>
                    </div>
                  ))}
                  
                  {/* Handle linen order items (JSON object format) */}
                  {order.items && Object.entries(order.items).slice(0, 3).map(([itemType, count]: [string, any]) => (
                    <div key={itemType} className="flex gap-1 text-xs">
                      <span className="truncate">
                        {itemType === 'kitchen_towels' ? 'Küchentücher' : 
                         itemType === 'bedding' ? 'Bettwäsche' :
                         itemType === 'large_towels' ? 'Große Handtücher' :
                         itemType === 'small_towels' ? 'Kleine Handtücher' :
                         itemType === 'bath_mats' ? 'Badematten' :
                         itemType === 'sauna_towels' ? 'Saunatücher' :
                         itemType === 'sink_towels' ? 'Waschbeckentücher' :
                         itemType}:
                      </span>
                      <span className="text-muted-foreground flex-shrink-0">{count}x</span>
                    </div>
                  ))}
                  
                  {/* Show "more items" indicator */}
                  {order.laundry_order_items && order.laundry_order_items.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      ... und {order.laundry_order_items.length - 3} weitere
                    </p>
                  )}
                  {order.items && Object.keys(order.items).length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      ... und {Object.keys(order.items).length - 3} weitere
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Dates */}
            {(order.pickup_date || order.delivery_date) && (
              <div className="text-xs space-y-1">
                {order.pickup_date && (
                  <div className="flex gap-1">
                    <span className="text-muted-foreground">Abholung:</span>
                    <span>{order.pickup_date}</span>
                  </div>
                )}
                {order.delivery_date && (
                  <div className="flex gap-1">
                    <span className="text-muted-foreground">Lieferung:</span>
                    <span>{order.delivery_date}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Order Details */}
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Bestelldatum: </span>
              <span>{orderDate}</span>
            </div>

            {order.delivery_type && (
              <div>
                <span className="text-muted-foreground">Lieferart: </span>
                <span>{order.delivery_type === 'delivery' ? '🚚 Lieferung' : '🏪 Abholung'}</span>
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

        {/* Edit Button - Top Right */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-8 w-8 p-0 z-10"
          onClick={async (e) => {
            e.stopPropagation();
            if (onEdit) {
              try {
                await onEdit(order);
              } catch (error) {
                console.error('❌ Error in onEdit:', error);
              }
            }
          }}
        >
          <Edit className="w-4 h-4" />
        </Button>

        {/* Status Badge - Bottom Right */}
        <div className="absolute bottom-2 right-2">
          {getStatusBadge(order.status)}
        </div>
      </CardContent>
    </Card>
  );
};

export default LaundryOrderCard;