import { SmartLinenDashboardWithTabs } from '@/components/Houses/SmartLinenDashboardWithTabs';
import AppLayout from '@/components/Layout/AppLayout';

const Laundry = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Wäscherei Management</h1>
          <p className="text-muted-foreground mt-2">
            Buchungsbezogene Bestellungen und intelligentes Inventar-Management
          </p>
        </div>
        <SmartLinenDashboardWithTabs />
      </div>
    </AppLayout>
  );
};

export default Laundry;
