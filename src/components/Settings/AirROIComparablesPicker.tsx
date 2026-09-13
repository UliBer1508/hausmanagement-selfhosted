import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink, MapPin, Star } from 'lucide-react';

// Auswahl der AirROI-Vergleichsobjekte (NEU 13.09.2026)
//
// HINTERGRUND (Uli, 13.09.2026): AirROI liefert Vergleichsobjekte nach
// Schlafzimmern/Bädern/Gästen und Umkreis — aber nicht nach NIVEAU. Damit
// können Apartments neben einem Chalet landen und den Vergleichspreis nach
// unten ziehen. Uli vermietet bewusst hochpreisig und will die Auswahl selbst
// treffen, statt sie einer Ähnlichkeitsformel zu überlassen.
//
// Deshalb: nichts wird automatisch übernommen. Jedes Objekt ist einzeln
// an-/abwählbar, alle Merkmale, die für die Beurteilung zählen, stehen dabei
// (Objektart, Zimmer, Gäste, Bewertung, Superhost, ADR, Reinigungsgebühr).
//
// KEINE KARTE (Entscheidung Uli, 13.09.2026): Eine Kartenansicht haette eine
// neue Abhaengigkeit (Leaflet) und damit eine Aenderung an package.json und
// bun.lock bedeutet — ein Deploy-Risiko, das sich hier nicht lohnt. Ausserdem
// ist nicht belegt, dass AirROI ueberhaupt Koordinaten liefert. Die Liste
// enthaelt alle Merkmale, die fuer die Beurteilung noetig sind.
//
// EHRLICHKEIT ZUR LAGE: Airbnb verschleiert bei vielen Inseraten die genaue
// Position (`exact_location: false`). Solche Objekte sind in der Liste
// gekennzeichnet — die Ortsangabe ist dann ein Naeherungswert.

export interface AirroiObjekt {
  listing_id: number | string | null;
  name: string | null;
  typ?: string | null;
  objektart?: string | null;
  schlafzimmer?: number | null;
  baeder?: number | null;
  gaeste?: number | null;
  zimmer?: number | null;
  flaeche?: number | null;
  waehrung?: string | null;
  reinigungsgebuehr?: number | null;
  zusatzgast_gebuehr?: number | null;
  adr_12monate?: number | null;
  adr_90tage?: number | null;
  auslastung_12monate?: number | null;
  bewertung?: number | null;
  bewertungen?: number | null;
  ort?: string | null;
  genaue_lage?: boolean | null;
  superhost?: boolean | null;
  url?: string | null;
  ausstattung?: string[] | null;
}

interface Props {
  objekte: AirroiObjekt[];
  ausgewaehlteIds: Array<string | number>;
  onAuswahlChange: (ids: Array<string | number>) => void;
}

export default function AirROIComparablesPicker({
  objekte,
  ausgewaehlteIds,
  onAuswahlChange,
}: Props) {
  const istGewaehlt = (id: string | number | null) =>
    id !== null && ausgewaehlteIds.some((x) => String(x) === String(id));

  const umschalten = (id: string | number | null) => {
    if (id === null) return;
    const drin = istGewaehlt(id);
    onAuswahlChange(
      drin
        ? ausgewaehlteIds.filter((x) => String(x) !== String(id))
        : [...ausgewaehlteIds, id],
    );
  };

  const alleWaehlen = () =>
    onAuswahlChange(objekte.map((o) => o.listing_id).filter((id): id is string | number => id !== null));
  const keineWaehlen = () => onAuswahlChange([]);

  // Kennzahlen NUR aus der Auswahl — das ist der Punkt der ganzen Komponente.
  const auswahlKennzahlen = useMemo(() => {
    const gewaehlte = objekte.filter((o) => istGewaehlt(o.listing_id));
    const adr = gewaehlte.map((o) => Number(o.adr_12monate)).filter((n) => Number.isFinite(n) && n > 0);
    const reinigung = gewaehlte
      .map((o) => Number(o.reinigungsgebuehr))
      .filter((n) => Number.isFinite(n) && n > 0);
    const mittel = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return {
      anzahl: gewaehlte.length,
      adrDurchschnitt: mittel(adr),
      adrMin: adr.length ? Math.min(...adr) : null,
      adrMax: adr.length ? Math.max(...adr) : null,
      reinigungDurchschnitt: mittel(reinigung),
      reinigungAnzahl: reinigung.length,
    };
  }, [objekte, ausgewaehlteIds]);

  if (objekte.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {objekte.length} Vergleichsobjekte · {auswahlKennzahlen.anzahl} ausgewählt
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={alleWaehlen}>Alle</Button>
          <Button size="sm" variant="outline" onClick={keineWaehlen}>Keine</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        AirROI wählt nach Schlafzimmern, Bädern, Gästen und Umkreis aus — <strong>nicht nach
        Niveau</strong>. Prüfe Objektart und Ausstattung und wähle ab, was nicht vergleichbar ist.
        Nur ausgewählte Objekte gehen in den Preisvergleich ein.
      </p>

      <div className="space-y-2">
        {objekte.map((o, i) => {
          const gewaehlt = istGewaehlt(o.listing_id);
          return (
            <div
              key={o.listing_id ?? i}
              className={`rounded-lg border p-3 space-y-1 ${gewaehlt ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={gewaehlt}
                  onCheckedChange={() => umschalten(o.listing_id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{o.name ?? 'Ohne Namen'}</span>
                    {o.superhost && <Badge variant="secondary" className="text-xs">Superhost</Badge>}
                    {o.genaue_lage === false && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <MapPin className="h-3 w-3" /> Lage ungefähr
                      </Badge>
                    )}
                    {o.url && (
                      <a
                        href={o.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline inline-flex items-center gap-1"
                      >
                        ansehen <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {o.objektart ?? o.typ ?? 'Objektart unbekannt'}
                    </span>
                    <span>{o.schlafzimmer ?? '?'} Schlafzimmer</span>
                    <span>{o.baeder ?? '?'} Bäder</span>
                    <span>{o.gaeste ?? '?'} Gäste</span>
                    {o.ort && <span>{o.ort}</span>}
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {o.adr_12monate ? (
                      <span>Ø <strong>€{Math.round(o.adr_12monate)}</strong>/Nacht</span>
                    ) : (
                      <span className="text-muted-foreground">kein ADR</span>
                    )}
                    {o.auslastung_12monate != null && (
                      <span className="text-muted-foreground">
                        {Math.round(o.auslastung_12monate * 100)}% Auslastung
                      </span>
                    )}
                    {o.reinigungsgebuehr ? (
                      <span className="text-muted-foreground">
                        Reinigung €{Math.round(o.reinigungsgebuehr)}
                      </span>
                    ) : null}
                    {o.bewertung != null && (
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        {o.bewertung}
                        {o.bewertungen != null && ` (${o.bewertungen})`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {auswahlKennzahlen.anzahl > 0 && (
        <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
          <div className="font-medium">Aus deiner Auswahl ({auswahlKennzahlen.anzahl} Objekte)</div>
          {auswahlKennzahlen.adrDurchschnitt !== null ? (
            <div>
              Nachtpreis: <strong>Ø €{Math.round(auswahlKennzahlen.adrDurchschnitt)}</strong>{' '}
              <span className="text-muted-foreground">
                (€{Math.round(auswahlKennzahlen.adrMin!)}–€{Math.round(auswahlKennzahlen.adrMax!)})
              </span>
            </div>
          ) : (
            <div className="text-muted-foreground">Für die Auswahl liegt kein Nachtpreis vor.</div>
          )}
          {auswahlKennzahlen.reinigungDurchschnitt !== null && (
            <div className="text-xs text-muted-foreground">
              Reinigungsgebühr: Ø €{Math.round(auswahlKennzahlen.reinigungDurchschnitt)} (bei{' '}
              {auswahlKennzahlen.reinigungAnzahl} von {auswahlKennzahlen.anzahl} angegeben)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
