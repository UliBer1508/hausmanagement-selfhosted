import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Calendar, Users, Euro } from 'lucide-react';

interface BookingStatsProps {
  total: number;
  confirmed: number;
  completed: number;
  totalRevenue: number;
  timeFilter: string;
}

const BookingStats = ({ total, confirmed, completed, totalRevenue, timeFilter }: BookingStatsProps) => {
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
    }
  ];

  return (
    <div className="space-y-4">
      {/* Time Filter Info */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="w-4 h-4" />
        <span>Zeitraum:</span>
        <Badge variant="outline" className="font-normal">
          {getTimeFilterLabel(timeFilter)}
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
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