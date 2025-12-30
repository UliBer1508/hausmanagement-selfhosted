import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBookingLinenOrders } from "@/hooks/useBookingLinenOrders";
import { translateItemType, getUrgencyVariant, getUrgencyLabel, formatCurrency, calculateDeliveryDate, translateLinenOrderStatus, getLabelsFromLinenDef } from "@/lib/linenOrderHelpers";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock, Package } from "lucide-react";
import LaundryOrderCard from "../Bookings/LaundryOrderCard";
import { BookingWithoutOrderCard } from "./BookingWithoutOrderCard";
import LinenOrderDialog from "./LinenOrderDialog";
import LinenOrderEmailDialog from "./LinenOrderEmailDialog";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { LinenColor } from "@/types/linen";

interface BookingLinenOverviewProps {
  houseId: string;
}

export const BookingLinenOverview = ({ houseId }: BookingLinenOverviewProps) => {
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [selectedBookingForOrder, setSelectedBookingForOrder] = useState<any>(null);
  const [generatedOrderData, setGeneratedOrderData] = useState<any>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [createdOrderForEmail, setCreatedOrderForEmail] = useState<any>(null);

  const {
    orderStatus,
    missingOrders,
    urgentOrders,
    activeOrders,
    allMissingBookings,
    isLoading,
    isLoadingAllMissing,
    createOrderFromData,
    isCreatingOrder,
  } = useBookingLinenOrders(houseId);

  // Lade linen_set_definitions für dieses Haus
  const { data: linenSetDefinition } = useQuery({
    queryKey: ['linen-set-definition', houseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', houseId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!houseId,
  });

  // Lade house für default_linen_color
  const { data: houseData } = useQuery({
    queryKey: ['house-linen-color', houseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('default_linen_color')
        .eq('id', houseId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!houseId,
  });

  // Generate order preview mutation
  const generatePreviewMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.functions.invoke(
        'generate-booking-linen-order',
        { body: { booking_id: bookingId } }
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data, bookingId) => {
      const booking = allMissingBookings.find(b => b.booking_id === bookingId);
      
      // Konvertiere booking_id zu id für Kompatibilität mit LinenOrderDialog
      if (booking) {
        const bookingForDialog = {
          ...booking,
          id: booking.booking_id,
        };
        setSelectedBookingForOrder(bookingForDialog);
      }
      
      setGeneratedOrderData(data);
      setOrderDialogOpen(true);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Berechnungsfehler",
        description: error.message || "Fehler beim Berechnen der Bestellung",
      });
    }
  });

  const handleCreateOrder = (bookingId: string) => {
    generatePreviewMutation.mutate(bookingId);
  };

  const handleConfirmOrder = async (orderData: any) => {
    if (!selectedBookingForOrder || !generatedOrderData) return;

    const result = await createOrderFromData({
      bookingId: selectedBookingForOrder.booking_id,
      generatedData: generatedOrderData,
      userOverrides: orderData
    });

    setOrderDialogOpen(false);
    setSelectedBookingForOrder(null);
    setGeneratedOrderData(null);

    // Wenn E-Mail gewünscht, Dialog öffnen
    if (orderData.sendEmail && result?.data) {
      setCreatedOrderForEmail(result.data);
      setEmailDialogOpen(true);
    }
  };

  const handleSendEmail = async (emailData: {
    to: string;
    subject: string;
    customText: string;
    orderDetails: string;
  }) => {
    try {
      // Vollständigen E-Mail-Text aus Komponenten zusammensetzen
      const fullEmailText = `${emailData.customText ? `${emailData.customText}\n\n` : ''}${emailData.orderDetails}\n\nBitte bestätigen Sie den Erhalt dieser Bestellung.\n\nMit freundlichen Grüßen\nSteinbock Chalets Team`;

      const { error } = await supabase.functions.invoke('send-gmail', {
        body: {
          to: [emailData.to],
          subject: emailData.subject,
          text: fullEmailText
        }
      });
      
      if (error) throw error;

      // E-Mail-Zeitstempel aktualisieren
      if (createdOrderForEmail?.id) {
        await supabase
          .from('linen_orders')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', createdOrderForEmail.id);
      }
      
      toast({
        title: "E-Mail versendet",
        description: `Bestellung wurde erfolgreich an ${emailData.to} gesendet.`,
      });
      setEmailDialogOpen(false);
      setCreatedOrderForEmail(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Fehler beim Versenden",
        description: error.message || "Die E-Mail konnte nicht versendet werden.",
      });
    }
  };

  // Berechne Bestellitems basierend auf linen_set_definition
  const calculateOrderItems = (booking: any) => {
    if (!linenSetDefinition) return {};
    
    const guests = booking.number_of_guests || 0;
    const items: Record<string, number> = {};
    
    // Per-Guest Items
    if (linenSetDefinition.bedding_per_guest) {
      items.bedding = guests * linenSetDefinition.bedding_per_guest;
    }
    if (linenSetDefinition.large_towels_per_guest) {
      items.large_towels = guests * linenSetDefinition.large_towels_per_guest;
    }
    if (linenSetDefinition.small_towels_per_guest) {
      items.small_towels = guests * linenSetDefinition.small_towels_per_guest;
    }
    if (linenSetDefinition.sauna_towels_per_guest) {
      items.sauna_towels = guests * linenSetDefinition.sauna_towels_per_guest;
    }
    
    // Per-Booking Items
    if (linenSetDefinition.bath_mats_per_booking) {
      items.bath_mats = linenSetDefinition.bath_mats_per_booking;
    }
    if (linenSetDefinition.sink_towels_per_booking) {
      items.sink_towels = linenSetDefinition.sink_towels_per_booking;
    }
    if (linenSetDefinition.kitchen_towels_per_booking) {
      items.kitchen_towels = linenSetDefinition.kitchen_towels_per_booking;
    }
    
    return Object.fromEntries(
      Object.entries(items).filter(([_, qty]) => qty > 0)
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Lade Bestellübersicht...</div>
      </div>
    );
  }

  if (!orderStatus || !orderStatus.summary || !orderStatus.bookings) {
    return (
      <Alert>
        <AlertDescription>
          Keine Daten verfügbar. Bitte prüfen Sie die Konfiguration.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Berücksichtigte Buchungen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orderStatus.summary?.total_bookings ?? 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Bestellungen erstellt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{orderStatus.summary?.orders_complete ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Fehlende Bestellungen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{allMissingBookings.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Dringende Bestellungen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{orderStatus.summary?.urgent_count ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Urgent Alert */}
      {urgentOrders.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Achtung!</strong> {urgentOrders.length} Buchung(en) benötigen dringend eine Wäschebestellung!
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="missing" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="missing" className="relative">
            Fehlend
            {(isLoadingAllMissing || allMissingBookings.length > 0) && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                {isLoadingAllMissing ? "..." : allMissingBookings.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active">Aktiv ({activeOrders.length})</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Übersicht - {orderStatus.house_name}</CardTitle>
              <CardDescription>
                Die nächsten {orderStatus.lookahead_bookings} Buchungen werden berücksichtigt
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {orderStatus.bookings?.map((booking) => (
                <div key={booking.booking_id} className="flex items-center justify-between p-4 border-2 border-green-500 rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">{booking.guest_name}</div>
                    <div className="text-sm text-muted-foreground">
                      Check-in: {format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de })} 
                      ({booking.days_until_checkin} Tage)
                    </div>
                    <div className="text-sm">{booking.number_of_guests} Gäste</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {booking.linen_order.exists ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <Badge variant="secondary">{translateLinenOrderStatus(booking.linen_order.status)}</Badge>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-5 w-5 text-orange-600" />
                        <Badge variant={getUrgencyVariant(booking.days_until_checkin)}>
                          {getUrgencyLabel(booking.days_until_checkin)}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Missing Orders Tab */}
        <TabsContent value="missing" className="space-y-4">
          {isLoadingAllMissing ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-pulse text-muted-foreground">
                Prüfe fehlende Bestellungen...
              </div>
            </div>
          ) : allMissingBookings.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Großartig! Alle kommenden Buchungen haben Wäschebestellungen. 🎉
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert>
                <AlertDescription>
                  Es werden <strong>alle {allMissingBookings.length} Buchungen</strong> ohne 
                  Wäschebestellung angezeigt (Status: "offen").
                </AlertDescription>
              </Alert>
              
              <div className="space-y-3">
                {allMissingBookings.map((booking) => (
                  <BookingWithoutOrderCard
                    key={booking.booking_id}
                    booking={booking}
                    onCreateOrder={handleCreateOrder}
                    isCreating={isCreatingOrder}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* Active Orders Tab */}
        <TabsContent value="active" className="space-y-4">
          {activeOrders.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Keine aktiven Bestellungen
              </CardContent>
            </Card>
          ) : (
            activeOrders.map((booking) => (
              <Card key={booking.booking_id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{booking.guest_name}</CardTitle>
                      <CardDescription>
                        Check-in: {format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de })}
                      </CardDescription>
                    </div>
                    <Badge variant="default">
                      <Clock className="h-3 w-3 mr-1" />
                      {translateLinenOrderStatus(booking.linen_order.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Bestellung ID: {booking.linen_order.order_id}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Bestellungs-Dialog */}
      {selectedBookingForOrder && (
        <LinenOrderDialog
          open={orderDialogOpen}
          onOpenChange={(open) => {
            setOrderDialogOpen(open);
            if (!open) {
              setGeneratedOrderData(null);
              setSelectedBookingForOrder(null);
            }
          }}
          orderItems={generatedOrderData?.order_items || {}}
          houseName={orderStatus?.house_name || ''}
          houseId={houseId}
          selectedBooking={selectedBookingForOrder}
          linenSetDefinition={linenSetDefinition}
          onCreateOrder={handleConfirmOrder}
          isCreating={isCreatingOrder || generatePreviewMutation.isPending}
          mode="create"
          generatedOrderData={generatedOrderData}
          defaultLinenColor={(houseData?.default_linen_color as LinenColor) || undefined}
        />
      )}

      {/* E-Mail-Dialog */}
      {createdOrderForEmail && (
        <LinenOrderEmailDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          order={createdOrderForEmail}
          houseName={createdOrderForEmail.houses?.name || ''}
          onSendEmail={handleSendEmail}
          isLoading={false}
        />
      )}
    </div>
  );
};
