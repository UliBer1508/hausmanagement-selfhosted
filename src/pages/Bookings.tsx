import BookingOverviewFixed from '@/components/Bookings/BookingOverviewFixed';
import ConnectedBookingView from '@/components/Bookings/ConnectedBookingView';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/components/Layout/AppLayout';

const Bookings = () => {
  
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Buchungsmanagement</h1>
          <p className="text-muted-foreground mt-2">Verwalten Sie alle Buchungen und verknüpften Services</p>
        </div>
        
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
      </div>
    </AppLayout>
  );
};

export default Bookings;