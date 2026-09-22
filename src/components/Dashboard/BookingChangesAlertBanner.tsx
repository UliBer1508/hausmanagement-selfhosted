import { CalendarPlus, Check, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import useBuchungsAenderungen, { type BuchungsAenderungArt } from "@/hooks/useBuchungsAenderungen";

// =============================================================================
// BookingChangesAlertBanner — „Neue Buchungen & Änderungen"
//
// Zeigt im Tab „Übersicht" jede neue, verschobene oder stornierte Buchung und
// jede neue, geänderte oder weggefallene Portal-Belegung, bis Uli sie mit
// „Gesehen" quittiert. Datenquelle: Tabelle buchungs_aenderungen (SQL 56),
// über useBuchungsAenderungen.
//
// Anlass 22.09.2026: Zwei neue Buchungen (Zeiser, Kwoka) — nirgends ein
// Hinweis. Der Kalender-Abgleich-Banner meldet nur UNTERSCHIEDE und schweigt,
// sobald die Buchung angelegt ist.
//
// Aufbau wie CleaningStatusAlertBanner (blau, „Gesehen" / „Alle gesehen").
// Der Text jeder Zeile kommt unverändert aus der Datenbank.
// =============================================================================

const ART_LABEL: Record<BuchungsAenderungArt, { label: string; klasse: string }> = {
  neu:       { label: "Neu",       klasse: "bg-green-600 text-white" },
  geaendert: { label: "Geändert",  klasse: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  storniert: { label: "Storniert", klasse: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  entfernt:  { label: "Entfällt",  klasse: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

const BookingChangesAlertBanner = () => {
  const { aenderungen, quittieren, alleQuittieren, isQuittierend } = useBuchungsAenderungen();

  if (aenderungen.length === 0) return null;
  const anzahl = aenderungen.length;

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-500 p-4 mb-6 rounded-lg shadow-sm">
      <div className="flex items-start gap-3">
        <CalendarPlus className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-semibold text-blue-800 dark:text-blue-200 text-base sm:text-lg">
              {anzahl === 1 ? "1 neue Änderung bei den Buchungen" : `${anzahl} neue Änderungen bei den Buchungen`}
            </h3>
            {anzahl > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={alleQuittieren}
                disabled={isQuittierend}
                className="w-full sm:w-auto text-blue-700 border-blue-300 hover:bg-blue-100 dark:text-blue-300 dark:border-blue-700 dark:hover:bg-blue-900"
              >
                <CheckCheck className="h-4 w-4 mr-1" />
                Alle gesehen
              </Button>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {aenderungen.map((a) => {
              const art = ART_LABEL[a.art];
              return (
                <div
                  key={a.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-background/50 p-3 rounded-lg border border-blue-200 dark:border-blue-800"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={art.klasse}>{art.label}</Badge>
                      <strong className="text-foreground">{a.houses?.name ?? "—"}</strong>
                      <Badge variant="secondary">
                        {a.quelle === "portal" ? "vom Portal" : "Hausverwaltung"}
                      </Badge>
                    </div>
                    <div className="text-sm text-foreground mt-1 break-words">{a.text}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(a.erkannt_am), { addSuffix: true, locale: de })}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => quittieren(a.id)}
                    disabled={isQuittierend}
                    className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Gesehen
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingChangesAlertBanner;
