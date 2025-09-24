import Navigation from '@/components/Navigation';
import BookingOverviewFixed from '@/components/Bookings/BookingOverviewFixed';

const Bookings = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <div className="flex-1 lg:ml-64">
        <main className="container mx-auto p-6">
          <BookingOverviewFixed />
        </main>
      </div>
    </div>
  );
};

export default Bookings;