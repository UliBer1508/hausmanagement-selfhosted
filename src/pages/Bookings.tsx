import BookingOverviewFixed from '@/components/Bookings/BookingOverviewFixed';
import ConnectedBookingView from '@/components/Bookings/ConnectedBookingView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Bookings = () => {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto p-6">
        <Tabs defaultValue="table" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="table">Tabellenansicht</TabsTrigger>
            <TabsTrigger value="connected">Verknüpfte Ansicht</TabsTrigger>
          </TabsList>
          
          <TabsContent value="table" className="space-y-0">
            <BookingOverviewFixed />
          </TabsContent>
          
          <TabsContent value="connected" className="space-y-0">
            <ConnectedBookingView />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Bookings;