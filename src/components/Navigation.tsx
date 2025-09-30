import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Home, Calendar, Settings, Sparkles, Droplets, BarChart3, Users, Menu, X, Building2, MoreHorizontal } from 'lucide-react';

const Navigation = () => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Hauptmenü für Bottom Navigation (Mobile)
  const mainNavigationItems = [
    { name: 'Dashboard', href: '/', emoji: '🏠', icon: BarChart3 },
    { name: 'Buchungen', href: '/bookings', emoji: '📅', icon: Calendar },
    { name: 'Gäste', href: '/guests', emoji: '👤', icon: Users },
    { name: 'Häuser', href: '/houses', emoji: '🏘️', icon: Home },
  ];

  // "Mehr" Menü Items
  const moreNavigationItems = [
    { name: 'Reinigung', href: '/cleaning', emoji: '✨', icon: Sparkles },
    { name: 'Wäscherei', href: '/laundry', emoji: '💧', icon: Droplets },
    { name: 'Provider', href: '/service-portal', emoji: '🏢', icon: Building2 },
    { name: 'Einstellungen', href: '/settings', emoji: '⚙️', icon: Settings }
  ];

  // Alle Items für Desktop Navigation
  const allNavigationItems = [...mainNavigationItems, ...moreNavigationItems];

  const isActivePath = (path: string) => {
    return location.pathname === path;
  };

  return (
    <>
      {/* Desktop Navigation - Sidebar */}
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
          {allNavigationItems.map((item) => {
            const Icon = item.icon;
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
                  <Icon className="w-4 h-4" />
                  {item.name}
                </Button>
              </Link>
            );
          })}
        </nav>
      </Card>

      {/* Mobile Top Header */}
      <Card className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-b">
        <div className="p-3 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center">
              <span className="text-lg">🏠</span>
            </div>
            <div>
              <h2 className="font-bold text-base text-gradient">Ferienhaus Manager</h2>
            </div>
          </div>
        </div>
      </Card>

      {/* Mobile Bottom Navigation Bar (PWA optimiert) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border/50 safe-area-padding">
        <div className="flex items-center justify-around px-2 py-2 max-w-screen-xl mx-auto">
          {mainNavigationItems.map((item) => {
            const isActive = isActivePath(item.href);
            
            return (
              <Link 
                key={item.name} 
                to={item.href}
                className={`flex flex-col items-center justify-center min-w-[60px] py-2 px-3 rounded-lg transition-all duration-200 ${
                  isActive 
                    ? 'bg-primary/10 text-primary scale-105' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
                }`}
              >
                <span className="text-2xl mb-1">{item.emoji}</span>
                <span className={`text-xs font-medium ${isActive ? 'font-semibold' : ''}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
          
          {/* Mehr Button mit Sheet */}
          <Sheet open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
            <SheetTrigger asChild>
              <button
                className="flex flex-col items-center justify-center min-w-[60px] py-2 px-3 rounded-lg transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-accent/30"
              >
                <span className="text-2xl mb-1">⋯</span>
                <span className="text-xs font-medium">Mehr</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[400px] rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Weitere Optionen</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-2">
                {moreNavigationItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = isActivePath(item.href);
                  
                  return (
                    <Link 
                      key={item.name} 
                      to={item.href}
                      onClick={() => setIsMoreMenuOpen(false)}
                    >
                      <Button
                        variant={isActive ? "default" : "ghost"}
                        className={`w-full justify-start gap-4 h-14 text-base ${
                          isActive 
                            ? 'bg-primary text-primary-foreground shadow-md' 
                            : 'hover:bg-accent/50'
                        }`}
                      >
                        <span className="text-2xl">{item.emoji}</span>
                        <span>{item.name}</span>
                      </Button>
                    </Link>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
};

export default Navigation;