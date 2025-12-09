import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LaundryInvoice {
  id: string;
  external_rechnung_id: string;
  external_bestellung_id: string | null;
  external_kunde_id: string | null;
  rechnungsnummer: string;
  rechnungsdatum: string;
  faelligkeitsdatum: string | null;
  kunde_name: string | null;
  kunde_kundennummer: string | null;
  kunde_strasse: string | null;
  kunde_plz: string | null;
  kunde_ort: string | null;
  nettobetrag: number | null;
  mwst_satz: number | null;
  mwst_betrag: number | null;
  bearbeitungsgebuehr: number | null;
  bruttobetrag: number;
  status: 'offen' | 'bezahlt' | 'storniert' | 'mahnung';
  bezahlt_am: string | null;
  positionen: InvoicePosition[] | null;
  synced_at: string | null;
  external_updated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoicePosition {
  id: string;
  rechnung_id: string;
  artikelnummer: string;
  bezeichnung: string;
  menge: number;
  einzelpreis: number;
  gesamtpreis: number;
}

interface LaundryInvoiceFilters {
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export const useLaundryInvoices = (filters?: LaundryInvoiceFilters) => {
  return useQuery({
    queryKey: ['laundry-invoices', filters],
    queryFn: async () => {
      let query = supabase
        .from('laundry_invoices')
        .select('*')
        .order('rechnungsdatum', { ascending: false });

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters?.dateFrom) {
        query = query.gte('rechnungsdatum', filters.dateFrom.toISOString().split('T')[0]);
      }

      if (filters?.dateTo) {
        query = query.lte('rechnungsdatum', filters.dateTo.toISOString().split('T')[0]);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching laundry invoices:', error);
        throw error;
      }

      // Transform the data to match our interface
      return (data || []).map(invoice => ({
        ...invoice,
        positionen: Array.isArray(invoice.positionen) 
          ? invoice.positionen as unknown as InvoicePosition[]
          : null,
      })) as LaundryInvoice[];
    },
  });
};

export const useSyncLaundryInvoices = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-laundry-invoices');

      if (error) {
        throw new Error(error.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Sync failed');
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['laundry-invoices'] });
      toast.success(data.message || 'Rechnungen synchronisiert');
    },
    onError: (error) => {
      console.error('Sync error:', error);
      toast.error(`Sync fehlgeschlagen: ${error.message}`);
    },
  });
};

export const useMarkInvoicePaid = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, paidDate }: { invoiceId: string; paidDate?: string }) => {
      const { error } = await supabase
        .from('laundry_invoices')
        .update({
          status: 'bezahlt',
          bezahlt_am: paidDate || new Date().toISOString().split('T')[0],
        })
        .eq('id', invoiceId);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-invoices'] });
      toast.success('Rechnung als bezahlt markiert');
    },
    onError: (error) => {
      console.error('Error marking invoice as paid:', error);
      toast.error('Fehler beim Aktualisieren des Status');
    },
  });
};

export const useUpdateInvoiceNotes = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, notes }: { invoiceId: string; notes: string }) => {
      const { error } = await supabase
        .from('laundry_invoices')
        .update({ notes })
        .eq('id', invoiceId);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-invoices'] });
      toast.success('Notizen gespeichert');
    },
    onError: (error) => {
      console.error('Error updating notes:', error);
      toast.error('Fehler beim Speichern der Notizen');
    },
  });
};

// Computed stats for invoices
export const useInvoiceStats = () => {
  const { data: invoices, isLoading } = useLaundryInvoices();

  const stats = {
    openCount: 0,
    openAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    paidThisMonth: 0,
    paidThisMonthAmount: 0,
    totalCount: 0,
  };

  if (invoices) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    invoices.forEach((invoice) => {
      stats.totalCount++;

      if (invoice.status === 'offen') {
        stats.openCount++;
        stats.openAmount += invoice.bruttobetrag;

        // Check if overdue
        if (invoice.faelligkeitsdatum && new Date(invoice.faelligkeitsdatum) < today) {
          stats.overdueCount++;
          stats.overdueAmount += invoice.bruttobetrag;
        }
      }

      if (invoice.status === 'bezahlt' && invoice.bezahlt_am) {
        const paidDate = new Date(invoice.bezahlt_am);
        if (paidDate >= startOfMonth) {
          stats.paidThisMonth++;
          stats.paidThisMonthAmount += invoice.bruttobetrag;
        }
      }
    });
  }

  return { stats, isLoading };
};
