import React from 'react';
import { Loader2, AlertTriangle, Check, HelpCircle } from 'lucide-react';

/**
 * CleaningInvoicePanel — Vorschau einer Reinigungsrechnung.
 *
 * WARUM EIGENE DATEI: DocumentsTab.tsx hat bereits ueber 2.000 Zeilen. Der
 * Waescherechnungs-Teil liegt dort und bleibt dort — er funktioniert, und
 * "nie Struktur und Verhalten im selben Schritt aendern" (CODING-GUIDE
 * B3). Der NEUE Reinigungsteil wird deshalb gleich getrennt angelegt,
 * statt die grosse Datei weiter wachsen zu lassen.
 *
 * UNTERSCHIED ZUR WAESCHERECHNUNG, und der Grund fuer eine eigene Ansicht:
 * Boris' Rechnung schluesselt auf. Jede Position nennt Datum und Objekt
 * und gehoert zu GENAU EINER Reinigung. Es gibt deshalb nichts
 * abzuhaken — die Zuordnung steht auf dem Papier. Angezeigt wird, ob sie
 * gefunden wurde.
 *
 * Bei Teuni ist das anders: Dort waehlt der Mensch aus offenen
 * Bestellungen, weil die Sammelrechnung keinen Bezug zur einzelnen
 * Lieferung nennt.
 *
 * DIESE KOMPONENTE ZEIGT NUR AN. Sie schreibt nichts. Das Anlegen
 * uebernimmt DocumentsTab beim Ablegen, nach Freigabe durch den Menschen.
 */

export interface ReinigungsPosition {
  pos: number;
  beschreibung: string;
  datum: string;
  datum_roh: string;
  menge: number;
  betrag: number;
  haus_id: string | null;
  haus_name: string | null;
  task_id: string | null;
  zuordnung: 'eindeutig' | 'kein_treffer' | 'mehrdeutig' | 'haus_unbekannt';
  hinweis: string | null;
}

export interface ReinigungsErgebnis {
  ok: boolean;
  bereits_erfasst: boolean;
  erfasst_id: string | null;
  erfasst_info: string | null;
  rechnung: {
    rechnungsnummer: string;
    rechnungsdatum: string;
    faelligkeitsdatum: string | null;
    nettobetrag: number | null;
    mwst_satz: number | null;
    mwst_betrag: number | null;
    bruttobetrag: number;
  };
  positionen: ReinigungsPosition[];
  warnungen: string[];
  hinweise: string[];
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('de-DE');
const fmtEur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/** Zeichen und Farbe je Zuordnungslage. */
function ZuordnungsZeichen({ art }: { art: ReinigungsPosition['zuordnung'] }) {
  if (art === 'eindeutig') {
    return <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Reinigung gefunden" />;
  }
  if (art === 'mehrdeutig') {
    return <HelpCircle className="h-4 w-4 shrink-0 text-amber-600" aria-label="Mehrere Reinigungen möglich" />;
  }
  return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="Keine Reinigung gefunden" />;
}

export default function CleaningInvoicePanel({
  laeuft,
  ergebnis,
  hinweis,
  anlegen,
  onAnlegen,
}: {
  /** Die Edge Function laeuft noch. */
  laeuft: boolean;
  /** Ergebnis des Einlesens, null solange nichts gelesen wurde. */
  ergebnis: ReinigungsErgebnis | null;
  /** Grund, warum nichts gelesen werden konnte. */
  hinweis: string | null;
  /** Soll die Rechnung beim Ablegen angelegt werden? */
  anlegen: boolean;
  onAnlegen: (v: boolean) => void;
}) {
  if (laeuft) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
        <Loader2 className="h-4 w-4 animate-spin" />
        Rechnung wird gelesen…
      </div>
    );
  }

  if (hinweis) {
    return (
      <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
        {hinweis}
      </p>
    );
  }

  if (!ergebnis) return null;

  const r = ergebnis.rechnung;
  const zugeordnet = ergebnis.positionen.filter((p) => p.zuordnung === 'eindeutig').length;
  const offen = ergebnis.positionen.length - zugeordnet;

  return (
    <div className="mt-2 rounded-md border border-sky-300 bg-sky-50 p-3">
      <p className="mb-1 text-sm font-semibold text-sky-900">
        Rechnung {r.rechnungsnummer} vom {fmtDate(r.rechnungsdatum)}
        {' · '}{fmtEur(r.bruttobetrag)} brutto
      </p>

      {r.nettobetrag !== null && (
        <p className="mb-2 text-xs text-sky-800">
          {fmtEur(r.nettobetrag)} netto
          {r.mwst_betrag !== null && r.mwst_satz !== null
            ? ` + ${fmtEur(r.mwst_betrag)} MwSt (${r.mwst_satz.toFixed(0)} %)`
            : ''}
        </p>
      )}

      {ergebnis.bereits_erfasst && (
        <p className="mb-2 text-xs font-medium text-amber-800">
          {ergebnis.erfasst_info} — es wird keine zweite Rechnung angelegt.
        </p>
      )}

      {ergebnis.warnungen.length > 0 && (
        <ul className="mb-2 list-disc pl-4 text-xs text-destructive">
          {ergebnis.warnungen.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      {/* Hinweise sind keine Fehler, muessen aber sichtbar sein: hier
          steht unter anderem, wenn die Umsatzsteuer nicht gelesen, sondern
          aus Netto und Brutto errechnet wurde. */}
      {ergebnis.hinweise.length > 0 && (
        <ul className="mb-2 list-disc pl-4 text-xs text-amber-800">
          {ergebnis.hinweise.map((h, i) => <li key={i}>{h}</li>)}
        </ul>
      )}

      {/* Positionen mit ihrer Zuordnung.
          Die Reihenfolge ist die der Rechnung, nicht nach Datum sortiert —
          so laesst sich Zeile fuer Zeile gegen das Papier pruefen. */}
      <table className="mb-2 w-full text-xs">
        <tbody>
          {ergebnis.positionen.map((p) => (
            <tr key={p.pos} className="border-b border-sky-200 align-top last:border-0">
              <td className="py-1 pr-2">
                <ZuordnungsZeichen art={p.zuordnung} />
              </td>
              <td className="py-1 pr-2 whitespace-nowrap font-medium">{p.datum_roh}</td>
              <td className="py-1 pr-2">
                {p.haus_name ?? <span className="text-destructive">Haus unbekannt</span>}
                <span className="block text-muted-foreground">{p.beschreibung}</span>
                {p.hinweis && (
                  <span className="block text-amber-800">{p.hinweis}</span>
                )}
              </td>
              <td className="py-1 text-right whitespace-nowrap">{fmtEur(p.betrag)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mb-2 text-xs text-sky-900">
        {zugeordnet} von {ergebnis.positionen.length} Positionen einer Reinigung zugeordnet
        {offen > 0 ? ` · ${offen} ohne Zuordnung` : ''}
      </p>

      {offen > 0 && (
        <p className="mb-2 text-xs text-amber-800">
          Nicht zugeordnete Positionen werden trotzdem als Teil der Rechnung
          gespeichert — nur die Verknüpfung zur Reinigung fehlt. Sie lässt
          sich später von Hand setzen.
        </p>
      )}

      {!ergebnis.bereits_erfasst && (
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-sky-900">
          <input
            type="checkbox"
            checked={anlegen}
            onChange={(e) => onAnlegen(e.target.checked)}
          />
          Rechnung anlegen, mit diesem Beleg und den erkannten Reinigungen
          verknüpfen
        </label>
      )}
    </div>
  );
}
