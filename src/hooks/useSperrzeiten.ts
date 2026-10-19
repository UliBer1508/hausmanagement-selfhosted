import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KALENDER_ABGLEICH_QUERY_KEY } from "@/hooks/useKalenderAbgleich";
import type { SperrGrund, Sperrzeit } from "@/lib/sperrzeiten";

// ============================================================
// useSperrzeiten — Zeiträume, die Uli nicht vermieten will (SQL 66)
// ============================================================
//
// Die Hausverwaltung ist der Master-Kalender auch für Sperren:
//   - ical-export gibt Sperrzeiten an Airbnb / VRBO / Belvilla weiter
//   - die View public_availability zeigt sie auf steinbockchalets.com
//   - kalender-abgleich meldet, wenn die Sperre in Booking.com fehlt
//   - pruefe_belegung warnt beim Anlegen einer Buchung im Zeitraum
//   - die Lückenanalyse (GuestAnalytics) zählt sie nicht als Lücke
//
// Die Tabelle ist neu und steht noch nicht in den generierten Supabase-Typen
// (types.ts nie von Hand ändern), daher der lokal eng typisierte Zugriff —
// gleiches Muster wie useBuchungsAenderungen.

export const SPERRZEITEN_QUERY_KEY = ["sperrzeiten"] as const;

export interface SperrzeitEingabe {
  house_id: string;
  erster_tag: string;   // "YYYY-MM-DD", erste gesperrte Nacht
  letzter_tag: string;  // "YYYY-MM-DD", letzte gesperrte Nacht (einschließlich)
  grund: SperrGrund;
  notiz: string | null;
}

const FELDER = "id, house_id, erster_tag, letzter_tag, grund, notiz";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tabelle fehlt in types.ts
const tabelle = () => (supabase as any).from("sperrzeiten");

const useSperrzeiten = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SPERRZEITEN_QUERY_KEY,
    queryFn: async (): Promise<Sperrzeit[]> => {
      const { data, error } = await tabelle()
        .select(FELDER)
        .order("erster_tag", { ascending: true });
      if (error) throw error;
      return (data as Sperrzeit[]) ?? [];
    },
    staleTime: 1000 * 60,
  });

  // Alles, was Sperrzeiten mitrechnet, neu laden.
  const nachAenderung = () => {
    queryClient.invalidateQueries({ queryKey: SPERRZEITEN_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: KALENDER_ABGLEICH_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["guest-analytics"] });
  };

  // Schreibende Kommandos IMMER mit .select() und Prüfung auf 0 Zeilen
  // (CODING-GUIDE B3) — sonst meldet ein RLS-Block stillen Erfolg.
  const anlegen = useMutation({
    mutationFn: async (eingabe: SperrzeitEingabe): Promise<Sperrzeit> => {
      const { data, error } = await tabelle()
        .insert({ ...eingabe, erstellt_von: "uli" })
        .select(FELDER);
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sperrzeit wurde nicht gespeichert (fehlende Berechtigung?).");
      }
      return data[0] as Sperrzeit;
    },
    onSuccess: nachAenderung,
  });

  const aendern = useMutation({
    mutationFn: async ({ id, ...eingabe }: SperrzeitEingabe & { id: string }): Promise<Sperrzeit> => {
      const { data, error } = await tabelle()
        .update(eingabe)
        .eq("id", id)
        .select(FELDER);
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sperrzeit wurde nicht geändert (nicht gefunden oder fehlende Berechtigung).");
      }
      return data[0] as Sperrzeit;
    },
    onSuccess: nachAenderung,
  });

  const loeschen = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { data, error } = await tabelle()
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sperrzeit wurde nicht aufgehoben (nicht gefunden oder fehlende Berechtigung).");
      }
    },
    onSuccess: nachAenderung,
  });

  return {
    sperrzeiten: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    anlegen: anlegen.mutateAsync,
    aendern: aendern.mutateAsync,
    loeschen: loeschen.mutateAsync,
    isSpeichernd: anlegen.isPending || aendern.isPending || loeschen.isPending,
  };
};

export default useSperrzeiten;
