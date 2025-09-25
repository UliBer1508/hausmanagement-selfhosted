import Navigation from '@/components/Navigation';
import LinenDashboard from '@/components/Houses/LinenDashboard';

const Laundry = () => {
  return (
    <div className="min-h-screen bg-background flex">
      <Navigation />
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold gradient-text">Wäsche-Management</h1>
            <p className="text-muted-foreground mt-2">
              Überblick über Wäschebestände und automatische Bedarfsanalyse
            </p>
          </div>
          <LinenDashboard />
        </div>
      </main>
    </div>
  );
};

export default Laundry;