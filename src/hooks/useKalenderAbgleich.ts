import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ============================================================
// useKalenderAbgleich — EINE Quelle für alle Kalender-Hinweise
// ============================================================
//
// Ruft die Edge Function `kalender-abgleich` auf. Sie vergleicht die
// Portal-Belegungen (external_blocks, eingelesen von ical-sync) mit den
// Buchungen der Hausverwaltung und liefert die fertig formulierte `meldung`.
//
// WARUM ES DIESEN HOOK GIBT (22.09.2026): Eine nachts eingegangene
// Booking.com-Buchung stand in der Mail als "fehlt im System", der Knopf
// "Jetzt synchronisieren" meldete gleichzeitig "keine Kollisionen". Seitdem
// lesen Sync-Meldung (CalendarSyncCard), Banner (CalendarAbgleichAlertBanner)
// und Belegungsliste über denselben Query-Key aus derselben Antwort. Texte
// werden im Frontend NICHT neu formuliert — nur angezeigt.
//
// Hinweis: Der Aufruf kann eine Mail auslösen, wenn ein Befund NEU ist
// (Merk-Logik in kalender_abgleich_meldungen verhindert Wiederholungen).
// Das ist gewollt: Wer die Übersicht öffnet, bevor der Cron lief, stößt die
// Mail sofort an.

export type KalenderBefundArt =
  | "kollision"
  | "fehlende_buchung"
  | "feed_fehler"
  | "direktbuchung_pruefen"
  | "langsperre";

export type KalenderMeldungStufe = "kritisch" | "warnung" | "hinweis";

export interface KalenderBefund {
  art: KalenderBefundArt;
  haus: string;
  house_id: string;
  platform: string;
  von?: string;
  bis?: string;
  naechte?: number;
  text: string;
}

export interface KalenderMeldungGruppe {
  art: KalenderBefundArt;
  stufe: KalenderMeldungStufe;
  titel: string;
  hinweis: string;
  zeilen: string[];
}

export interface KalenderMeldung {
  alles_ok: boolean;
  titel: string;
  gruppen: KalenderMeldungGruppe[];
}

// Einordnung eines Portal-Blocks (für die Belegungsliste in CalendarSyncCard).
export type KalenderBlockArt = "gedeckt" | "sperrzeit" | "langsperre" | "luecke";

export interface KalenderBlockInfo {
  house_id: string;
  platform: string;
  start_date: string;
  end_date: string;
  art: KalenderBlockArt;
  naechte: number;
  buchungen: string[];
  offene_tage: number;
}

export interface KalenderAbgleichErgebnis {
  geprueft_am: string | null;
  feeds_aktiv: number;
  anzahl: number;
  befunde: KalenderBefund[];
  bloecke: KalenderBlockInfo[];
  meldung: KalenderMeldung;
}

export const KALENDER_ABGLEICH_QUERY_KEY = ["kalender-abgleich"] as const;

const LEERE_MELDUNG: KalenderMeldung = {
  alles_ok: true,
  titel: "Kalender stimmt mit den Portalen überein",
  gruppen: [],
};

// Auch direkt nutzbar (queryClient.fetchQuery), z. B. nach einem manuellen Sync.
export async function fetchKalenderAbgleich(): Promise<KalenderAbgleichErgebnis> {
  const { data, error } = await supabase.functions.invoke("kalender-abgleich", { body: {} });
  if (error) throw error;
  if (!data?.success) {
    throw new Error(data?.error ?? "Kalender-Abgleich hat keine Antwort geliefert.");
  }
  return {
    geprueft_am: data.geprueft_am ?? null,
    feeds_aktiv: Number(data.feeds_aktiv ?? 0),
    anzahl: Number(data.anzahl ?? 0),
    befunde: (data.befunde as KalenderBefund[]) ?? [],
    bloecke: (data.bloecke as KalenderBlockInfo[]) ?? [],
    // Ohne Feeds liefert die Function keine `meldung` — dann gibt es auch
    // nichts abzugleichen.
    meldung: (data.meldung as KalenderMeldung) ?? LEERE_MELDUNG,
  };
}

interface UseKalenderAbgleichOptions {
  enabled?: boolean;
}

const useKalenderAbgleich = ({ enabled = true }: UseKalenderAbgleichOptions = {}) =>
  useQuery({
    queryKey: KALENDER_ABGLEICH_QUERY_KEY,
    queryFn: fetchKalenderAbgleich,
    enabled,
    // Portal-Feeds ändern sich höchstens alle paar Minuten; alle 10 Minuten
    // neu abgleichen reicht, damit der Banner eine neue Lücke zeitnah zeigt.
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 10,
  });

export default useKalenderAbgleich;
