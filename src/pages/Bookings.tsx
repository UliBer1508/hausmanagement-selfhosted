import Navigation from '@/components/Navigation';
import BookingOverviewFixed from '@/components/Bookings/BookingOverviewFixed';

const Bookings = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto p-6">
        <BookingOverviewFixed />
      </main>
    </div>
  );
};

export default Bookings;