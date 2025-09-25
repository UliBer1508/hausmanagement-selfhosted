import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import GuestOverview from './GuestOverview';
import GuestAnalytics from './GuestAnalytics';
import GuestCommunication from './GuestCommunication';
import GuestSegments from './GuestSegments';

const GuestManagement = () => {
  const [activeTab, setActiveTab] = useState('overview');

  const handleExportCSV = () => {
    // TODO: Implement CSV export functionality
    console.log('Exporting guest data to CSV...');
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gäste-Management</h1>
          <p className="text-muted-foreground">Verwalten Sie Ihre Gäste und deren Buchungshistorie</p>
        </div>
        <Button onClick={handleExportCSV} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="analytics">Analysen</TabsTrigger>
          <TabsTrigger value="communication">Kommunikation</TabsTrigger>
          <TabsTrigger value="segments">Segmente</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <GuestOverview />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <GuestAnalytics />
        </TabsContent>

        <TabsContent value="communication" className="space-y-6">
          <GuestCommunication />
        </TabsContent>

        <TabsContent value="segments" className="space-y-6">
          <GuestSegments />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GuestManagement;