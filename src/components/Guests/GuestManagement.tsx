import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

import { supabase } from '@/integrations/supabase/client';
import GuestOverview from './GuestOverview';
import GuestAnalytics from './GuestAnalytics';
import GuestCommunication from './GuestCommunication';
import GuestSegments from './GuestSegments';
import MarketingActions from './MarketingActions';

const GuestManagement = () => {
  const [activeTab, setActiveTab] = useState('overview');

  const handleExportCSV = async () => {
    try {
      // Fetch all guest data
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          *,
          houses!house_id!inner(name, address)
        `)
        .not('guest_name', 'is', null);

      if (!bookings || bookings.length === 0) {
        console.log('Keine Gästedaten zum Exportieren gefunden');
        return;
      }

      // Group by guest and aggregate data
      const guestMap = new Map();
      
      bookings.forEach(booking => {
        const guestKey = `${booking.guest_name}-${booking.guest_email || ''}-${booking.guest_phone || ''}`;
        
        if (!guestMap.has(guestKey)) {
          guestMap.set(guestKey, {
            guest_name: booking.guest_name,
            guest_email: booking.guest_email,
            guest_phone: booking.guest_phone,
            nationality: booking.nationality,
            bookings: [],
            total_revenue: 0,
            stay_count: 0,
            last_stay: null,
            avg_guests: 0,
          });
        }

        const guest = guestMap.get(guestKey);
        guest.bookings.push(booking);
        guest.total_revenue += booking.booking_amount || 0;
        guest.stay_count += 1;

        // Find most recent stay
        if (!guest.last_stay || new Date(booking.check_in) > new Date(guest.last_stay)) {
          guest.last_stay = booking.check_in;
        }

        // Calculate average guests
        const totalGuests = guest.bookings.reduce((sum: number, b: any) => sum + (b.number_of_guests || 0), 0);
        guest.avg_guests = Math.round((totalGuests / guest.stay_count) * 10) / 10;
      });

      const guests = Array.from(guestMap.values());

      // Create CSV content
      const headers = [
        'Name',
        'E-Mail',
        'Telefon',
        'Nationalität',
        'Anzahl Aufenthalte',
        'Gesamtumsatz (€)',
        'Letzter Aufenthalt',
        'Durchschnittliche Gästeanzahl',
        'Status'
      ];

      const csvRows = [
        headers.join(','),
        ...guests.map(guest => [
          `"${guest.guest_name || ''}"`,
          `"${guest.guest_email || ''}"`,
          `"${guest.guest_phone || ''}"`,
          `"${guest.nationality || ''}"`,
          guest.stay_count,
          guest.total_revenue,
          guest.last_stay ? new Date(guest.last_stay).toLocaleDateString('de-DE') : '',
          guest.avg_guests,
          guest.stay_count > 1 ? 'Stammgast' : 'Neuer Gast'
        ].join(','))
      ];

      const csvContent = csvRows.join('\n');
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `gaeste-export-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`Gästeliste mit ${guests.length} Einträgen erfolgreich exportiert`);
    } catch (error) {
      console.error('Fehler beim Exportieren der Gästeliste:', error);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gäste-Management</h1>
          <p className="text-muted-foreground">Verwalten Sie Ihre Gäste und deren Buchungshistorie</p>
        </div>
        <Button onClick={handleExportCSV} variant="outline">
          <span className="mr-2">📥</span>
          Export CSV
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5 h-auto gap-1">
          <TabsTrigger value="overview" className="flex-col h-auto py-2 gap-1">
            <span className="text-base">📋</span>
            <span className="text-xs">Übersicht</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex-col h-auto py-2 gap-1">
            <span className="text-base">📊</span>
            <span className="text-xs">Analysen</span>
          </TabsTrigger>
          <TabsTrigger value="communication" className="flex-col h-auto py-2 gap-1">
            <span className="text-base">💬</span>
            <span className="text-xs">Kommunikation</span>
          </TabsTrigger>
          <TabsTrigger value="segments" className="flex-col h-auto py-2 gap-1">
            <span className="text-base">🎯</span>
            <span className="text-xs">Segmente</span>
          </TabsTrigger>
          <TabsTrigger value="marketing" className="flex-col h-auto py-2 gap-1">
            <span className="text-base">🎁</span>
            <span className="text-xs">Marketing</span>
          </TabsTrigger>
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

        <TabsContent value="marketing" className="space-y-6">
          <MarketingActions />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GuestManagement;