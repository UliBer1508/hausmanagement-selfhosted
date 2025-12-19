import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Home } from 'lucide-react';
import ConnectionStatus from '@/components/PWA/ConnectionStatus';
import PWAStatus from '@/components/PWA/PWAStatus';
import { useHouses } from '@/hooks/useHouses';
import { useMemo } from 'react';

// Navigation component for Ferienhaus Manager
const Navigation = () => {
  const location = useLocation();
  const { data: houses } = useHouses();
  
  // Calculate total urgent orders across all houses
  const totalUrgentOrders = useMemo(() => {
    return 0;
  }, [houses]);

  const navigationItems = [
    { name: 'Übersicht', emoji: '📊' },
    { name: 'Kalender', emoji: '📅' },
    { name: 'Häuser', emoji: '🏠' },
    { name: 'Buchungen', emoji: '🗓️' },
    { name: 'Gäste', emoji: '👥' },
    { name: 'Mieter', emoji: '🏘️' },
    { name: 'Reinigung', emoji: '✨' },
    { name: 'Wäsche', emoji: '💧', badge: totalUrgentOrders },
    { name: 'Provider', emoji: '🏢' },
    { name: 'Einstellungen', emoji: '⚙️' }
  ];

  // Get active tab from location state or default to 'Übersicht'
  const activeTab = (location.state as { activeTab?: string })?.activeTab || 'Übersicht';

  const isActiveTab = (tabName: string) => {
    return activeTab === tabName;
  };

  return (
    <>
      {/* Desktop Navigation */}
      <Card className="hidden lg:flex h-screen w-64 flex-col bg-card/50 backdrop-blur-sm border-r card-glow sticky top-0">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center">
              <Home className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-gradient">Ferienhaus</h2>
              <p className="text-sm text-muted-foreground">Manager</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionStatus />
            <PWAStatus />
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navigationItems.map((item) => {
            const isActive = isActiveTab(item.name);
            
            return (
              <Link key={item.name} to="/" state={{ activeTab: item.name }}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className={`w-full justify-start gap-3 transition-all duration-200 relative ${
                    isActive 
                      ? 'bg-primary text-primary-foreground shadow-lg' 
                      : 'hover:bg-accent/50 hover:translate-x-1'
                  }`}
                >
                  <span className="text-lg">{item.emoji}</span>
                  {item.name}
                  {item.badge && item.badge > 0 && (
                    <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] px-1 flex items-center justify-center text-xs">
                      {item.badge}
                    </Badge>
                  )}
                </Button>
              </Link>
            );
          })}
        </nav>
        
        {/* Desktop Footer */}
        <div className="p-4 border-t border-border/50 text-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Steinbock
          </p>
        </div>
      </Card>

      {/* Mobile Navigation - Multi-row Grid */}
      <Card className="lg:hidden bg-card/50 backdrop-blur-sm border-b">
        <div className="p-2">
          {/* Compact Logo Header */}
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
            <div className="w-7 h-7 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center">
              <Home className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-sm text-gradient truncate">Ferienhaus Manager</h2>
            </div>
            <div className="flex items-center gap-1">
              <ConnectionStatus />
              <PWAStatus />
            </div>
          </div>
          
          {/* Navigation Grid - 2 columns x 5 rows */}
          <div className="grid grid-cols-2 gap-2">
            {navigationItems.map((item) => {
              const isActive = isActiveTab(item.name);
              
              return (
                <Link key={item.name} to="/" state={{ activeTab: item.name }}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className={`w-full h-11 flex flex-row items-center justify-start gap-3 px-3 transition-all duration-200 ${
                      isActive 
                        ? 'bg-primary text-primary-foreground shadow-md' 
                        : 'hover:bg-accent/50'
                    }`}
                  >
                    <span className="text-lg shrink-0">{item.emoji}</span>
                    <span className="text-sm truncate">{item.name}</span>
                    {item.badge && item.badge > 0 && (
                      <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] px-1 flex items-center justify-center text-xs">
                        {item.badge}
                      </Badge>
                    )}
                  </Button>
                </Link>
              );
            })}
          </div>
          
          {/* Mobile Footer */}
          <div className="mt-3 pt-2 border-t border-border/50 text-center">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Steinbock Ferienhaus Manager
            </p>
          </div>
        </div>
      </Card>
    </>
  );
};

export default Navigation;
