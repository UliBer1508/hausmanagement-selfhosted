import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, Crown, Heart, TrendingUp, Star, UserPlus } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useGuestSegments } from '@/hooks/useGuests';

const GuestSegments = () => {
  const { data: segmentData, isLoading } = useGuestSegments();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 animate-pulse" />
          <div className="h-6 bg-muted rounded w-48 mx-auto mb-2 animate-pulse" />
          <div className="h-4 bg-muted rounded w-64 mx-auto animate-pulse" />
        </div>
      </div>
    );
  }

  if (!segmentData) {
    return (
      <div className="text-center py-12">
        <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Keine Segmentdaten verfügbar</h3>
        <p className="text-muted-foreground">Keine Buchungsdaten für Segmentierung gefunden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">VIP Gäste</CardTitle>
            <Crown className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{segmentData.vipGuests.count}</div>
            <p className="text-xs text-muted-foreground">
              €{segmentData.vipGuests.avgRevenue} Ø pro Gast
            </p>
            <div className="flex items-center mt-2">
              <Badge variant="secondary" className="text-xs">
                {segmentData.vipGuests.percentage}% Umsatz
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stammgäste</CardTitle>
            <Heart className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{segmentData.returningGuests.count}</div>
            <p className="text-xs text-muted-foreground">
              €{segmentData.returningGuests.avgRevenue} Ø pro Gast
            </p>
            <div className="flex items-center mt-2">
              <Badge variant="secondary" className="text-xs">
                {segmentData.returningGuests.percentage}% Umsatz
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Neue Gäste</CardTitle>
            <UserPlus className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{segmentData.newGuests.count}</div>
            <p className="text-xs text-muted-foreground">
              Erstbesucher
            </p>
            <div className="flex items-center mt-2">
              <Badge variant="secondary" className="text-xs">
                {segmentData.newGuests.percentage}% Umsatz
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktivität (3M)</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{segmentData.recentActivity.count}</div>
            <p className="text-xs text-muted-foreground">
              Kürzlich aktive Gäste
            </p>
            <div className="flex items-center mt-2">
              <Badge variant="secondary" className="text-xs">
                {segmentData.recentActivity.percentage}% aller Gäste
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Segment Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* VIP Guests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-yellow-500" />
              VIP Gäste (€2000+)
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              Hochwertige Stammkunden mit hohem Umsatzpotential
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Umsatzanteil</span>
                  <span>{segmentData.vipGuests.percentage}%</span>
                </div>
                <Progress value={segmentData.vipGuests.percentage} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="text-sm font-medium">Top VIP Gäste:</div>
                {segmentData.vipGuests.guests.map((guest, index) => (
                  <div key={guest.id || index} className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm font-medium">{guest.guest_name}</span>
                    <Badge variant="outline" className="text-xs">
                      €{guest.total_revenue} • {guest.stay_count}x
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Returning Guests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-red-500" />
              Stammgäste (2+ Aufenthalte)
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              Wiederkehrende Gäste mit Loyalitätspotential
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Umsatzanteil</span>
                  <span>{segmentData.returningGuests.percentage}%</span>
                </div>
                <Progress value={segmentData.returningGuests.percentage} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="text-sm font-medium">Aktive Stammgäste:</div>
                {segmentData.returningGuests.guests.map((guest, index) => (
                  <div key={guest.id || index} className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm font-medium">{guest.guest_name}</span>
                    <Badge variant="outline" className="text-xs">
                      €{guest.total_revenue} • {guest.stay_count}x
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* New Guests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-500" />
              Neue Gäste (1. Aufenthalt)
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              Erstbesucher mit Potenzial für Wiederkehr
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Umsatzanteil</span>
                  <span>{segmentData.newGuests.percentage}%</span>
                </div>
                <Progress value={segmentData.newGuests.percentage} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="text-sm font-medium">Neue Gäste:</div>
                {segmentData.newGuests.guests.map((guest, index) => (
                  <div key={guest.id || index} className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm font-medium">{guest.guest_name}</span>
                    <Badge variant="outline" className="text-xs">
                      €{guest.total_revenue} • Neu
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Segment-Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="text-lg font-semibold text-yellow-600">VIP Fokus</div>
              <p className="text-sm text-muted-foreground mt-1">
                {segmentData.vipGuests.count} VIP-Gäste generieren {segmentData.vipGuests.percentage}% des Gesamtumsatzes
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="text-lg font-semibold text-red-600">Loyalität</div>
              <p className="text-sm text-muted-foreground mt-1">
                {segmentData.totalGuests > 0 ? Math.round((segmentData.returningGuests.count / segmentData.totalGuests) * 100) : 0}% Ihrer Gäste sind wiederkehrende Kunden
              </p>
            </div>
            
            <div className="p-4 border rounded-lg">
              <div className="text-lg font-semibold text-green-600">Wachstum</div>
              <p className="text-sm text-muted-foreground mt-1">
                {segmentData.newGuests.count} neue Gäste können zu Stammkunden entwickelt werden
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GuestSegments;
