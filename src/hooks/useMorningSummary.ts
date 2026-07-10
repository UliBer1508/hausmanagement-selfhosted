import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// ============================================================
// useMorningSummary — schlanke Frontend-Anbindung
// ============================================================
//
// Diese Version enthält KEINE eigene Sammel-/Formatier-Logik mehr.
// Die gesamte Übersicht wird serverseitig von der Edge Function
// `morning-summary` erzeugt (im Abruf-Modus, deliver=false) — dieselbe
// Quelle, die auch Max über das Tool `get_morning_summary` nutzt.
//
// So gibt es nur EIN System (eine Quelle der Wahrheit) statt zwei
// parallelen Implementierungen.
//
// Die Schnittstelle (summaryMessage, isLoading, hasData, shouldShow,
// markAsShown) bleibt unverändert, damit ChatAssistant.tsx nicht
// angepasst werden muss.

interface MorningSummaryResult {
  summary_markdown: string;
  hasData: boolean;
}

export const useMorningSummary = () => {
  const today = format(new Date(), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["morning-summary-edge", today],
    queryFn: async (): Promise<MorningSummaryResult> => {
      const { data, error } = await supabase.functions.invoke("morning-summary", {
        body: { deliver: false },
      });

      if (error) {
        console.error("Error loading morning-summary:", error);
        return { summary_markdown: "", hasData: false };
      }

      return {
        summary_markdown: data?.summary_markdown ?? "",
        hasData: data?.hasData ?? false,
      };
    },
    // Einmal täglich frisch; danach aus dem Cache.
    staleTime: 1000 * 60 * 30,
  });

  const summaryMessage = data?.summary_markdown ?? "";
  const hasData = data?.hasData ?? false;

  // LocalStorage-Merker: Begrüßung nur einmal pro Tag anzeigen.
  const shouldShow = (): boolean => {
    if (typeof window === "undefined") return false;
    try {
      const lastShown = window.localStorage.getItem("chat-summary-shown");
      return lastShown !== today;
    } catch {
      return false;
    }
  };

  const markAsShown = (): void => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("chat-summary-shown", today);
    } catch {
      // ignore quota / privacy mode errors
    }
  };

  return {
    summaryMessage,
    isLoading,
    hasData,
    shouldShow,
    markAsShown,
  };
};
