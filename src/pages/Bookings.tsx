import BookingOverviewFixed from '@/components/Bookings/BookingOverviewFixed';

const Bookings = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="lg:ml-64">
        <main className="container mx-auto p-6">
          <BookingOverviewFixed />
        </main>
      </div>
    </div>
  );
};

export default Bookings;