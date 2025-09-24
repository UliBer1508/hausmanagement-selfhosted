import BookingOverviewFixed from '@/components/Bookings/BookingOverviewFixed';

const Bookings = () => {
  return (
    <div className="lg:ml-64 min-h-screen bg-background">
      <main className="container mx-auto p-6">
        <BookingOverviewFixed />
      </main>
    </div>
  );
};

export default Bookings;