import Navigation from '@/components/Navigation';
import BookingOverview from '@/components/Bookings/BookingOverview';

const Bookings = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto p-6">
        <BookingOverview />
      </main>
    </div>
  );
};

export default Bookings;