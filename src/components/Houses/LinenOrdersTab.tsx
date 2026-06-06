import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LinenOrderDialog from './LinenOrderDialog';
import LinenOrderEmailDialog from './LinenOrderEmailDialog';
import { translateItemType, getLabelsFromLinenDef } from '@/lib/linenOrderHelpers';
import { 
  ShoppingCart, 
  Package, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Mail,
  Calendar,
  User,
  Truck,
  XCircle,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';

interface LinenOrdersTabProps {
  house: any;
}

const LinenOrdersTab = ({ house }: LinenOrdersTabProps) => {
  const [activeTab, setActiveTab] = useState('active');
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [emailingOrder, setEmailingOrder] = useState<any>(null);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isEmailSending, setIsEmailSending] = useState(false);
  const queryClient = useQueryClient();

  // Realtime-Channel für Wäschebestellungen
  useEffect(() => {
    console.log('🔌 Setting up linen orders realtime channel for house:', house.id);
    
    const channel = supabase
      .channel('linen-orders-realtime-tab')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'linen_orders',
          filter: `house_id=eq.${house.id}`
        },
        (payload) => {
          console.log('🔔 Realtime: Linen order changed in LinenOrdersTab:', payload);
          queryClient.invalidateQueries({ queryKey: ['linen-orders-all', house.id] });
          queryClient.refetchQueries({ queryKey: ['linen-orders-all', house.id] });
        }
      )
      .subscribe();

    return () => {
      console.log('🔌 Cleaning up linen orders realtime channel');
      supabase.removeChannel(channel);
    };
  }, [house.id, queryClient]);

  // Mutation to cancel an order
  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      console.log('🚫 Storniere Bestellung:', orderId);
      
      const { data, error } = await supabase
        .from('linen_orders')
        .update({ 
          status: 'cancelled',
          status_changed_by: 'Admin',
          status_changed_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) {
        console.error('❌ Stornierung fehlgeschlagen:', error);
        throw error;
      }
      
      console.log('✅ Bestellung storniert:', data);
      return data;
    },
    onSuccess: async () => {
      // ALLE relevanten Query-Keys invalidieren
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-all', house.id] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-connected'] });
      await queryClient.invalidateQueries({ queryKey: ['connected-bookings'] });
      
      // Sofortiges Refetch für ConnectedBookingView
      await queryClient.refetchQueries({ queryKey: ['linen-orders-connected'] });
      await queryClient.refetchQueries({ queryKey: ['connected-bookings'] });
      
      toast({
        title: "Bestellung storniert",
        description: "Die Bestellung wurde erfolgreich storniert.",
      });
    },
    onError: (error: any) => {
      console.error('❌ Stornierungsfehler:', error);
      toast({
        title: "Fehler bei Stornierung",
        description: error.message || "Die Bestellung konnte nicht storniert werden.",
        variant: "destructive",
      });
    },
  });

  // Mutation to update an order
  const updateOrderMutation = useMutation({
    mutationFn: async ({ orderId, orderData, originalStatus }: { orderId: string; orderData: any; originalStatus?: string }) => {
      console.log('✏️ Aktualisiere Bestellung:', orderId, orderData);
      
      const statusChanged = originalStatus && orderData.status !== originalStatus;
      
      const { data, error } = await supabase
        .from('linen_orders')
        .update({
          items: orderData.orderItems,
          notes: orderData.notes,
          delivery_date: orderData.deliveryDate,
          delivery_type: orderData.deliveryType || 'delivery',
          total_items: Object.values(orderData.orderItems as Record<string, number>).reduce((sum, count) => sum + count, 0),
          linen_color: orderData.linenColor,
          item_variants: orderData.itemColors,
          status: orderData.status,
          // Track who changed the status (Admin App)
          ...(statusChanged ? {
            status_changed_by: 'Admin',
            status_changed_at: new Date().toISOString(),
          } : {}),
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) {
        console.error('❌ Update fehlgeschlagen:', error);
        throw error;
      }
      
      console.log('✅ Bestellung aktualisiert:', data);
      return data;
    },
    onSuccess: async () => {
      // ALLE relevanten Query-Keys invalidieren
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-all', house.id] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-connected'] });
      await queryClient.invalidateQueries({ queryKey: ['connected-bookings'] });
      
      // Sofortiges Refetch
      await queryClient.refetchQueries({ queryKey: ['linen-orders-connected'] });
      
      setIsEditDialogOpen(false);
      setEditingOrder(null);
      toast({
        title: "Bestellung aktualisiert",
        description: "Die Bestellung wurde erfolgreich aktualisiert.",
      });
    },
    onError: (error: any) => {
      console.error('❌ Update-Fehler:', error);
      toast({
        title: "Fehler beim Aktualisieren",
        description: error.message || "Die Bestellung konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  // Mutation to delete an order
  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      console.log('🗑️ Lösche Bestellung:', orderId);
      
      const { error } = await supabase
        .from('linen_orders')
        .delete()
        .eq('id', orderId);

      if (error) {
        console.error('❌ Löschen fehlgeschlagen:', error);
        throw error;
      }
      
      console.log('✅ Bestellung erfolgreich gelöscht');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-all', house.id] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-connected'] });
      await queryClient.invalidateQueries({ queryKey: ['connected-bookings'] });
      
      toast({
        title: "Bestellung gelöscht",
        description: "Die Wäschebestellung wurde dauerhaft aus der Datenbank entfernt.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Fehler beim Löschen",
        description: error.message || "Die Bestellung konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    },
  });

  // Send email to provider
  const sendEmailToProvider = (order: any) => {
    setEmailingOrder(order);
    setIsEmailDialogOpen(true);
  };

  // Handle email send
  const handleSendEmail = async (emailData: {
    to: string;
    subject: string;
    customText: string;
    orderDetails: string;
  }) => {
    try {
      setIsEmailSending(true);
      console.log('📧 Sende E-Mail für Bestellung:', emailingOrder.id);

      const fullEmailText = `${emailData.customText ? `${emailData.customText}\n\n` : ''}${emailData.orderDetails}\n\nBitte bestätigen Sie den Erhalt dieser Bestellung.\n\nMit freundlichen Grüßen\nSteinbock Chalets Team`;

      const { openInMailClient } = await import('@/lib/mailtoHelper');
      openInMailClient({
        to: emailData.to,
        subject: emailData.subject,
        text: fullEmailText,
      });

      // Update email_sent_at timestamp
      await supabase
        .from('linen_orders')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', emailingOrder.id);

      toast({
        title: "E-Mail-Entwurf geöffnet",
        description: `Entwurf für ${emailData.to} im Mail-Client geöffnet. Bitte manuell senden.`,
      });

      // Refresh orders to show updated email timestamp
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-all', house.id] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['linen-orders-connected'] });
      await queryClient.refetchQueries({ queryKey: ['linen-orders-connected'] });
      
      // Close dialog
      setIsEmailDialogOpen(false);
      setEmailingOrder(null);

    } catch (error: any) {
      console.error('❌ E-Mail Fehler:', error);
      toast({
        title: "Fehler",
        description: error.message || "Der E-Mail-Entwurf konnte nicht geöffnet werden.",
        variant: "destructive",
      });
    } finally {
      setIsEmailSending(false);
    }
  };

  // Fetch linen set definition for dynamic labels
  const { data: linenSetDef } = useQuery({
    queryKey: ['linen-set-definition', house?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('custom_categories')
        .eq('house_id', house.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!house?.id,
  });

  // Extract dynamic labels
  const customLabels = getLabelsFromLinenDef(linenSetDef);

  // Fetch all linen orders for this house
  const { data: linenOrders, isLoading, error } = useQuery({
    queryKey: ['linen-orders-all', house?.id],
    queryFn: async () => {
      console.log('🔍 Lade Bestellungen für Haus:', house.id, house.name);
      
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          *,
          service_providers:provider_id (
            id,
            name,
            contact_email,
            contact_phone
          ),
          bookings:booking_id (
            id,
            guest_name,
            check_in,
            check_out,
            number_of_guests,
            external_booking_id
          )
        `)
        .eq('house_id', house.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Fehler beim Laden der Bestellungen:', error);
        throw error;
      }
      
      console.log('✅ Bestellungen geladen:', data?.length || 0, 'Bestellungen für', house.name);
      console.log('📋 Bestellungen Details:', data);
      
      return data || [];
    },
    enabled: !!house?.id,
  });


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'offen': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'ausstehend': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'delivered': return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'offen': return <Clock className="w-4 h-4" />;
      case 'ausstehend': return <Package className="w-4 h-4" />;
      case 'delivered': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <AlertTriangle className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'offen': return 'Offen';
      case 'ausstehend': return 'Ausstehend';
      case 'delivered': return 'Geliefert';
      case 'cancelled': return 'Storniert';
      default: return 'Unbekannt';
    }
  };

  const activeOrders = linenOrders?.filter(order => 
    ['offen', 'ausstehend'].includes(order.status)
  ) || [];

  const completedOrders = linenOrders?.filter(order => 
    ['delivered', 'cancelled'].includes(order.status)
  ) || [];

  console.log('📊 Bestellungen gefiltert:', {
    houseName: house.name,
    houseId: house.id,
    total: linenOrders?.length || 0,
    active: activeOrders.length,
    completed: completedOrders.length,
    delivered: linenOrders?.filter(o => o.status === 'delivered').length || 0
  });

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
            {order.status_changed_by && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Status geändert von <span className="font-medium text-primary">{order.status_changed_by}</span>
                {order.status_changed_at && ` am ${format(new Date(order.status_changed_at), 'dd.MM.yyyy HH:mm', { locale: de })}`}
              </p>
            )}
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
              <span>
                {order.delivery_type === 'pickup' ? '📦 Abholung' : '🚚 Lieferung'}: {format(new Date(order.delivery_date), 'dd.MM.yyyy', { locale: de })}
                {order.delivery_time && ` um ${order.delivery_time.slice(0, 5)}`}
              </span>
            </div>
          )}
          {order.service_providers && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <span>{order.service_providers.name}</span>
            </div>
          )}
        </div>

        {/* Booking Information */}
        {order.bookings && (
          <div className="p-3 bg-laundry-bg rounded-lg border border-laundry-border">
            <h4 className="font-medium text-sm mb-2 text-blue-800 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Verknüpfte Buchung
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-blue-700 font-medium">Gast:</span>
                <span className="ml-1">{order.bookings.guest_name}</span>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Gäste:</span>
                <span className="ml-1">{order.bookings.number_of_guests}</span>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Check-in:</span>
                <span className="ml-1">{format(new Date(order.bookings.check_in), 'dd.MM.yyyy', { locale: de })}</span>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Check-out:</span>
                <span className="ml-1">{format(new Date(order.bookings.check_out), 'dd.MM.yyyy', { locale: de })}</span>
              </div>
              {order.bookings.external_booking_id && (
                <div className="md:col-span-2">
                  <span className="text-blue-700 font-medium">Buchungs-ID:</span>
                  <span className="ml-1">{order.bookings.external_booking_id}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Order Items */}
        <div>
          <h4 className="font-medium mb-2">Bestellte Artikel:</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(order.items || {}).map(([itemType, quantity]) => (
              <div key={itemType} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                <span>{translateItemType(itemType, customLabels)}</span>
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
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => sendEmailToProvider(order)}
              >
                <Mail className="w-4 h-4 mr-1" />
                E-Mail senden
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setEditingOrder(order);
                  setIsEditDialogOpen(true);
                }}
              >
                Bearbeiten
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => {
                  if (window.confirm(
                    `Möchten Sie diese Bestellung wirklich dauerhaft löschen?\n\n` +
                    `Bestellung #${order.id.slice(0, 8)}\n` +
                    `Status: ${getStatusText(order.status)}\n` +
                    `Artikel: ${order.total_items}\n\n` +
                    `Diese Aktion kann nicht rückgängig gemacht werden!`
                  )) {
                    deleteOrderMutation.mutate(order.id);
                  }
                }}
                disabled={deleteOrderMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {deleteOrderMutation.isPending ? 'Lösche...' : 'Löschen'}
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => cancelOrderMutation.mutate(order.id)}
                disabled={cancelOrderMutation.isPending}
              >
                <XCircle className="w-4 h-4 mr-1" />
                {cancelOrderMutation.isPending ? 'Storniere...' : 'Stornieren'}
              </Button>
            </>
          )}
          {order.status === 'confirmed' && (
            <>
              <Button variant="outline" size="sm">
                <Calendar className="w-4 h-4 mr-1" />
                Lieferung verfolgen
              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => cancelOrderMutation.mutate(order.id)}
                disabled={cancelOrderMutation.isPending}
              >
                <XCircle className="w-4 h-4 mr-1" />
                {cancelOrderMutation.isPending ? 'Storniere...' : 'Stornieren'}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => {
                  if (window.confirm(
                    `Möchten Sie diese Bestellung wirklich dauerhaft löschen?\n\n` +
                    `Bestellung #${order.id.slice(0, 8)}\n` +
                    `Status: ${getStatusText(order.status)}\n` +
                    `Artikel: ${order.total_items}\n\n` +
                    `Diese Aktion kann nicht rückgängig gemacht werden!`
                  )) {
                    deleteOrderMutation.mutate(order.id);
                  }
                }}
                disabled={deleteOrderMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {deleteOrderMutation.isPending ? 'Lösche...' : 'Löschen'}
              </Button>
            </>
          )}
          {['delivered', 'cancelled'].includes(order.status) && (
            <Button 
              variant="outline" 
              size="sm"
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => {
                if (window.confirm(
                  `Möchten Sie diese Bestellung wirklich dauerhaft löschen?\n\n` +
                  `Bestellung #${order.id.slice(0, 8)}\n` +
                  `Status: ${getStatusText(order.status)}\n` +
                  `Artikel: ${order.total_items}\n\n` +
                  `Diese Aktion kann nicht rückgängig gemacht werden!`
                )) {
                  deleteOrderMutation.mutate(order.id);
                }
              }}
              disabled={deleteOrderMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {deleteOrderMutation.isPending ? 'Lösche...' : 'Löschen'}
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

      {/* Edit Order Dialog */}
      {editingOrder && (
        <LinenOrderDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          mode="edit"
          orderItems={editingOrder.items || {}}
          houseName={house.name}
          houseId={house.id}
          selectedBooking={editingOrder.bookings}
          initialData={{
            deliveryDate: editingOrder.delivery_date,
            deliveryType: editingOrder.delivery_type,
            notes: editingOrder.notes,
            status: editingOrder.status,
            linenColor: editingOrder.linen_color,
            item_variants: editingOrder.item_variants,
          }}
          onCreateOrder={(orderData) => {
            updateOrderMutation.mutate({ 
              orderId: editingOrder.id, 
              orderData,
              originalStatus: editingOrder.status
            });
          }}
          isCreating={updateOrderMutation.isPending}
        />
      )}

      {/* Email Order Dialog */}
      {emailingOrder && (
        <LinenOrderEmailDialog
          open={isEmailDialogOpen}
          onOpenChange={setIsEmailDialogOpen}
          order={emailingOrder}
          houseName={house.name}
          onSendEmail={handleSendEmail}
          isLoading={isEmailSending}
        />
      )}
    </div>
  );
};

export default LinenOrdersTab;