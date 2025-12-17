import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGuestStats } from '@/hooks/useGuests';

const GuestStats = () => {
  const { stats, isLoading } = useGuestStats();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Lädt...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gesamt Gäste</CardTitle>
          <span className="text-2xl">👥</span>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalGuests}</div>
          <p className="text-xs text-muted-foreground">
            +{stats.growthRate}% in 6 Monaten
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gesamtumsatz</CardTitle>
          <span className="text-2xl">📈</span>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">€{stats.totalRevenue.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
          <p className="text-xs text-muted-foreground">
            €{stats.avgRevenuePerBooking} pro Buchung
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Wiederkehr-Rate</CardTitle>
          <span className="text-2xl">🔄</span>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.returningRate}%</div>
          <p className="text-xs text-muted-foreground">
            {stats.returningGuests} Stammgäste
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ø Aufenthaltsdauer</CardTitle>
          <span className="text-2xl">📅</span>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.avgStayDuration} Nächte</div>
          <p className="text-xs text-muted-foreground">
            Durchschnittlich
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default GuestStats;