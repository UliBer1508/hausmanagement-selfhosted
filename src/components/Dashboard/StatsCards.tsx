import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, Calendar, CheckCircle, Euro } from 'lucide-react';
import { DashboardStats } from '@/types';

interface StatsCardsProps {
  stats: DashboardStats;
}

const StatsCards = ({ stats }: StatsCardsProps) => {
  const statItems = [
    {
      title: 'Ferienhäuser',
      value: stats.totalHouses,
      icon: Home,
      color: 'from-primary-blue to-primary-blue',
      bgColor: 'bg-primary-blue/10'
    },
    {
      title: 'Aktive Buchungen',
      value: stats.activeBookings,
      icon: Calendar,
      color: 'from-primary-green to-primary-green',
      bgColor: 'bg-primary-green/10'
    },
    {
      title: 'Offene Aufgaben',
      value: stats.pendingTasks,
      icon: CheckCircle,
      color: 'from-warm-orange to-warm-orange',
      bgColor: 'bg-warm-orange/10'
    },
    {
      title: 'Monatsumsatz',
      value: `€${stats.totalRevenue.toLocaleString()}`,
      icon: Euro,
      color: 'from-primary-purple to-primary-purple',
      bgColor: 'bg-primary-purple/10'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statItems.map((item, index) => {
        const Icon = item.icon;
        
        return (
          <Card key={item.title} className="card-glow group cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${item.bgColor} group-hover:scale-110 transition-transform duration-300`}>
                <Icon className={`w-4 h-4 bg-gradient-to-r ${item.color} bg-clip-text text-transparent`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground group-hover:scale-105 transition-transform duration-300">
                {item.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                +12% seit letztem Monat
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default StatsCards;