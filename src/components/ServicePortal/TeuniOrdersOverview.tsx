/**
 * TeuniOrdersOverview - Zeigt alle Wäschebestellungen für das Teuni Portal
 * 
 * WICHTIG: Diese Komponente zeigt Bestellungen basierend auf provider_id (Teuni).
 * Das Teuni Portal liest direkt aus der internen Datenbank - KEINE externe Synchronisation.
 * 
 * Für Wäsche Oberpinzgau (externe Sync) siehe: LaundryOrdersOverview.tsx
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { RefreshCw, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Teuni Provider ID - Bestellungen mit dieser ID werden hier angezeigt
const TEUNI_PROVIDER_ID = 'd8110105-8ac9-45e3-ad32-aaf42393744c';

const getStatusBadgeInfo = (status: string | null) => {
  switch (status?.toLowerCase()) {
    case 'offen':
      return { label: 'Offen', className: 'bg-amber-500 hover:bg-amber-600 text-white' };
    case 'ausstehend':
      return { label: 'Ausstehend', className: 'bg-purple-500 hover:bg-purple-600 text-white' };
    case 'bestellt':
      return { label: 'Bestellt', className: 'bg-blue-500 hover:bg-blue-600 text-white' };
    case 'delivered':
      return { label: 'Geliefert', className: 'bg-green-500 hover:bg-green-600 text-white' };
    case 'cancelled':
      return { label: 'Storniert', className: 'bg-red-500 hover:bg-red-600 text-white' };
    default:
      return { label: status || 'Unbekannt', className: 'bg-gray-500 hover:bg-gray-600 text-white' };
  }
};

export function TeuniOrdersOverview() {
  // Alle Teuni-Bestellungen laden (basierend auf provider_id)
  const { data: linenOrders, isLoading, refetch } = useQuery({
    queryKey: ['teuni-linen-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          id,
          delivery_date,
          status,
          total_items,
          created_at,
          houses:house_id (name),
          bookings:booking_id (guest_name, check_in, number_of_guests)
        `)
        .eq('provider_id', TEUNI_PROVIDER_ID)
        .order('delivery_date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Statistiken berechnen
  const stats = useMemo(() => {
    if (!linenOrders) return { total: 0, offen: 0, ausstehend: 0, bestellt: 0, geliefert: 0 };
    
    let offen = 0;
    let ausstehend = 0;
    let bestellt = 0;
    let geliefert = 0;

    linenOrders.forEach(order => {
      const status = order.status?.toLowerCase();
      if (status === 'offen') offen++;
      if (status === 'ausstehend') ausstehend++;
      if (status === 'bestellt') bestellt++;
      if (status === 'delivered') geliefert++;
    });

    return { total: linenOrders.length, offen, ausstehend, bestellt, geliefert };
  }, [linenOrders]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => (
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
      {/* Header with info */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-muted-foreground">
            Alle Wäschebestellungen für Teuni (interne Datenbank)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            <Package className="h-3 w-3 inline mr-1" />
            Diese Daten werden direkt vom Teuni Portal gelesen - keine Synchronisation nötig
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Bestellungen</p>
          </CardContent>
        </Card>
        
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">🟡 Offen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.offen}</div>
            <p className="text-xs text-muted-foreground">Bestellungen</p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-400">🟣 Ausstehend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{stats.ausstehend}</div>
            <p className="text-xs text-muted-foreground">Bestellungen</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">🔵 Bestellt</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.bestellt}</div>
            <p className="text-xs text-muted-foreground">Bestellungen</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50 dark:bg-green-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">✅ Geliefert</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.geliefert}</div>
            <p className="text-xs text-muted-foreground">Bestellungen</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <ScrollArea className="border rounded-lg h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lieferdatum</TableHead>
              <TableHead>Haus</TableHead>
              <TableHead>Gast</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Personen</TableHead>
              <TableHead>Artikel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Erstellt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linenOrders?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Keine Teuni-Bestellungen vorhanden
                </TableCell>
              </TableRow>
            ) : (
              linenOrders?.map((order: any) => {
                const badgeInfo = getStatusBadgeInfo(order.status);
                
                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      {order.delivery_date 
                        ? format(new Date(order.delivery_date), 'dd.MM.yyyy', { locale: de })
                        : '-'}
                    </TableCell>
                    <TableCell>{order.houses?.name || '-'}</TableCell>
                    <TableCell>{order.bookings?.guest_name || '-'}</TableCell>
                    <TableCell>
                      {order.bookings?.check_in 
                        ? format(new Date(order.bookings.check_in), 'dd.MM.yyyy', { locale: de })
                        : '-'}
                    </TableCell>
                    <TableCell>{order.bookings?.number_of_guests || '-'}</TableCell>
                    <TableCell>{order.total_items || '-'}</TableCell>
                    <TableCell>
                      <Badge className={badgeInfo.className}>
                        {badgeInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {order.created_at 
                        ? format(new Date(order.created_at), 'dd.MM.yy HH:mm', { locale: de })
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
