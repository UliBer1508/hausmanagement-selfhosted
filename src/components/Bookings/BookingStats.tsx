import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Calendar, Users, Euro, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface BookingStatsProps {
  total: number;
  confirmed: number;
  completed: number;
  totalRevenue: number;
  paidRevenue: number;
  timeFilter: string;
}

const BookingStats = ({ total, confirmed, completed, totalRevenue, paidRevenue, timeFilter }: BookingStatsProps) => {
  const queryClient = useQueryClient();
  
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['bookings-overview'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const getTimeFilterLabel = (filter: string) => {
    switch (filter) {
      case 'all':
        return 'Alle Zeiträume';
      case 'next-3-months':
        return 'Nächste 3 Monate';
      case 'next-6-months':
        return 'Nächste 6 Monate';
      case 'current-year':
        return 'Aktuelles Jahr';
      case 'next-year':
        return 'Nächstes Jahr';
      case 'last-year':
        return 'Letztes Jahr';
      case 'custom':
        return 'Benutzerdefinierter Zeitraum';
      default:
        return filter;
    }
  };

  const stats = [
    {
      title: 'Gesamte Buchungen',
      value: total,
      icon: Calendar,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Bestätigte Buchungen',
      value: confirmed,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Abgeschlossene Buchungen',
      value: completed,
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Gesamtumsatz',
      value: `${totalRevenue.toLocaleString('de-DE')} EUR`,
      icon: Euro,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      paidRevenue: paidRevenue,
      openRevenue: totalRevenue - paidRevenue,
    }
  ];

  return (
    <div className="space-y-4">
      {/* Time Filter Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4" />
          <span>Zeitraum:</span>
          <Badge variant="outline" className="font-normal">
            {getTimeFilterLabel(timeFilter)}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Aktualisieren
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
          const Icon = stat.icon;
          const isRevenueCard = stat.title === 'Gesamtumsatz';
          return (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {stat.value}
                    </p>
                    {isRevenueCard && 'paidRevenue' in stat && (
                      <div className="mt-2 space-y-1 text-sm">
                        <p className="text-green-600">
                          ✅ Gezahlt: {(stat.paidRevenue as number).toLocaleString('de-DE')} EUR
                        </p>
                        <p className="text-orange-600">
                          ⚠️ Offen: {(stat.openRevenue as number).toLocaleString('de-DE')} EUR
                        </p>
                      </div>
                    )}
                  </div>
                  <div className={`p-3 rounded-full ${stat.bgColor}`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default BookingStats;