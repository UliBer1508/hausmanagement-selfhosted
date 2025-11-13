import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBookingLinenOrders } from "@/hooks/useBookingLinenOrders";
import { translateItemType, getUrgencyVariant, getUrgencyLabel, formatCurrency, calculateDeliveryDate } from "@/lib/linenOrderHelpers";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock, Package } from "lucide-react";
import LaundryOrderCard from "../Bookings/LaundryOrderCard";
import { BookingWithoutOrderCard } from "./BookingWithoutOrderCard";

interface BookingLinenOverviewProps {
  houseId: string;
}

export const BookingLinenOverview = ({ houseId }: BookingLinenOverviewProps) => {
  const {
    orderStatus,
    missingOrders,
    urgentOrders,
    activeOrders,
    allMissingBookings,
    isLoading,
    isLoadingAllMissing,
    createOrder,
    isCreatingOrder,
  } = useBookingLinenOrders(houseId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Lade Bestellübersicht...</div>
      </div>
    );
  }

  if (!orderStatus) {
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
            <div className="text-2xl font-bold">{orderStatus.summary.total_bookings}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Bestellungen erstellt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{orderStatus.summary.orders_complete}</div>
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
            <div className="text-2xl font-bold text-red-600">{orderStatus.summary.urgent_count}</div>
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
              {orderStatus.bookings.map((booking) => (
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
                        <Badge variant="secondary">{booking.linen_order.status}</Badge>
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
                    onCreateOrder={createOrder}
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
                      {booking.linen_order.status}
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
    </div>
  );
};
