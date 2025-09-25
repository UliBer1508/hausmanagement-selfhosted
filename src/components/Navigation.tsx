import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Home, Calendar, Settings, Sparkles, Droplets, BarChart3, Users, Menu, X, Building2 } from 'lucide-react';

const Navigation = () => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigationItems = [
    { name: 'Dashboard', href: '/', icon: BarChart3 },
    { name: 'Ferienhäuser', href: '/houses', icon: Home },
    { name: 'Buchungen', href: '/bookings', icon: Calendar },
    { name: 'Gäste', href: '/guests', icon: Users },
    { name: 'Reinigung', href: '/cleaning', icon: Sparkles },
    { name: 'Wäscherei', href: '/laundry', icon: Droplets },
    { name: 'Provider', href: '/providers', icon: Building2 },
    { name: 'Einstellungen', href: '/settings', icon: Settings }
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

      {/* Mobile Navigation Header - Responsive */}
      <Card className="lg:hidden bg-card/50 backdrop-blur-sm border-b">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center">
              <Home className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-gradient">Ferienhaus</h2>
              <p className="text-xs text-muted-foreground">Manager</p>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
        
        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="border-t border-border/50 p-2 pb-4 space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = isActivePath(item.href);
              
              return (
                <Link 
                  key={item.name} 
                  to={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className={`w-full justify-start gap-3 transition-all duration-200 ${
                      isActive 
                        ? 'bg-primary text-primary-foreground shadow-md' 
                        : 'hover:bg-accent/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </Button>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
};

export default Navigation;