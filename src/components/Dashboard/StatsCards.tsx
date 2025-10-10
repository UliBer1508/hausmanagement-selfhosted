import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardStats } from '@/types';

interface StatsCardsProps {
  stats: DashboardStats;
}

const StatsCards = ({ stats }: StatsCardsProps) => {
  const queryClient = useQueryClient();
  
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const statItems = [
    {
      title: 'Ferienhäuser',
      value: stats.totalHouses,
      emoji: '🏠',
      bgColor: 'bg-primary-blue/10'
    },
    {
      title: 'Aktive Buchungen',
      value: stats.activeBookings,
      emoji: '📅',
      bgColor: 'bg-primary-green/10'
    },
    {
      title: 'Offene Aufgaben',
      value: stats.pendingTasks,
      emoji: '✅',
      bgColor: 'bg-warm-orange/10'
    },
    {
      title: 'Monatsumsatz',
      value: `€${stats.totalRevenue.toLocaleString()}`,
      emoji: '💰',
      bgColor: 'bg-primary-purple/10'
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statItems.map((item, index) => {
        return (
          <Card key={item.title} className="card-glow group cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${item.bgColor} group-hover:scale-110 transition-transform duration-300`}>
                <span className="text-2xl">{item.emoji}</span>
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
    </div>
  );
};

export default StatsCards;