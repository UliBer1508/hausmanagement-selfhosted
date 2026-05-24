import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitMerge } from 'lucide-react';
import { todayISO } from '@/lib/dateHelpers';

import { supabase } from '@/integrations/supabase/client';
import GuestOverview from './GuestOverview';
import GuestAnalytics from './GuestAnalytics';
import GuestCommunication from './GuestCommunication';
import GuestSegments from './GuestSegments';
import MarketingActions from './MarketingActions';
import { GuestDuplicatesDialog } from './GuestDuplicatesDialog';
import { useGuestDuplicates } from '@/hooks/useGuestDuplicates';
import RebookingCampaign from './RebookingCampaign';

const GuestManagement = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [duplicatesDialogOpen, setDuplicatesDialogOpen] = useState(false);
  
  const { data: duplicateGroups } = useGuestDuplicates();
  const duplicateCount = duplicateGroups?.reduce((sum, g) => sum + g.guests.length, 0) || 0;

  const handleExportCSV = async () => {
    try {
      // Fetch all guest data
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          *,
          houses!bookings_house_id_fkey!inner(name, address)
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
      link.setAttribute('download', `gaeste-export-${todayISO()}.csv`);
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
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Gäste-Management</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Verwalten Sie Ihre Gäste und deren Buchungshistorie</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button 
            onClick={() => setDuplicatesDialogOpen(true)} 
            variant="outline"
            size="sm"
            className="relative flex-1 sm:flex-none"
          >
            <GitMerge className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Duplikate prüfen</span>
            <span className="sm:hidden ml-2">Duplikate</span>
            {duplicateCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {duplicateCount}
              </Badge>
            )}
          </Button>
          <Button onClick={handleExportCSV} variant="outline" size="sm" className="flex-1 sm:flex-none">
            <span className="sm:mr-2">📥</span>
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden ml-2">Export</span>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 h-auto gap-1">
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
          <TabsTrigger value="rebooking" className="flex-col h-auto py-2 gap-1">
            <span className="text-base">🔄</span>
            <span className="text-xs">Wiederbuchung</span>
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

        <TabsContent value="rebooking" className="space-y-6">
          <RebookingCampaign />
        </TabsContent>
      </Tabs>

      <GuestDuplicatesDialog
        open={duplicatesDialogOpen}
        onOpenChange={setDuplicatesDialogOpen}
      />
    </div>
  );
};

export default GuestManagement;