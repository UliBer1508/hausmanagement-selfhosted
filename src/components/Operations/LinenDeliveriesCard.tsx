import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shirt, Package } from 'lucide-react';
import { LinenDeliveryData } from '@/hooks/useOperationsDashboard';
import { format, isToday } from 'date-fns';
import { de } from 'date-fns/locale';

interface LinenDeliveriesCardProps {
  linenDeliveries: LinenDeliveryData[];
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'delivered':
      return <Badge className="bg-green-500 text-white text-xs">Geliefert</Badge>;
    case 'in_transit':
      return <Badge className="bg-blue-500 text-white text-xs">Unterwegs</Badge>;
    case 'confirmed':
      return <Badge className="bg-cyan-500 text-white text-xs">Bestätigt</Badge>;
    case 'cancelled':
      return <Badge variant="destructive" className="text-xs">Storniert</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">Offen</Badge>;
  }
}

export function LinenDeliveriesCard({ linenDeliveries }: LinenDeliveriesCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shirt className="h-4 w-4 text-purple-500" />
          Wäschelieferungen
          <Badge variant="secondary" className="ml-auto">
            {linenDeliveries.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
        {linenDeliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Keine Lieferungen in diesem Zeitraum
          </p>
        ) : (
          linenDeliveries.map((delivery) => (
            <div
              key={delivery.id}
              className={`p-3 rounded-lg border ${
                delivery.status === 'delivered'
                  ? 'bg-green-500/10 border-green-500/30'
                  : isToday(delivery.deliveryDate)
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-muted/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-sm">{delivery.houseName}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Package className="h-3 w-3" />
                    {delivery.totalItems} Teile
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs font-medium">
                    {format(delivery.deliveryDate, 'EEE, dd.MM.', { locale: de })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                {getStatusBadge(delivery.status)}
                {isToday(delivery.deliveryDate) && delivery.status !== 'delivered' && (
                  <Badge variant="outline" className="text-xs bg-yellow-500/20 text-yellow-700 border-yellow-500/30">
                    Heute
                  </Badge>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
