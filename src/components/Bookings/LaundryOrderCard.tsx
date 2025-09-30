import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Package } from 'lucide-react';

interface LaundryOrderCardProps {
  order: any;
  colorVariant: 'green' | 'blue' | 'purple';
}

const LaundryOrderCard = ({ order, colorVariant }: LaundryOrderCardProps) => {
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
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Ausstehend</Badge>;
      case 'assigned':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Zugewiesen</Badge>;
      case 'in_progress':
        return <Badge className="bg-orange-100 text-orange-800 border-orange-300">In Bearbeitung</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Abgeschlossen</Badge>;
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

  return (
    <Card className={`border-l-4 ${getBorderColor(colorVariant)} bg-green-50 relative`}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              <h4 className="font-medium">Wäschebestellung</h4>
            </div>
            {getStatusBadge(order.status)}
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
                {order.laundry_order_items && order.laundry_order_items.slice(0, 3).map((item: any, index: number) => (
                  <div key={item.id} className="flex justify-between text-xs">
                    <span>{item.item_name}</span>
                    <span className="text-muted-foreground">{item.quantity}x</span>
                  </div>
                ))}
                
                {/* Handle linen order items (JSON object format) */}
                {order.items && Object.entries(order.items).slice(0, 3).map(([itemType, count]: [string, any], index: number) => (
                  <div key={itemType} className="flex justify-between text-xs">
                    <span>
                      {itemType === 'kitchen_towels' ? 'Küchentücher' : 
                       itemType === 'bedding' ? 'Bettwäsche' :
                       itemType === 'large_towels' ? 'Große Handtücher' :
                       itemType === 'small_towels' ? 'Kleine Handtücher' :
                       itemType === 'bath_mats' ? 'Badematten' :
                       itemType === 'sauna_towels' ? 'Saunatücher' :
                       itemType === 'sink_towels' ? 'Waschbeckentücher' :
                       itemType}
                    </span>
                    <span className="text-muted-foreground">{count}x</span>
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Abholung:</span>
                  <span>{order.pickup_date}</span>
                </div>
              )}
              {order.delivery_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lieferung:</span>
                  <span>{order.delivery_date}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit Button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-8 w-8 p-0"
        >
          <Edit className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
};

export default LaundryOrderCard;