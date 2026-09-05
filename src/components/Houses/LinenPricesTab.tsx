import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Euro, Info, AlertTriangle } from "lucide-react";
import { useLaundryArticles } from '@/hooks/useLaundryArticles';

/*
 * Teunis Artikel mit ihren aktuellen Preisen.
 *
 * UMGESTELLT 05.09.2026. Vorher war das eine EINGABEMASKE je Haus: die Preise
 * standen in ai_linen_settings.prices, wurden von Hand gepflegt und mit dem
 * Set-Schluessel nachgeschlagen. Zwei Fehler steckten darin:
 *
 *   1. Der Preis ist eine Eigenschaft des DIENSTLEISTERS, nicht des Hauses.
 *      Teuni stellt eine Sammelrechnung ueber beide Chalets; zwei getrennte
 *      Preislisten konnten auseinanderlaufen, und import-teuni-invoice musste
 *      sich mit einer Warnung behelfen, wenn sie es taten.
 *
 *   2. Der Set-Schluessel traf die Preisliste nicht. Venediger nennt die Zeile
 *      `bettwaesche`, die Preisliste kannte nur `bedding` — der groesste
 *      Posten stand deshalb auf 0,00 EUR, obwohl 9,50 hinterlegt waren.
 *
 * Jetzt zeigt der Reiter schlicht `laundry_articles` mit dem aktuell gueltigen
 * Preis aus `laundry_article_prices`. Keine Berechnung, keine Eingabe.
 *
 * WARUM NICHT EDITIERBAR: Preise entstehen beim Einlesen einer Teuni-Rechnung
 * und tragen einen Gueltigkeitszeitraum. Was hier eingetippt wuerde, ginge
 * entweder ins Leere oder ueberschriebe einen belegten Rechnungspreis — und
 * niemand koennte hinterher sagen, welcher der beiden stimmt.
 *
 * Die Liste ist bewusst NICHT nach Haus gefiltert: Teunis Preise gelten fuer
 * beide Chalets gleich. Der Reiter zeigt in jedem Haus dasselbe. Welche
 * Artikel ein Haus tatsaechlich benutzt, steht im Reiter "Wäschesets".
 */

interface LinenPricesTabProps {
  /** Wird nicht mehr gebraucht — die Preise gelten fuer alle Haeuser gleich.
   *  Bleibt in der Signatur, damit der Aufruf im LinenInventoryDialog
   *  unveraendert bleibt. */
  houseId?: string;
}

const LinenPricesTab: React.FC<LinenPricesTabProps> = () => {
  const { data: artikel = [], isLoading, error } = useLaundryArticles();

  const preisText = (p: number | null) =>
    p === null ? '—' : `${p.toFixed(2).replace('.', ',')} €`;

  const datumText = (d: string | null) => {
    if (!d) return '';
    const [j, m, t] = d.split('-');
    return t && m && j ? `${t}.${m}.${j}` : d;
  };

  const ohnePreis = artikel.filter((a) => a.preis === null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Lade Artikel…</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Die Artikel konnten nicht geladen werden: {(error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  if (artikel.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Es sind noch keine Wäscheartikel erfasst. Artikel entstehen beim
          Einlesen einer Teuni-Rechnung im Reiter „Dokumente“.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Euro className="w-5 h-5 text-primary" />
            Teuni-Artikel und Preise
          </CardTitle>
          <CardDescription>
            Die Preise stammen aus Teunis Rechnungen und gelten für alle Häuser.
            Welche Artikel ein Haus verwendet, steht im Reiter „Wäschesets“.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ohnePreis.length > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Für {ohnePreis.length}{' '}
                {ohnePreis.length === 1 ? 'Artikel liegt' : 'Artikel liegen'} noch
                kein Preis vor:{' '}
                <strong>{ohnePreis.map((a) => a.artikelnummer).join(', ')}</strong>.
                Der Preis wird beim nächsten Rechnungseinlesen ergänzt.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            {artikel.map((a) => {
              const abgeloest = a.nachfolger_id !== null;
              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-4 p-3 rounded-lg border bg-card ${
                    abgeloest ? 'opacity-60' : ''
                  }`}
                >
                  <div className="w-20 shrink-0 font-mono text-sm">
                    {a.artikelnummer}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {a.bezeichnung ?? '—'}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {a.einheit && (
                        <span className="text-xs text-muted-foreground">
                          je {a.einheit}
                        </span>
                      )}
                      {a.abrechnungsart === 'paket' && (
                        <Badge variant="secondary" className="text-[10px]">
                          Paket
                        </Badge>
                      )}
                      {!a.set_faehig && (
                        <Badge variant="outline" className="text-[10px]">
                          nicht im Wäscheset
                        </Badge>
                      )}
                      {abgeloest && (
                        <Badge variant="outline" className="text-[10px]">
                          ersetzt durch {a.nachfolger_nummer ?? '—'}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm font-medium ${
                        a.preis === null ? 'text-muted-foreground' : ''
                      }`}
                    >
                      {preisText(a.preis)}
                    </div>
                    {a.gueltig_ab && (
                      <div className="text-xs text-muted-foreground">
                        seit {datumText(a.gueltig_ab)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Preise werden hier nicht eingegeben. Sie entstehen beim Einlesen
              einer Teuni-Rechnung und tragen ein Gültigkeitsdatum — so bleibt
              nachvollziehbar, ab wann welcher Preis galt.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default LinenPricesTab;
