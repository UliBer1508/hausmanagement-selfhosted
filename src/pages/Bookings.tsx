import BookingOverviewFixed from '@/components/Bookings/BookingOverviewFixed';

const Bookings = () => {
  console.log('=== BOOKINGS PAGE RENDERED ===');
  
  return (
    <div className="lg:ml-64 min-h-screen bg-background">
      <main className="container mx-auto p-6">
        <div style={{ padding: '20px', backgroundColor: 'yellow', marginBottom: '20px' }}>
          <h1>BOOKINGS PAGE DEBUG - Diese Seite wird geladen!</h1>
        </div>
        <BookingOverviewFixed />
      </main>
    </div>
  );
};

export default Bookings;