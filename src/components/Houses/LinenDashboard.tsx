import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import LinenInventoryDashboard from './LinenInventoryDashboard';
import SmartLinenInventoryDashboard from './SmartLinenInventoryDashboard';

interface HouseLinenStatus {
  house: any;
  totalItems: number;
  criticalItems: number;
  lowItems: number;
  upcomingBookings: number;
  nextBookingDate?: string;
  status: 'good' | 'warning' | 'critical';
}

const LinenDashboard = () => {
  const [selectedHouse, setSelectedHouse] = useState<any>(null);

  // Fetch all houses with linen data
  const { data: houses, isLoading } = useQuery({
    queryKey: ['houses-linen-overview'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select(`
          *,
          linen_set_definitions (*)
        `)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch upcoming bookings for all houses
  const { data: upcomingBookings } = useQuery({
    queryKey: ['all-upcoming-bookings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('house_id, check_in, number_of_guests, guest_name')
        .gte('check_in', format(new Date(), 'yyyy-MM-dd'))
        .order('check_in', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });

  // Calculate linen status for each house
  const houseStatuses: HouseLinenStatus[] = houses?.map(house => {
    const linenStock = house.linen_stock || {};
    const linenDef = house.linen_set_definitions?.[0] || {};
    const houseBookings = upcomingBookings?.filter(b => b.house_id === house.id) || [];
    
    const linenTypes = [
      'bedding', 'large_towels', 'small_towels', 'sauna_towels',
      'bath_mats', 'sink_towels', 'kitchen_towels', 'blankets', 'pillow_cases'
    ];

    let criticalCount = 0;
    let lowCount = 0;
    let totalItems = 0;

    // Calculate demand for next 30 days
    const nearTermBookings = houseBookings.slice(0, 3); // Next 3 bookings
    
    linenTypes.forEach(type => {
      const currentStock = linenStock[type] || 0;
      totalItems += currentStock;
      
      // Calculate demand based on bookings
      let demand = 0;
      nearTermBookings.forEach(booking => {
        const perGuestKey = `${type}_per_guest`;
        const perBookingKey = `${type}_per_booking`;
        
        if (linenDef[perGuestKey]) {
          demand += booking.number_of_guests * linenDef[perGuestKey];
        } else if (linenDef[perBookingKey]) {
          demand += linenDef[perBookingKey];
        }
      });

      if (demand > currentStock) {
        criticalCount++;
      } else if (demand > currentStock * 0.8) {
        lowCount++;
      }
    });

    let status: HouseLinenStatus['status'] = 'good';
    if (criticalCount > 0) {
      status = 'critical';
    } else if (lowCount > 2) {
      status = 'warning';
    }

    return {
      house,
      totalItems,
      criticalItems: criticalCount,
      lowItems: lowCount,
      upcomingBookings: houseBookings.length,
      nextBookingDate: houseBookings[0]?.check_in,
      status
    };
  }) || [];

  const overallStatus = {
    totalHouses: houseStatuses.length,
    criticalHouses: houseStatuses.filter(h => h.status === 'critical').length,
    warningHouses: houseStatuses.filter(h => h.status === 'warning').length,
    goodHouses: houseStatuses.filter(h => h.status === 'good').length,
    totalCriticalItems: houseStatuses.reduce((sum, h) => sum + h.criticalItems, 0),
  };

  const getStatusColor = (status: HouseLinenStatus['status']) => {
    switch (status) {
      case 'good': return 'border-green-200 bg-green-50';
      case 'warning': return 'border-yellow-200 bg-yellow-50';
      case 'critical': return 'border-red-200 bg-red-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getStatusBadge = (status: HouseLinenStatus['status']) => {
    switch (status) {
      case 'good': 
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <span className="mr-1">✅</span>
            Gut
          </Badge>
        );
      case 'warning': 
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <span className="mr-1">⚠️</span>
            Niedrig
          </Badge>
        );
      case 'critical': 
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            <span className="mr-1">⚠️</span>
            Kritisch
          </Badge>
        );
      default: 
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Wäsche-Status wird geladen...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-3xl">📦</span>
            <h1 className="text-3xl font-bold tracking-tight">Wäsche-Dashboard</h1>
          </div>
          <p className="text-muted-foreground">
            Übersicht über alle Wäschebestände und kommende Bedarfe
          </p>
        </div>
      </div>

      {/* Overall Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏠</span>
              <div>
                <div className="text-2xl font-bold">{overallStatus.totalHouses}</div>
                <div className="text-sm text-muted-foreground">Häuser gesamt</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✅</span>
              <div>
                <div className="text-2xl font-bold text-green-600">{overallStatus.goodHouses}</div>
                <div className="text-sm text-muted-foreground">Gut versorgt</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{overallStatus.warningHouses}</div>
                <div className="text-sm text-muted-foreground">Niedrige Bestände</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="text-2xl font-bold text-red-600">{overallStatus.criticalHouses}</div>
                <div className="text-sm text-muted-foreground">Kritische Bestände</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alert */}
      {overallStatus.criticalHouses > 0 && (
        <Alert variant="destructive">
          <span className="text-xl">⚠️</span>
          <AlertDescription>
            <strong>{overallStatus.criticalHouses} Häuser</strong> haben kritische Wäschebestände. 
            Insgesamt <strong>{overallStatus.totalCriticalItems} Artikel</strong> sind unterversorgt.
          </AlertDescription>
        </Alert>
      )}

      {/* Houses Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {houseStatuses.map((houseStatus) => (
          <Card key={houseStatus.house.id} className={`relative ${getStatusColor(houseStatus.status)}`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{houseStatus.house.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {houseStatus.house.address}
                  </p>
                </div>
                {getStatusBadge(houseStatus.status)}
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Linen Stats */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-medium">Wäscheteile gesamt</div>
                  <div className="text-lg font-bold">{houseStatus.totalItems}</div>
                </div>
                <div>
                  <div className="font-medium">Kommende Buchungen</div>
                  <div className="text-lg font-bold">{houseStatus.upcomingBookings}</div>
                </div>
              </div>

              {/* Issues Summary */}
              {(houseStatus.criticalItems > 0 || houseStatus.lowItems > 0) && (
                <div className="space-y-2">
                  {houseStatus.criticalItems > 0 && (
                    <div className="flex items-center gap-2 text-sm text-red-700">
                      <span>⚠️</span>
                      <span>{houseStatus.criticalItems} kritische Artikel</span>
                    </div>
                  )}
                  {houseStatus.lowItems > 0 && (
                    <div className="flex items-center gap-2 text-sm text-yellow-700">
                      <span>⚠️</span>
                      <span>{houseStatus.lowItems} niedrige Bestände</span>
                    </div>
                  )}
                </div>
              )}

              {/* Next Booking */}
              {houseStatus.nextBookingDate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>🕐</span>
                  <span>
                    Nächste Buchung: {format(new Date(houseStatus.nextBookingDate), 'dd.MM.yyyy', { locale: de })}
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setSelectedHouse(houseStatus.house)}
                >
                  <span className="mr-1">📈</span>
                  Inventar verwalten
                </Button>
                {houseStatus.status === 'critical' && (
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      // Open quick order dialog
                      console.log('Quick order for', houseStatus.house.name);
                    }}
                  >
                    <span className="mr-1">🛒</span>
                    Bestellen
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {houseStatuses.length === 0 && (
        <div className="text-center py-12">
          <span className="text-5xl block mb-4">📦</span>
          <h3 className="text-lg font-medium mb-2">Keine Häuser gefunden</h3>
          <p className="text-muted-foreground">
            Fügen Sie Häuser hinzu, um das Wäsche-Management zu nutzen.
          </p>
        </div>
      )}
      {/* House Detail View */}
      {selectedHouse && (
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <Button 
              variant="outline" 
              onClick={() => setSelectedHouse(null)}
            >
              ← Zurück zur Übersicht
            </Button>
            <Badge variant="secondary" className="flex items-center gap-1">
              <span>🧠</span>
              KI-optimiert
            </Badge>
          </div>
          <SmartLinenInventoryDashboard house={selectedHouse} />
        </div>
      )}
    </div>
  );
};

export default LinenDashboard;