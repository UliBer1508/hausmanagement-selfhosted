import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import InstallPrompt from '@/components/PWA/InstallPrompt';
import UpdatePrompt from '@/components/PWA/UpdatePrompt';
import { useProviderMessageNotifications } from '@/hooks/useProviderMessageNotifications';
import { useGuestContactReminders } from '@/hooks/useGuestContactReminders';
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import pkg from '../../../package.json';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  // Global listener for provider message notifications
  useProviderMessageNotifications();
  // Force refresh installed PWA when a new build is deployed
  useAppVersionCheck();
  
  // Guest contact reminder notification on app start
  const { guestsToContact, isLoading } = useGuestContactReminders();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setIsAuthed(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAuthed(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: 'Abgemeldet', description: 'Du wurdest erfolgreich abgemeldet.' });
    navigate('/login', { replace: true });
  };
  
  useEffect(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const lastShown = localStorage.getItem('guest-contact-toast-shown');
    
    if (lastShown !== today && !isLoading && guestsToContact.length > 0) {
      toast({
        title: `📞 ${guestsToContact.length} ${guestsToContact.length === 1 ? 'Gast' : 'Gäste'} kontaktieren`,
        description: `Check-in in ca. 8 Tagen. Jetzt vor Anreise kontaktieren!`,
        duration: 10000,
      });
      
      localStorage.setItem('guest-contact-toast-shown', today);
    }
  }, [guestsToContact, isLoading, toast]);

  return (
    <div className="layout-container min-h-screen flex flex-col">
      {/* Simplified Layout - No Sidebar */}
      <main className="content-main flex-1">
        {children}
      </main>

      {/* Global Copyright Footer */}
      <footer className="py-4 border-t border-border/50 px-4 flex items-center justify-center gap-4 relative">
        <p className="text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} Steinbock Chalets · v{pkg.version}
        </p>
        {isAuthed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" />
            Abmelden
          </Button>
        )}
      </footer>

      {/* PWA Components */}
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
};

export default AppLayout;