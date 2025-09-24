import Navigation from '@/components/Navigation';
import Dashboard from '@/pages/Dashboard';

const Index = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="flex-1 p-6 lg:ml-0">
        <Dashboard />
      </main>
    </div>
  );
};

export default Index;
