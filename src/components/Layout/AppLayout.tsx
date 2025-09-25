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
      {/* Mobile Layout */}
      <div className="layout-mobile">
        <Navigation />
        <main className="content-main">
          {children}
        </main>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex layout-desktop">
        <Navigation />
        <main className="content-main">
          {children}
        </main>
      </div>

      {/* PWA Components */}
      <InstallPrompt />
      <UpdatePrompt />
    </div>
  );
};

export default AppLayout;