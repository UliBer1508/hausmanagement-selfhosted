import { AlertTriangle, CalendarX, Info } from "lucide-react";
import useKalenderAbgleich, { type KalenderMeldungStufe } from "@/hooks/useKalenderAbgleich";
import { cn } from "@/lib/utils";

// =============================================================================
// CalendarAbgleichAlertBanner — Unterschiede Portale ↔ Hausverwaltung
//
// Zeigt ganz oben im Tab „Übersicht", was der Kalender-Abgleich gefunden hat:
// fehlende Buchungen, mögliche Doppelbuchungen, Feed-Fehler, zu prüfende
// Direktbuchungen, Langsperren.
//
// Die Texte stammen 1:1 aus `kalender-abgleich` (Feld `meldung`) — dieselben
// wie in der Sync-Meldung, der Morgen-Übersicht und der E-Mail. Hier wird
// nichts neu formuliert (Anlass 22.09.2026: Mail und Sync-Knopf widersprachen
// sich).
//
// Kein „Gesehen"-Knopf: Der Banner verschwindet von selbst, sobald der Befund
// erledigt ist (z. B. die Buchung angelegt wurde) — genau wie in der
// Morgen-Übersicht.
// =============================================================================

const STIL: Record<KalenderMeldungStufe, { box: string; titel: string; text: string }> = {
  kritisch: {
    box: "bg-red-50 dark:bg-red-950/30 border-red-500",
    titel: "text-red-800 dark:text-red-200",
    text: "text-red-700 dark:text-red-300",
  },
  warnung: {
    box: "bg-amber-50 dark:bg-amber-950/30 border-amber-500",
    titel: "text-amber-800 dark:text-amber-200",
    text: "text-amber-700 dark:text-amber-300",
  },
  hinweis: {
    box: "bg-blue-50 dark:bg-blue-950/30 border-blue-500",
    titel: "text-blue-800 dark:text-blue-200",
    text: "text-blue-700 dark:text-blue-300",
  },
};

const CalendarAbgleichAlertBanner = () => {
  const { data, error } = useKalenderAbgleich();

  // Ausfall des Abgleichs NICHT verschweigen — sonst sähe es aus wie
  // „alles in Ordnung".
  if (error) {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500 p-4 mb-6 rounded-lg shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Der Kalender-Abgleich (Portale ↔ Hausverwaltung) ist gerade nicht erreichbar.
            Ob Buchungen fehlen, lässt sich im Moment nicht prüfen.
          </p>
        </div>
      </div>
    );
  }

  // Änderungen (neue/stornierte Buchungen) zeigt BookingChangesAlertBanner
  // mit "Gesehen"-Knopf — hier nur die Unterschiede, sonst stünde alles doppelt.
  const gruppen = (data?.meldung.gruppen ?? []).filter((g) => g.art !== "aenderung");
  if (gruppen.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      {gruppen.map((g) => {
        const stil = STIL[g.stufe];
        const Icon = g.stufe === "kritisch" ? CalendarX : g.stufe === "warnung" ? AlertTriangle : Info;
        return (
          <div key={g.art} className={cn("border-l-4 p-4 rounded-lg shadow-sm", stil.box)}>
            <div className="flex items-start gap-3">
              <Icon className={cn("h-6 w-6 flex-shrink-0 mt-0.5", stil.titel)} />
              <div className="flex-1 min-w-0">
                <h3 className={cn("font-semibold text-base sm:text-lg", stil.titel)}>
                  {g.titel}
                </h3>
                <ul className="mt-2 space-y-1">
                  {g.zeilen.map((z) => (
                    <li key={z} className="text-sm text-foreground break-words">
                      • {z}
                    </li>
                  ))}
                </ul>
                <p className={cn("text-sm mt-2", stil.text)}>
                  <strong>Was tun:</strong> {g.hinweis}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      {data?.geprueft_am && (
        <p className="text-xs text-muted-foreground px-1">
          Kalender-Abgleich zuletzt geprüft: {new Date(data.geprueft_am).toLocaleString("de-DE")}
        </p>
      )}
    </div>
  );
};

export default CalendarAbgleichAlertBanner;
