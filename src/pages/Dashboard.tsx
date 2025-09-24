import StatsCards from '@/components/Dashboard/StatsCards';
import RecentBookings from '@/components/Dashboard/RecentBookings';
import TaskOverview from '@/components/Dashboard/TaskOverview';
import { 
  mockDashboardStats, 
  mockBookings, 
  mockHouses, 
  mockCleaningTasks, 
  mockLinenOrders 
} from '@/data/mockData';

const Dashboard = () => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold gradient-text">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Überblick über Ihre Ferienhäuser und Services
        </p>
      </div>

      {/* Stats Cards */}
      <StatsCards stats={mockDashboardStats} />

      {/* Recent Bookings */}
      <RecentBookings bookings={mockBookings} houses={mockHouses} />

      {/* Task Overview */}
      <TaskOverview 
        cleaningTasks={mockCleaningTasks} 
        linenOrders={mockLinenOrders} 
      />
    </div>
  );
};

export default Dashboard;