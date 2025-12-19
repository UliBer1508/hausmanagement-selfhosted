import { ReactNode, useEffect } from 'react';
import InstallPrompt from '@/components/PWA/InstallPrompt';
import UpdatePrompt from '@/components/PWA/UpdatePrompt';
import { useProviderMessageNotifications } from '@/hooks/useProviderMessageNotifications';
import { useGuestContactReminders } from '@/hooks/useGuestContactReminders';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  // Global listener for provider message notifications
  useProviderMessageNotifications();
  
  // Guest contact reminder notification on app start
  const { guestsToContact, isLoading } = useGuestContactReminders();
  const { toast } = useToast();
  
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
      <footer className="py-4 border-t border-border/50 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Copy Right Steinbock Chalets
        </p>
      </footer>

      {/* PWA Components */}
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
};

export default AppLayout;