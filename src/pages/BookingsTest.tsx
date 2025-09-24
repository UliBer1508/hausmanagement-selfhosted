import Navigation from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const BookingsTest = () => {
  // Test query to check if Supabase connection works
  const { data: bookings, isLoading, error } = useQuery({
    queryKey: ['bookings-test'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .limit(5);
      
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Buchungsübersicht (Test)</h1>
            <p className="text-muted-foreground">Test der Buchungsdaten aus der Datenbank</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <span>Buchungen werden geladen...</span>
                </div>
              )}
              
              {error && (
                <div className="text-red-500">
                  <p>Fehler beim Laden der Buchungen:</p>
                  <pre className="mt-2 text-sm bg-red-50 p-2 rounded">
                    {error.message}
                  </pre>
                </div>
              )}
              
              {bookings && (
                <div>
                  <p className="text-green-600 font-medium">
                    ✅ Erfolgreich {bookings.length} Buchungen geladen
                  </p>
                  <div className="mt-4 space-y-2">
                    {bookings.map((booking, index) => (
                      <div key={booking.id} className="p-3 bg-muted rounded border">
                        <div className="font-medium">{booking.guest_name}</div>
                        <div className="text-sm text-muted-foreground">
                          Check-in: {new Date(booking.check_in).toLocaleDateString('de-DE')}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Status: {booking.status}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default BookingsTest;