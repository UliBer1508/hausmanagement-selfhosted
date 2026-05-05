import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SyncAirROIInput {
  location?: string;
  house_id?: string;
}

export interface SyncAirROIResult {
  success: boolean;
  market_id?: string | number;
  days_written: number;
  base_occupancy: number;
  base_adr: number;
}

export function useSyncAirROI() {
  const qc = useQueryClient();
  return useMutation<SyncAirROIResult, Error, SyncAirROIInput>({
    mutationFn: async ({ location, house_id }) => {
      const { data, error } = await supabase.functions.invoke('airroi-sync', {
        body: { location, house_id },
      });

      // FunctionsHttpError on non-2xx — try to read body for context/status
      if (error) {
        const ctx: any = (error as any).context;
        let status: number | undefined;
        let payload: any = null;
        try {
          status = ctx?.status ?? ctx?.response?.status;
          if (ctx?.response && typeof ctx.response.json === 'function') {
            payload = await ctx.response.json();
          }
        } catch { /* ignore */ }

        if (status === 501 || /AIRROI_API_KEY/i.test(payload?.error || error.message)) {
          throw new Error(
            'AirROI API-Key nicht konfiguriert — bitte AIRROI_API_KEY in den Supabase Edge Function Secrets hinterlegen.',
          );
        }
        throw new Error(payload?.error || error.message);
      }

      if ((data as any)?.error) {
        const msg = String((data as any).error);
        if (/AIRROI_API_KEY/i.test(msg)) {
          throw new Error(
            'AirROI API-Key nicht konfiguriert — bitte AIRROI_API_KEY in den Supabase Edge Function Secrets hinterlegen.',
          );
        }
        throw new Error(msg);
      }

      return data as SyncAirROIResult;
    },
    onSuccess: (data) => {
      toast.success(
        `AirROI Sync erfolgreich: ${data.days_written} Tage (Basis-Auslastung ${(data.base_occupancy * 100).toFixed(1)}%, ADR ${data.base_adr} €)`,
      );
      qc.invalidateQueries({ queryKey: ['market_data_cache'] });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });
}
