import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// ============================================================
// Belegungsprüfung vor dem Speichern einer Buchung
// ============================================================
//
// 1. ical-sync NUR für dieses Haus anstoßen (frische Portal-Daten).
// 2. DB-Funktion pruefe_belegung (SQL 57) aufrufen — dieselbe Regel, die auch
//    Max beim Annehmen einer Anfrage nutzt.
//
// WARUM (22.09.2026): Bisher prüfte das Formular nur gegen eigene Buchungen.
// Eine Portal-Buchung, die noch nicht nachgetragen war, blieb unsichtbar —
// und die Portal-Daten waren bis zu einen Tag alt (Cron 1x täglich).
//
// Die Texte kommen fertig aus der Datenbank und werden nur angezeigt.

export type BelegungsArt = "eigene_buchung" | "portal_belegt" | "portal_sperre" | "passt";

export interface BelegungsTreffer {
  art: BelegungsArt;
  platform: string | null;
  von: string;
  bis: string;
  gast: string | null;
  text: string;
}

export interface BelegungsErgebnis {
  treffer: BelegungsTreffer[];
  // Portal-Sync fehlgeschlagen -> Portal-Teil beruht auf älterem Stand.
  syncFehler: string | null;
}

interface PruefeBelegungArgs {
  houseId: string;
  checkIn: Date;
  checkOut: Date;
  ausserBookingId?: string | null;
  platform?: string | null;
}

export async function pruefeBelegung({
  houseId, checkIn, checkOut, ausserBookingId, platform,
}: PruefeBelegungArgs): Promise<BelegungsErgebnis> {
  // Schritt 1: Portale frisch abfragen. Fehler hier stoppen NICHT — die
  // Prüfung läuft dann mit dem letzten Stand, und das wird angezeigt.
  let syncFehler: string | null = null;
  try {
    const { data, error } = await supabase.functions.invoke("ical-sync", {
      body: { dry_run: false, house_id: houseId },
    });
    if (error) syncFehler = error.message;
    else if (data && data.success === false) syncFehler = data.error ?? "unbekannter Fehler";
    else if (Array.isArray(data?.details)) {
      const fehlerhaft = data.details.filter((d: { status?: string }) => d.status === "fehler");
      if (fehlerhaft.length > 0) syncFehler = `${fehlerhaft.length} Portal-Feed(s) nicht erreichbar`;
    }
  } catch (e) {
    syncFehler = e instanceof Error ? e.message : "unbekannter Fehler";
  }

  // Schritt 2: Prüfung. Ein Fehler HIER wird geworfen — ohne Prüfung darf
  // das Formular nicht still speichern.
  // Datum im lokalen Kalendertag (Uli arbeitet in Europe/Berlin) —
  // pruefe_belegung vergleicht ebenfalls in Europe/Berlin.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Funktion fehlt in types.ts
  const { data, error } = await (supabase as any).rpc("pruefe_belegung", {
    p_house_id: houseId,
    p_von: format(checkIn, "yyyy-MM-dd"),
    p_bis: format(checkOut, "yyyy-MM-dd"),
    p_ausser_booking_id: ausserBookingId ?? null,
    p_platform: platform && platform !== "none" ? platform : null,
  });
  if (error) throw error;

  return { treffer: (data as BelegungsTreffer[]) ?? [], syncFehler };
}

// Hook-Form für Komponenten (Repo-Konvention: Datenzugriff über hooks/).
const useBelegungspruefung = () => ({ pruefeBelegung });

export default useBelegungspruefung;
