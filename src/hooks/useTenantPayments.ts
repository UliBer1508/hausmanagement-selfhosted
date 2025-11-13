import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TenantPayment } from "@/types";
import { toast } from "sonner";

export const useTenantPayments = (houseId?: string) => {
  return useQuery({
    queryKey: ['tenant-payments', houseId],
    queryFn: async () => {
      let query = supabase
        .from('tenant_payments' as any)
        .select('*, houses(id, name, address, tenant_info)')
        .order('due_date', { ascending: false });
      
      if (houseId) {
        query = query.eq('house_id', houseId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as any as TenantPayment[];
    },
  });
};

export const useCreatePayment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (payment: Omit<TenantPayment, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('tenant_payments' as any)
        .insert([payment])
        .select()
        .single();
      
      if (error) throw error;
      return data as any as TenantPayment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-payments'] });
      toast.success('Zahlung erfolgreich erfasst');
    },
    onError: (error: any) => {
      toast.error('Fehler beim Erfassen der Zahlung: ' + error.message);
    }
  });
};

export const useUpdatePayment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TenantPayment> & { id: string }) => {
      const { data, error } = await supabase
        .from('tenant_payments' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as any as TenantPayment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-payments'] });
      toast.success('Zahlung aktualisiert');
    },
    onError: (error: any) => {
      toast.error('Fehler beim Aktualisieren: ' + error.message);
    }
  });
};

export const useDeletePayment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tenant_payments' as any)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-payments'] });
      toast.success('Zahlung gelöscht');
    },
    onError: (error: any) => {
      toast.error('Fehler beim Löschen: ' + error.message);
    }
  });
};

export const useUploadReceipt = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ paymentId, file }: { paymentId: string; file: File }) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${paymentId}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('tenant-receipts')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('tenant-receipts')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('tenant_payments' as any)
        .update({ receipt_url: publicUrl } as any)
        .eq('id', paymentId);

      if (updateError) throw updateError;

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-payments'] });
      toast.success('Beleg hochgeladen');
    },
    onError: (error: any) => {
      toast.error('Fehler beim Hochladen: ' + error.message);
    }
  });
};
