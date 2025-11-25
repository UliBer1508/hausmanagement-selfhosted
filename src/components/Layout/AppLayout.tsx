import { ReactNode } from 'react';
import Navigation from '@/components/Navigation';
import InstallPrompt from '@/components/PWA/InstallPrompt';
import UpdatePrompt from '@/components/PWA/UpdatePrompt';
import { useProviderMessageNotifications } from '@/hooks/useProviderMessageNotifications';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  // Global listener for provider message notifications
  useProviderMessageNotifications();

  return (
    <div className="layout-container">
      {/* Simplified Layout - No Sidebar */}
      <main className="content-main min-h-screen">
        {children}
      </main>

      {/* PWA Components */}
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
};

export default AppLayout;