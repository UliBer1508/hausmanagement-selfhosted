import SmartLinenDashboard from '@/components/Houses/SmartLinenDashboard';
import AppLayout from '@/components/Layout/AppLayout';

const Laundry = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Wäscherei Management</h1>
          <p className="text-muted-foreground mt-2">
            Intelligente Verwaltung von Bettwäsche und Handtüchern
          </p>
        </div>
        <SmartLinenDashboard />
      </div>
    </AppLayout>
  );
};

export default Laundry;