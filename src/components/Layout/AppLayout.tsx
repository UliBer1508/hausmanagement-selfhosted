import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import InstallPrompt from '@/components/PWA/InstallPrompt';
import UpdatePrompt from '@/components/PWA/UpdatePrompt';
import { useProviderMessageNotifications } from '@/hooks/useProviderMessageNotifications';
import { useGuestContactReminders } from '@/hooks/useGuestContactReminders';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import pkg from '../../../package.json';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  // Global listener for provider message notifications
  useProviderMessageNotifications();
  
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
      {isAuthed && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          title="Abmelden"
          aria-label="Abmelden"
          className="fixed top-3 right-3 z-50 bg-background/80 backdrop-blur-sm border border-border/50 hover:bg-background"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      )}
      {/* Simplified Layout - No Sidebar */}
      <main className="content-main flex-1">
        {children}
      </main>

      {/* Global Copyright Footer */}
      <footer className="py-4 border-t border-border/50 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Steinbock Chalets · v{pkg.version}
        </p>
      </footer>

      {/* PWA Components */}
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
};

export default AppLayout;