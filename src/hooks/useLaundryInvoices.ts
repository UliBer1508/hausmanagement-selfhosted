import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { todayISO, toISODate } from '@/lib/dateHelpers';

export interface LaundryInvoice {
  id: string;
  external_rechnung_id: string;
  external_bestellung_id: string | null;
  external_kunde_id: string | null;
  // linked orders are now on linen_orders.laundry_invoice_id
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
        query = query.gte('rechnungsdatum', toISODate(filters.dateFrom));
      }

      if (filters?.dateTo) {
        query = query.lte('rechnungsdatum', toISODate(filters.dateTo));
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
          bezahlt_am: paidDate || todayISO(),
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

export const useCreateLaundryInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoice: {
      rechnungsnummer: string;
      rechnungsdatum: string;
      faelligkeitsdatum?: string;
      nettobetrag: number;
      mwst_satz?: number;
      mwst_betrag?: number;
      bruttobetrag: number;
      positionen?: Array<{
        id: string;
        rechnung_id: string;
        artikelnummer: string;
        bezeichnung: string;
        menge: number;
        einzelpreis: number;
        gesamtpreis: number;
      }>;
      notes?: string;
    }) => {
      const manualId = crypto.randomUUID();
      
      const { data, error } = await supabase
        .from('laundry_invoices')
        .insert({
          external_rechnung_id: manualId,
          rechnungsnummer: invoice.rechnungsnummer,
          rechnungsdatum: invoice.rechnungsdatum,
          faelligkeitsdatum: invoice.faelligkeitsdatum || null,
          nettobetrag: invoice.nettobetrag,
          mwst_satz: invoice.mwst_satz || null,
          mwst_betrag: invoice.mwst_betrag || null,
          bruttobetrag: invoice.bruttobetrag,
          positionen: invoice.positionen || null,
          notes: invoice.notes || null,
          status: 'offen',
          kunde_name: 'Teuni Wäscheservice',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-invoices'] });
      toast.success('Rechnung erfolgreich erstellt');
    },
    onError: (error) => {
      console.error('Error creating invoice:', error);
      toast.error(`Fehler beim Erstellen: ${error.message}`);
    },
  });
};

export const useUpdateLaundryInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, data }: { 
      invoiceId: string; 
      data: {
        rechnungsnummer?: string;
        rechnungsdatum?: string;
        faelligkeitsdatum?: string | null;
        nettobetrag?: number | null;
        mwst_satz?: number | null;
        mwst_betrag?: number | null;
        bruttobetrag?: number;
        notes?: string | null;
      }
    }) => {
      const { error } = await supabase
        .from('laundry_invoices')
        .update(data)
        .eq('id', invoiceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-invoices'] });
      toast.success('Rechnung aktualisiert');
    },
    onError: (error) => {
      console.error('Error updating invoice:', error);
      toast.error('Fehler beim Aktualisieren der Rechnung');
    },
  });
};
export const useDeleteLaundryInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceId: string) => {
      // 1. Unlink all linen_orders referencing this invoice
      const { error: unlinkError } = await supabase
        .from('linen_orders')
        .update({ laundry_invoice_id: null })
        .eq('laundry_invoice_id', invoiceId);

      if (unlinkError) throw unlinkError;

      // 2. Delete the invoice
      const { error: deleteError } = await supabase
        .from('laundry_invoices')
        .delete()
        .eq('id', invoiceId);

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['draft-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['teuni-linen-orders'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-linked-orders'] });
      toast.success('Rechnung gelöscht');
    },
    onError: (error) => {
      console.error('Error deleting invoice:', error);
      toast.error('Fehler beim Löschen der Rechnung');
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

// Get linked linen orders for an invoice
export const useInvoiceLinkedOrders = (invoiceId: string | null) => {
  return useQuery({
    queryKey: ['invoice-linked-orders', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [];
      const { data, error } = await supabase
        .from('linen_orders')
        .select('id, order_date, house_id, status, houses(name)')
        .eq('laundry_invoice_id', invoiceId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!invoiceId,
  });
};

// Get all draft invoices (for merge selection)
export const useDraftInvoices = () => {
  return useQuery({
    queryKey: ['draft-invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('laundry_invoices')
        .select('*')
        .like('rechnungsnummer', 'ENTWURF-%')
        .eq('bruttobetrag', 0)
        .order('rechnungsdatum', { ascending: false });
      if (error) throw error;

      // Get linked orders for each draft
      const invoiceIds = (data || []).map(d => d.id);
      const { data: orders } = await supabase
        .from('linen_orders')
        .select('id, order_date, house_id, laundry_invoice_id, houses(name)')
        .in('laundry_invoice_id', invoiceIds);

      return (data || []).map(invoice => ({
        ...invoice,
        positionen: Array.isArray(invoice.positionen)
          ? invoice.positionen as unknown as InvoicePosition[]
          : null,
        linkedOrder: (orders || []).find(o => o.laundry_invoice_id === invoice.id),
      }));
    },
  });
};

// Create invoice and assign orders to it (2-step workflow)
export const useCreateInvoiceWithOrders = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceData, orderIds }: {
      invoiceData: {
        rechnungsnummer: string;
        rechnungsdatum: string;
        faelligkeitsdatum?: string;
        nettobetrag: number;
        mwst_satz?: number;
        mwst_betrag?: number;
        bruttobetrag: number;
        notes?: string;
      };
      orderIds: string[];
    }) => {
      // 1. Create the invoice
      const { data: newInvoice, error: createError } = await supabase
        .from('laundry_invoices')
        .insert({
          external_rechnung_id: crypto.randomUUID(),
          rechnungsnummer: invoiceData.rechnungsnummer,
          rechnungsdatum: invoiceData.rechnungsdatum,
          faelligkeitsdatum: invoiceData.faelligkeitsdatum || null,
          nettobetrag: invoiceData.nettobetrag,
          mwst_satz: invoiceData.mwst_satz || null,
          mwst_betrag: invoiceData.mwst_betrag || null,
          bruttobetrag: invoiceData.bruttobetrag,
          notes: invoiceData.notes || null,
          status: 'offen',
          kunde_name: 'Teuni Wäscheservice',
        })
        .select()
        .single();

      if (createError) throw createError;

      if (orderIds.length > 0) {
        // 2. Get current invoice IDs of these orders (to delete orphaned drafts)
        const { data: orders } = await supabase
          .from('linen_orders')
          .select('laundry_invoice_id')
          .in('id', orderIds);

        const oldInvoiceIds = [...new Set(
          (orders || []).map(o => o.laundry_invoice_id).filter(Boolean)
        )] as string[];

        // 3. Re-link orders to the new invoice
        const { error: updateError } = await supabase
          .from('linen_orders')
          .update({ laundry_invoice_id: newInvoice.id })
          .in('id', orderIds);

        if (updateError) throw updateError;

        // 4. Delete orphaned draft invoices
        if (oldInvoiceIds.length > 0) {
          const { data: oldInvoices } = await supabase
            .from('laundry_invoices')
            .select('id, rechnungsnummer, bruttobetrag')
            .in('id', oldInvoiceIds);

          const draftIds = (oldInvoices || [])
            .filter(inv => inv.rechnungsnummer?.startsWith('ENTWURF') && inv.bruttobetrag === 0)
            .map(inv => inv.id);

          if (draftIds.length > 0) {
            // Check no other orders still reference these drafts
            const { data: remainingOrders } = await supabase
              .from('linen_orders')
              .select('id')
              .in('laundry_invoice_id', draftIds);

            const orphanedDraftIds = draftIds.filter(dId => 
              !(remainingOrders || []).some(o => o.id)
            );

            // Actually check per draft
            for (const draftId of draftIds) {
              const { data: stillLinked } = await supabase
                .from('linen_orders')
                .select('id')
                .eq('laundry_invoice_id', draftId)
                .limit(1);
              
              if (!stillLinked || stillLinked.length === 0) {
                await supabase.from('laundry_invoices').delete().eq('id', draftId);
              }
            }
          }
        }
      }

      return newInvoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['draft-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['teuni-linen-orders'] });
      queryClient.invalidateQueries({ queryKey: ['assignable-linen-orders'] });
      toast.success('Rechnung erstellt und Bestellungen zugeordnet');
    },
    onError: (error) => {
      console.error('Create invoice with orders error:', error);
      toast.error(`Fehler: ${error.message}`);
    },
  });
};

// Merge multiple draft invoices into one real invoice
export const useMergeDraftInvoices = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ draftInvoiceIds, invoiceData }: {
      draftInvoiceIds: string[];
      invoiceData: {
        rechnungsnummer: string;
        rechnungsdatum: string;
        faelligkeitsdatum?: string;
        nettobetrag: number;
        mwst_satz?: number;
        mwst_betrag?: number;
        bruttobetrag: number;
        notes?: string;
      };
    }) => {
      // 1. Create the real invoice
      const { data: newInvoice, error: createError } = await supabase
        .from('laundry_invoices')
        .insert({
          external_rechnung_id: crypto.randomUUID(),
          rechnungsnummer: invoiceData.rechnungsnummer,
          rechnungsdatum: invoiceData.rechnungsdatum,
          faelligkeitsdatum: invoiceData.faelligkeitsdatum || null,
          nettobetrag: invoiceData.nettobetrag,
          mwst_satz: invoiceData.mwst_satz || null,
          mwst_betrag: invoiceData.mwst_betrag || null,
          bruttobetrag: invoiceData.bruttobetrag,
          notes: invoiceData.notes || null,
          status: 'offen',
          kunde_name: 'Teuni Wäscheservice',
        })
        .select()
        .single();

      if (createError) throw createError;

      // 2. Re-link all orders from draft invoices to the new invoice
      const { error: updateError } = await supabase
        .from('linen_orders')
        .update({ laundry_invoice_id: newInvoice.id })
        .in('laundry_invoice_id', draftInvoiceIds);

      if (updateError) throw updateError;

      // 3. Delete the draft invoices
      const { error: deleteError } = await supabase
        .from('laundry_invoices')
        .delete()
        .in('id', draftInvoiceIds);

      if (deleteError) throw deleteError;

      return newInvoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['draft-invoices'] });
      toast.success('Entwürfe zu einer Rechnung zusammengeführt');
    },
    onError: (error) => {
      console.error('Merge error:', error);
      toast.error(`Fehler beim Zusammenführen: ${error.message}`);
    },
  });
};

// Update invoice and optionally merge other drafts into it
export const useUpdateInvoiceAndMerge = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, data, mergeDraftIds }: {
      invoiceId: string;
      data: {
        rechnungsnummer?: string;
        rechnungsdatum?: string;
        faelligkeitsdatum?: string | null;
        nettobetrag?: number | null;
        mwst_satz?: number | null;
        mwst_betrag?: number | null;
        bruttobetrag?: number;
        notes?: string | null;
      };
      mergeDraftIds?: string[];
    }) => {
      // 1. Update invoice data
      const { error: updateError } = await supabase
        .from('laundry_invoices')
        .update(data)
        .eq('id', invoiceId);

      if (updateError) throw updateError;

      // 2. Re-link orders from merged drafts to this invoice
      if (mergeDraftIds && mergeDraftIds.length > 0) {
        const { error: relinkError } = await supabase
          .from('linen_orders')
          .update({ laundry_invoice_id: invoiceId })
          .in('laundry_invoice_id', mergeDraftIds);

        if (relinkError) throw relinkError;

        // 3. Delete the now-empty draft invoices
        const { error: deleteError } = await supabase
          .from('laundry_invoices')
          .delete()
          .in('id', mergeDraftIds);

        if (deleteError) throw deleteError;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['laundry-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['draft-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-linked-orders'] });
      queryClient.invalidateQueries({ queryKey: ['teuni-linen-orders'] });
      const merged = variables.mergeDraftIds?.length || 0;
      toast.success(merged > 0
        ? `Rechnung aktualisiert und ${merged} Entwurf/Entwürfe zugeordnet`
        : 'Rechnung aktualisiert');
    },
    onError: (error) => {
      console.error('Update and merge error:', error);
      toast.error(`Fehler: ${error.message}`);
    },
  });
};
