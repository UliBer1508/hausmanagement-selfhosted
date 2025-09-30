import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Home } from 'lucide-react';

const Navigation = () => {
  const location = useLocation();

  const navigationItems = [
    { name: 'Übersicht', href: '/', emoji: '📊' },
    { name: 'Häuser', href: '/houses', emoji: '🏠' },
    { name: 'Buchungen', href: '/bookings', emoji: '📅' },
    { name: 'Gäste', href: '/guests', emoji: '👥' },
    { name: 'Reinigung', href: '/cleaning', emoji: '✨' },
    { name: 'Wäsche', href: '/laundry', emoji: '💧' },
    { name: 'Provider', href: '/service-portal', emoji: '🏢' },
    { name: 'Einstellungen', href: '/settings', emoji: '⚙️' }
  ];

  const isActivePath = (path: string) => {
    return location.pathname === path;
  };

  return (
    <>
      {/* Desktop Navigation */}
      <Card className="hidden lg:flex h-screen w-64 flex-col bg-card/50 backdrop-blur-sm border-r card-glow sticky top-0">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center">
              <Home className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-gradient">Ferienhaus</h2>
              <p className="text-sm text-muted-foreground">Manager</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navigationItems.map((item) => {
            const isActive = isActivePath(item.href);
            
            return (
              <Link key={item.name} to={item.href}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className={`w-full justify-start gap-3 transition-all duration-200 ${
                    isActive 
                      ? 'bg-primary text-primary-foreground shadow-lg' 
                      : 'hover:bg-accent/50 hover:translate-x-1'
                  }`}
                >
                  <span className="text-lg">{item.emoji}</span>
                  {item.name}
                </Button>
              </Link>
            );
          })}
        </nav>
      </Card>

      {/* Mobile Navigation - Multi-row Grid */}
      <Card className="lg:hidden bg-card/50 backdrop-blur-sm border-b">
        <div className="p-3">
          {/* Logo Header */}
          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border/50">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center">
              <Home className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-base text-gradient">Ferienhaus</h2>
              <p className="text-xs text-muted-foreground">Manager</p>
            </div>
          </div>
          
          {/* Navigation Grid - 4 columns, multiple rows */}
          <div className="grid grid-cols-4 gap-2">
            {navigationItems.map((item) => {
              const isActive = isActivePath(item.href);
              
              return (
                <Link key={item.name} to={item.href}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className={`w-full h-auto flex flex-col items-center gap-1 py-3 px-2 transition-all duration-200 ${
                      isActive 
                        ? 'bg-primary text-primary-foreground shadow-md' 
                        : 'hover:bg-accent/50'
                    }`}
                  >
                    <span className="text-2xl">{item.emoji}</span>
                    <span className="text-xs leading-tight text-center">{item.name}</span>
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      </Card>
    </>
  );
};

export default Navigation;