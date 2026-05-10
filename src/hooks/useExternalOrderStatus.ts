import { useQuery } from '@tanstack/react-query';
import { externalLaundryClient } from '@/integrations/externalLaundry/client';

interface ExternalOrderStatus {
  status: string;
  totalPrice: number;
  bestellnummer: string;
}

interface ExternalOrdersStatusMap {
  [bestellnummer: string]: {
    status: string;
    totalPrice: number;
  };
}

// Single order status hook
export const useExternalOrderStatus = (externalBestellnummer: string | null) => {
  return useQuery<ExternalOrderStatus | null>({
    queryKey: ['external-order-status', externalBestellnummer],
    queryFn: async () => {
      if (!externalBestellnummer) return null;
      
      // 1. Bestellung laden
      const { data: order, error: orderError } = await externalLaundryClient
        .from('waeschebestellungen')
        .select('id, bestellnummer, status')
        .eq('bestellnummer', externalBestellnummer)
        .single();
      
      if (orderError || !order) return null;
      
      // 2. Positionen mit Preisen laden
      const { data: positionen } = await externalLaundryClient
        .from('bestellpositionen')
        .select(`
          menge,
          waescheartikel (preis)
        `)
        .eq('bestellung_id', order.id);
      
      // 3. Preis berechnen
      const totalPrice = positionen?.reduce((sum, pos: any) => {
        const preis = pos.waescheartikel?.preis || 0;
        return sum + (pos.menge * preis);
      }, 0) || 0;
      
      return {
        status: order.status,
        totalPrice,
        bestellnummer: order.bestellnummer
      };
    },
    enabled: !!externalBestellnummer,
    staleTime: 5 * 60 * 1000, // 5 Minuten Cache
  });
};

// Batch loading for multiple orders
export const useExternalOrdersStatus = (bestellnummern: string[]) => {
  return useQuery<ExternalOrdersStatusMap>({
    queryKey: ['external-orders-status', bestellnummern.sort().join(',')],
    queryFn: async () => {
      if (bestellnummern.length === 0) return {};
      
      // Alle Bestellungen auf einmal laden
      const { data: orders, error } = await externalLaundryClient
        .from('waeschebestellungen')
        .select('id, bestellnummer, status')
        .in('bestellnummer', bestellnummern);
      
      if (error || !orders) return {};
      
      // Für jede Bestellung die Positionen laden und Preis berechnen
      const statusMap: ExternalOrdersStatusMap = {};
      
      for (const order of orders) {
        const { data: positionen } = await externalLaundryClient
          .from('bestellpositionen')
          .select(`
            menge,
            waescheartikel (preis)
          `)
          .eq('bestellung_id', order.id);
        
        const totalPrice = positionen?.reduce((sum, pos: any) => {
          const preis = pos.waescheartikel?.preis || 0;
          return sum + (pos.menge * preis);
        }, 0) || 0;
        
        statusMap[order.bestellnummer] = {
          status: order.status,
          totalPrice
        };
      }
      
      return statusMap;
    },
    enabled: bestellnummern.length > 0,
    staleTime: 60 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data as ExternalOrdersStatusMap | undefined;
      if (!data) return false;
      const hasOpen = Object.values(data).some(
        (v) => v.status === 'neu' || v.status === 'in_bearbeitung'
      );
      return hasOpen ? 60_000 : false;
    },
  });
};

// Helper function to translate external status to German with badge info
export const getExternalStatusBadgeInfo = (status: string | null | undefined): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
} => {
  switch (status) {
    case 'neu':
      return { label: '🟡 Neu', variant: 'secondary', className: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'in_bearbeitung':
      return { label: '🔵 In Bearbeitung', variant: 'secondary', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'ausgeliefert':
      return { label: '🚚 Ausgeliefert', variant: 'secondary', className: 'bg-cyan-100 text-cyan-800 border-cyan-200' };
    case 'abgeholt':
      return { label: '📦 Abgeholt', variant: 'secondary', className: 'bg-purple-100 text-purple-800 border-purple-200' };
    case 'abgeschlossen':
      return { label: '✅ Abgeschlossen', variant: 'default', className: 'bg-green-100 text-green-800 border-green-200' };
    case 'storniert':
      return { label: '❌ Storniert', variant: 'destructive', className: 'bg-red-100 text-red-800 border-red-200' };
    default:
      return { label: '⚪ Nicht im Portal', variant: 'outline', className: 'bg-muted text-muted-foreground' };
  }
};
