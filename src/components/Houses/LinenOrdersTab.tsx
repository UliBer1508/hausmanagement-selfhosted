import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ShoppingCart, 
  Package, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Mail,
  Calendar,
  User,
  Truck
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface LinenOrdersTabProps {
  house: any;
}

const LinenOrdersTab = ({ house }: LinenOrdersTabProps) => {
  const [activeTab, setActiveTab] = useState('active');

  // Fetch all linen orders for this house
  const { data: linenOrders, isLoading } = useQuery({
    queryKey: ['linen-orders-all', house?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          *,
          service_providers:provider_id (
            id,
            name,
            contact_email,
            contact_phone
          )
        `)
        .eq('house_id', house.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!house?.id,
  });

  const linenLabels: Record<string, string> = {
    bedding: 'Bettwäsche',
    large_towels: 'Handtücher groß',
    small_towels: 'Handtücher klein',
    sauna_towels: 'Saunatücher',
    bath_mats: 'Badematten',
    sink_towels: 'Waschbecken-Handtücher',
    kitchen_towels: 'Küchentücher',
    blankets: 'Decken',
    pillow_cases: 'Kissenbezüge',
    table_linens: 'Tischwäsche'
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'confirmed': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in_progress': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'delivered': return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'confirmed': return <CheckCircle className="w-4 h-4" />;
      case 'in_progress': return <Package className="w-4 h-4" />;
      case 'delivered': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <AlertTriangle className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ausstehend';
      case 'confirmed': return 'Bestätigt';
      case 'in_progress': return 'In Bearbeitung';
      case 'delivered': return 'Geliefert';
      case 'cancelled': return 'Storniert';
      default: return 'Unbekannt';
    }
  };

  const activeOrders = linenOrders?.filter(order => 
    ['pending', 'confirmed', 'in_progress'].includes(order.status)
  ) || [];

  const completedOrders = linenOrders?.filter(order => 
    ['delivered', 'cancelled'].includes(order.status)
  ) || [];

  const renderOrderCard = (order: any) => (
    <Card key={order.id} className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Bestellung #{order.id.slice(-8)}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Erstellt am {format(new Date(order.created_at), 'dd.MM.yyyy HH:mm', { locale: de })}
            </p>
          </div>
          <Badge variant="outline" className={getStatusColor(order.status)}>
            {getStatusIcon(order.status)}
            <span className="ml-1">{getStatusText(order.status)}</span>
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Order Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{order.total_items} Artikel</span>
          </div>
          {order.delivery_date && (
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-muted-foreground" />
              <span>Lieferung: {format(new Date(order.delivery_date), 'dd.MM.yyyy', { locale: de })}</span>
            </div>
          )}
          {order.service_providers && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span>{order.service_providers.name}</span>
            </div>
          )}
        </div>

        {/* Order Items */}
        <div>
          <h4 className="font-medium mb-2">Bestellte Artikel:</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(order.items || {}).map(([itemType, quantity]) => (
              <div key={itemType} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                <span>{linenLabels[itemType] || itemType}</span>
                <Badge variant="secondary">{quantity as number}</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <div className="p-3 bg-muted rounded-lg">
            <h4 className="font-medium text-sm mb-1">Bemerkungen:</h4>
            <p className="text-sm text-muted-foreground">{order.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t">
          {order.status === 'pending' && (
            <>
              <Button variant="outline" size="sm">
                <Mail className="w-4 h-4 mr-1" />
                Erneut senden
              </Button>
              <Button variant="outline" size="sm">
                Bearbeiten
              </Button>
            </>
          )}
          {order.status === 'confirmed' && (
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4 mr-1" />
              Lieferung verfolgen
            </Button>
          )}
          {['pending', 'confirmed'].includes(order.status) && (
            <Button variant="destructive" size="sm">
              Stornieren
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Bestellungen werden geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-6 h-6 text-primary" />
              <div>
                <CardTitle>Wäschebestellungen für {house.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Übersicht aller Bestellungen und deren Status
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="bg-yellow-50">
                {activeOrders.length} Aktiv
              </Badge>
              <Badge variant="outline" className="bg-green-50">
                {completedOrders.length} Abgeschlossen
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Orders Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active">
            Aktive Bestellungen ({activeOrders.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Abgeschlossene Bestellungen ({completedOrders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4 mt-6">
          {activeOrders.length > 0 ? (
            <div>
              {activeOrders.map(renderOrderCard)}
            </div>
          ) : (
            <div className="text-center py-12">
              <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine aktiven Bestellungen</h3>
              <p className="text-muted-foreground">
                Alle Bestellungen sind abgeschlossen oder es wurden noch keine Bestellungen erstellt.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4 mt-6">
          {completedOrders.length > 0 ? (
            <div>
              {completedOrders.map(renderOrderCard)}
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Keine abgeschlossenen Bestellungen</h3>
              <p className="text-muted-foreground">
                Es wurden noch keine Bestellungen abgeschlossen.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Summary Stats */}
      {linenOrders && linenOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bestellungsstatistik</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {linenOrders.length}
                </div>
                <div className="text-sm text-muted-foreground">Gesamt</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">
                  {linenOrders.filter(o => o.status === 'pending').length}
                </div>
                <div className="text-sm text-muted-foreground">Ausstehend</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {linenOrders.filter(o => o.status === 'delivered').length}
                </div>
                <div className="text-sm text-muted-foreground">Geliefert</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {linenOrders.reduce((sum, order) => sum + (order.total_items || 0), 0)}
                </div>
                <div className="text-sm text-muted-foreground">Artikel</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LinenOrdersTab;