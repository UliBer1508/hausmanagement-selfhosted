import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, Calendar, Euro } from 'lucide-react';

const GuestAnalytics = () => {
  return (
    <div className="space-y-6">
      <div className="text-center py-12">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <TrendingUp className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Analysen werden vorbereitet</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          Detaillierte Gäste-Analysen mit Trends, Segmentierung und 
          Leistungskennzahlen sind in Entwicklung.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saisonale Trends</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bald verfügbar</div>
            <p className="text-xs text-muted-foreground">
              Buchungsmuster nach Monaten
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Herkunftsländer</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bald verfügbar</div>
            <p className="text-xs text-muted-foreground">
              Top Gäste-Nationalitäten
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Umsatz-Trends</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bald verfügbar</div>
            <p className="text-xs text-muted-foreground">
              Monatliche Entwicklung
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aufenthaltsdauer</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bald verfügbar</div>
            <p className="text-xs text-muted-foreground">
              Durchschnittliche Trends
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GuestAnalytics;