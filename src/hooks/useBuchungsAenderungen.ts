import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { KALENDER_ABGLEICH_QUERY_KEY } from "@/hooks/useKalenderAbgleich";

// ============================================================
// useBuchungsAenderungen — neue/geänderte/stornierte Buchungen
// ============================================================
//
// Liest die noch nicht quittierten Einträge aus `buchungs_aenderungen`
// (SQL 56). Zwei Quellen schreiben dort hinein:
//   - Trigger auf bookings  (quelle 'hausverwaltung'): neu, storniert, verschoben
//   - Edge Function ical-sync (quelle 'portal'): neue, geänderte, weggefallene
//     Portal-Belegungen
//
// Der Text ist beim Schreiben fertig formuliert und wird hier nur angezeigt —
// derselbe Wortlaut wie in Sync-Meldung, Morgen-Übersicht und Mail
// (kalender-abgleich liest dieselben Zeilen).
//
// Die Tabelle ist neu und steht noch nicht in den generierten Supabase-Typen,
// daher der lokal eng typisierte Zugriff.

export type BuchungsAenderungArt = "neu" | "geaendert" | "storniert" | "entfernt";

export interface BuchungsAenderung {
  id: string;
  house_id: string;
  quelle: "hausverwaltung" | "portal";
  art: BuchungsAenderungArt;
  platform: string | null;
  booking_id: string | null;
  von: string | null;
  bis: string | null;
  text: string;
  erkannt_am: string;
  houses: { name: string } | null;
}

export const BUCHUNGS_AENDERUNGEN_QUERY_KEY = ["buchungs-aenderungen"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tabelle fehlt in types.ts
const tabelle = () => (supabase as any).from("buchungs_aenderungen");

const useBuchungsAenderungen = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: BUCHUNGS_AENDERUNGEN_QUERY_KEY,
    queryFn: async (): Promise<BuchungsAenderung[]> => {
      const { data, error } = await tabelle()
        .select("id, house_id, quelle, art, platform, booking_id, von, bis, text, erkannt_am, houses(name)")
        .is("gesehen_am", null)
        .order("erkannt_am", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as BuchungsAenderung[]) ?? [];
    },
    refetchInterval: 1000 * 60,
  });

  // "Gesehen" für eine oder mehrere Zeilen. Mit .select() und Prüfung auf
  // 0 Zeilen (CODING-GUIDE B3): sonst meldet ein RLS-Block stillen Erfolg.
  const quittieren = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await tabelle()
        .update({ gesehen_am: new Date().toISOString() })
        .in("id", ids)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Keine Zeile aktualisiert (fehlende Berechtigung?).");
      }
      return data.length as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUCHUNGS_AENDERUNGEN_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: KALENDER_ABGLEICH_QUERY_KEY });
    },
    onError: (e: unknown) => {
      console.error("[useBuchungsAenderungen] quittieren", e);
      toast({
        title: "Konnte nicht als gesehen markieren",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    },
  });

  return {
    aenderungen: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    quittieren: (id: string) => quittieren.mutate([id]),
    alleQuittieren: () => quittieren.mutate((query.data ?? []).map((a) => a.id)),
    isQuittierend: quittieren.isPending,
  };
};

export default useBuchungsAenderungen;
