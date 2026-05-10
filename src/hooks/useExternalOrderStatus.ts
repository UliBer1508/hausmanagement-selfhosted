import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

type PortalOrder = {
  bestellnummer: string;
  status: string;
  gesamt_preis?: number;
};

// Single order status hook
export const useExternalOrderStatus = (externalBestellnummer: string | null) => {
  return useQuery<ExternalOrderStatus | null>({
    queryKey: ['external-order-status', externalBestellnummer],
    queryFn: async () => {
      if (!externalBestellnummer) return null;

      const { data, error } = await supabase.functions.invoke('get-external-order-status', {
        body: { bestellnummer: externalBestellnummer },
      });
      if (error || !data) return null;
      const order: PortalOrder | undefined = data.orders?.[0] ?? (data.bestellnummer ? data : undefined);
      if (!order) return null;
      return {
        status: order.status,
        totalPrice: Number(order.gesamt_preis ?? 0),
        bestellnummer: order.bestellnummer,
      };
    },
    enabled: !!externalBestellnummer,
    staleTime: 60 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data as ExternalOrderStatus | null | undefined;
      if (!data) return false;
      return data.status === 'neu' || data.status === 'in_bearbeitung' ? 60_000 : false;
    },
  });
};

// Batch loading for multiple orders
export const useExternalOrdersStatus = (bestellnummern: string[]) => {
  return useQuery<ExternalOrdersStatusMap>({
    queryKey: ['external-orders-status', bestellnummern.sort().join(',')],
    queryFn: async () => {
      if (bestellnummern.length === 0) return {};

      const { data, error } = await supabase.functions.invoke('get-external-order-status', {
        body: { bestellnummern },
      });
      if (error || !data?.orders) return {};

      const statusMap: ExternalOrdersStatusMap = {};
      for (const order of data.orders as PortalOrder[]) {
        statusMap[order.bestellnummer] = {
          status: order.status,
          totalPrice: Number(order.gesamt_preis ?? 0),
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
