import { ReactNode } from 'react';
import Navigation from '@/components/Navigation';
import InstallPrompt from '@/components/PWA/InstallPrompt';
import UpdatePrompt from '@/components/PWA/UpdatePrompt';

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="layout-container">
      <Navigation />
      
      {/* Main Content mit Padding für Mobile Navigation */}
      <main className="content-main min-h-screen pt-16 pb-24 lg:pt-0 lg:pb-0">
        {children}
      </main>

      {/* PWA Components */}
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
};

export default AppLayout;