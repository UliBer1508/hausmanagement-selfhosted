import Navigation from '@/components/Navigation';
import OriginalDashboard from '@/pages/OriginalDashboard';

const Index = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <div className="flex-1 lg:ml-64">
        <OriginalDashboard />
      </div>
    </div>
  );
};

export default Index;
