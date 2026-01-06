/**
 * LaundryOrdersOverview - Zeigt Wäschebestellungen die zu WÄSCHE OBERPINZGAU synchronisiert wurden
 * 
 * WICHTIG: Diese Komponente zeigt NUR extern synchronisierte Bestellungen (external_bestellnummer != null).
 * Das Oberpinzgau-Portal hat eine eigene Supabase-Datenbank und erfordert manuelle Synchronisation.
 * 
 * Für das Teuni Portal (interne DB, keine Sync) siehe: TeuniOrdersOverview.tsx
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useExternalOrdersStatus, getExternalStatusBadgeInfo } from '@/hooks/useExternalOrderStatus';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LaundryOrdersOverview() {
  // 1. Interne Bestellungen laden (mit external_bestellnummer)
  const { data: linenOrders, isLoading: isLoadingOrders, refetch } = useQuery({
    queryKey: ['linen-orders-with-external'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          id,
          delivery_date,
          status,
          external_bestellnummer,
          external_synced_at,
          created_at,
          houses:house_id (name),
          bookings:booking_id (guest_name, check_in)
        `)
        .not('external_bestellnummer', 'is', null)
        .order('delivery_date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // 2. Alle externen Bestellnummern sammeln
  const externalBestellnummern = useMemo(() => {
    return linenOrders
      ?.map(o => o.external_bestellnummer)
      .filter((b): b is string => !!b) || [];
  }, [linenOrders]);

  // 3. Externe Status und Preise laden
  const { data: externalStatusMap, isLoading: isLoadingExternal } = useExternalOrdersStatus(externalBestellnummern);

  const isLoading = isLoadingOrders || isLoadingExternal;

  // Statistiken berechnen
  const stats = useMemo(() => {
    if (!linenOrders || !externalStatusMap) return { total: 0, totalPrice: 0, neu: 0, inBearbeitung: 0, abgeschlossen: 0 };
    
    let total = linenOrders.length;
    let totalPrice = 0;
    let neu = 0;
    let inBearbeitung = 0;
    let abgeschlossen = 0;

    linenOrders.forEach(order => {
      const external = order.external_bestellnummer ? externalStatusMap[order.external_bestellnummer] : null;
      if (external) {
        totalPrice += external.totalPrice;
        if (external.status === 'neu') neu++;
        if (external.status === 'in_bearbeitung') inBearbeitung++;
        if (external.status === 'abgeschlossen' || external.status === 'ausgeliefert') abgeschlossen++;
      }
    });

    return { total, totalPrice, neu, inBearbeitung, abgeschlossen };
  }, [linenOrders, externalStatusMap]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-8 w-24 mb-2" />
                <Skeleton className="h-4 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">
            <ExternalLink className="h-3 w-3 inline mr-1" />
            Wäsche Oberpinzgau - Synchronisierte Bestellungen
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Zeigt nur Bestellungen die zur externen Oberpinzgau-Datenbank synchronisiert wurden
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPrice.toFixed(2)} €</div>
            <p className="text-xs text-muted-foreground">{stats.total} Bestellungen</p>
          </CardContent>
        </Card>
        
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-700">🟡 Neu</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{stats.neu}</div>
            <p className="text-xs text-muted-foreground">Bestellungen</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">🔵 In Bearbeitung</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{stats.inBearbeitung}</div>
            <p className="text-xs text-muted-foreground">Bestellungen</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">✅ Erledigt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{stats.abgeschlossen}</div>
            <p className="text-xs text-muted-foreground">Bestellungen</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <ScrollArea className="border rounded-lg h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bestellnummer</TableHead>
              <TableHead>Lieferdatum</TableHead>
              <TableHead>Haus</TableHead>
              <TableHead>Gast</TableHead>
              <TableHead>Portal-Status</TableHead>
              <TableHead className="text-right">Portal-Preis</TableHead>
              <TableHead>Synchronisiert</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linenOrders?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Keine synchronisierten Bestellungen vorhanden
                </TableCell>
              </TableRow>
            ) : (
              linenOrders?.map((order: any) => {
                const external = order.external_bestellnummer 
                  ? externalStatusMap?.[order.external_bestellnummer] 
                  : null;
                const badgeInfo = getExternalStatusBadgeInfo(external?.status);
                
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">
                      {order.external_bestellnummer || '-'}
                    </TableCell>
                    <TableCell>
                      {order.delivery_date 
                        ? format(new Date(order.delivery_date), 'dd.MM.yyyy', { locale: de })
                        : '-'}
                    </TableCell>
                    <TableCell>{order.houses?.name || '-'}</TableCell>
                    <TableCell>{order.bookings?.guest_name || '-'}</TableCell>
                    <TableCell>
                      <Badge className={badgeInfo.className}>
                        {badgeInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {external?.totalPrice 
                        ? `${external.totalPrice.toFixed(2)} €`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {order.external_synced_at 
                        ? format(new Date(order.external_synced_at), 'dd.MM.yy HH:mm', { locale: de })
                        : '-'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
