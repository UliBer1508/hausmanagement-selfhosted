import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Home, Calendar, Settings, Sparkles, Droplets, BarChart3, Users, Menu, X } from 'lucide-react';

const Navigation = () => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigationItems = [
    { name: 'Dashboard', href: '/', icon: BarChart3 },
    { name: 'Ferienhäuser', href: '/houses', icon: Home },
    { name: 'Buchungen', href: '/bookings', icon: Calendar },
    { name: 'Reinigung', href: '/cleaning', icon: Sparkles },
    { name: 'Wäscherei', href: '/laundry', icon: Droplets },
    { name: 'Provider', href: '/providers', icon: Users },
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
            <div className="w-10 h-10 bg-gradient-to-br from-primary-blue to-primary-purple rounded-lg flex items-center justify-center">
              <Home className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg gradient-text">Ferienhaus</h2>
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
                      ? 'btn-gradient text-white shadow-lg' 
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

      {/* Mobile Navigation */}
      <div className="lg:hidden">
        {/* Mobile Header */}
        <Card className="flex items-center justify-between p-4 border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-blue to-primary-purple rounded-lg flex items-center justify-center">
              <Home className="w-4 h-4 text-white" />
            </div>
            <h2 className="font-bold gradient-text">Ferienhaus Manager</h2>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </Card>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
            <Card className="fixed left-0 top-0 h-full w-64 bg-card shadow-xl">
              <div className="p-6 border-b">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary-blue to-primary-purple rounded-lg flex items-center justify-center">
                    <Home className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-lg gradient-text">Ferienhaus</h2>
                    <p className="text-sm text-muted-foreground">Manager</p>
                  </div>
                </div>
              </div>

              <nav className="p-4 space-y-1">
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
                            ? 'btn-gradient text-white' 
                            : 'hover:bg-accent/50'
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
          </div>
        )}
      </div>
    </>
  );
};

export default Navigation;