import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AirROIComparablesPicker, { type AirroiObjekt } from './AirROIComparablesPicker';
import { useHouses } from '@/hooks/useHouses';
import { useToast } from '@/hooks/use-toast';

// Manuelle AirROI-Abfrage (NEU 13.09.2026)
//
// Uli-Vorgabe: AirROI-Abfragen laufen NICHT automatisch, sondern einzeln per
// Knopfdruck - jeder Aufruf kostet echtes Geld. Diese Karte zeigt die Kosten
// VOR dem Start, lässt jeden Schritt einzeln abwählen und verlangt eine
// Bestätigung.
//
// Gegenstück: supabase/functions/airroi-query/index.ts (ruft ab, schreibt
// nichts). Das Übernehmen gefundener Objekte passiert hier unten, bewusst als
// getrennter zweiter Knopf.
//
// Nicht verwechseln mit Settings/AirROISyncCard.tsx - die stößt den
// Markt-Abgleich (airroi-sync) an, der market_data_cache füllt.

/** Standard-Tarif in USD, Quelle: https://www.airroi.com/api/pricing (Stand 12.09.2026).
 *  Muss mit KOSTEN in supabase/functions/airroi-query/index.ts übereinstimmen. */
const AIRROI_COSTS = {
  market_search: 0.01,
  comparables: 0.10,
  future_rates: 0.10, // pro Objekt
  radius_search: 0.50,
} as const;

type SchrittKey = keyof typeof AIRROI_COSTS;

const SCHRITTE: Array<{
  key: SchrittKey;
  titel: string;
  beschreibung: string;
  proObjekt?: boolean;
}> = [
  {
    key: 'market_search',
    titel: 'Key & Guthaben prüfen',
    beschreibung:
      'Billigster Aufruf. Schlägt er fehl, bricht die Abfrage ab und die teuren Schritte laufen gar nicht erst.',
  },
  {
    key: 'comparables',
    titel: 'Vergleichsobjekte suchen',
    beschreibung:
      'Findet ähnliche Objekte im Umkreis — mit Nachtpreis, Auslastung und Reinigungsgebühr pro Objekt.',
  },
  {
    key: 'future_rates',
    titel: 'Künftige Tagespreise',
    beschreibung:
      'Bis 365 Tage Preise und Verfügbarkeit je Objekt. Kostet pro Objekt — Anzahl unten begrenzen.',
    proObjekt: true,
  },
  {
    key: 'radius_search',
    titel: 'Umkreissuche (teuer)',
    beschreibung:
      'Breitere Suche ohne Ähnlichkeitsfilter. Nur nötig, wenn die Vergleichssuche leer bleibt. Braucht Koordinaten.',
  },
];

export default function AirROIQueryCard() {
  const { toast } = useToast();
  const { data: houses } = useHouses();

  const [houseId, setHouseId] = useState<string>('');
  const [aktiveSchritte, setAktiveSchritte] = useState<SchrittKey[]>(['market_search', 'comparables']);
  const [radius, setRadius] = useState('10');
  const [maxFutureRates, setMaxFutureRates] = useState('3');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [bestaetigt, setBestaetigt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<any>(null);
  const [uebernehmeLaeuft, setUebernehmeLaeuft] = useState(false);
  // Uli waehlt selbst, welche Objekte vergleichbar sind (Apartments vs. Chalet).
  const [ausgewaehlteIds, setAusgewaehlteIds] = useState<Array<string | number>>([]);
  const [zeigeRohdaten, setZeigeRohdaten] = useState(false);

  const toggle = (key: SchrittKey) => {
    setBestaetigt(false);
    setAktiveSchritte((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const geschaetzteKosten = useMemo(() => {
    const anzahlRaten = Math.min(10, Math.max(1, parseInt(maxFutureRates || '0', 10) || 0));
    return aktiveSchritte.reduce((summe, key) => {
      if (key === 'future_rates') return summe + AIRROI_COSTS.future_rates * anzahlRaten;
      return summe + AIRROI_COSTS[key];
    }, 0);
  }, [aktiveSchritte, maxFutureRates]);

  const starten = async () => {
    if (!bestaetigt) {
      setBestaetigt(true);
      return;
    }
    setLaeuft(true);
    setErgebnis(null);
    try {
      const { data, error } = await supabase.functions.invoke('airroi-query', {
        body: {
          house_id: houseId || undefined,
          steps: aktiveSchritte,
          radius: parseInt(radius, 10) || 10,
          max_future_rates: parseInt(maxFutureRates, 10) || 3,
          latitude: latitude ? parseFloat(latitude) : undefined,
          longitude: longitude ? parseFloat(longitude) : undefined,
        },
      });
      if (error) throw error;
      setErgebnis(data);
      // Startzustand: alles ausgewählt — Uli wählt ab, was nicht passt.
      const schritte: any[] = data?.schritte ?? [];
      const treffer = schritte.find(
        (s: any) => (s.schritt === 'comparables' || s.schritt === 'radius_search') && s?.daten?.objekte?.length,
      );
      setAusgewaehlteIds(
        (treffer?.daten?.objekte ?? [])
          .map((o: any) => o.listing_id)
          .filter((id: any) => id !== null && id !== undefined),
      );
      toast({
        title: 'Abfrage abgeschlossen',
        description: `${data?.ergebnis ?? '—'} · Kosten ca. $${data?.kosten_usd ?? '?'}`,
      });
    } catch (e: any) {
      console.error('[AirROIQueryCard] Abfrage fehlgeschlagen', e);
      toast({
        variant: 'destructive',
        title: 'Abfrage fehlgeschlagen',
        description: e?.message ?? 'Unbekannter Fehler',
      });
    } finally {
      setLaeuft(false);
      setBestaetigt(false);
    }
  };

  // Objekte aus dem Ergebnis, die sich als Wettbewerber übernehmen lassen.
  const gefundeneObjekte: any[] = useMemo(() => {
    const schritte: any[] = ergebnis?.schritte ?? [];
    const treffer = schritte.find(
      (s) => (s.schritt === 'comparables' || s.schritt === 'radius_search') && s?.daten?.objekte?.length,
    );
    return treffer?.daten?.objekte ?? [];
  }, [ergebnis]);

  // Nur die ausgewählten Objekte — der ganze Zweck der Auswahl.
  const zuUebernehmen = useMemo(
    () => gefundeneObjekte.filter((o: any) =>
      ausgewaehlteIds.some((id) => String(id) === String(o.listing_id)),
    ),
    [gefundeneObjekte, ausgewaehlteIds],
  );

  const uebernehmen = async () => {
    if (!houseId || zuUebernehmen.length === 0) return;
    setUebernehmeLaeuft(true);
    try {
      const zeilen = zuUebernehmen.map((o) => ({
        house_id: houseId,
        competitor_name: o.name ?? `Airbnb ${o.listing_id}`,
        property_name: o.name ?? `Airbnb ${o.listing_id}`,
        platform: 'airbnb',
        bedrooms: o.schlafzimmer ?? null,
        bathrooms: o.baeder ?? null,
        max_guests: o.gaeste ?? null,
        rating: o.bewertung ?? null,
        review_count: o.bewertungen ?? null,
        address: o.ort ?? null,
        is_active: true,
        // Herkunft festhalten, damit später erkennbar ist, woher das Objekt kam
        // und ob die Lage genau oder von Airbnb verschleiert ist.
        property_url: o.url ?? null,
        notes: [
          `AirROI listing_id ${o.listing_id}`,
          o.objektart ?? o.typ,
          o.genaue_lage === false ? 'Lage ungefähr' : null,
          o.reinigungsgebuehr ? `Reinigung ${o.reinigungsgebuehr} ${o.waehrung ?? ''}`.trim() : null,
          o.adr_12monate ? `ADR ${Math.round(o.adr_12monate)}` : null,
          'von Uli als vergleichbar bestätigt',
        ].filter(Boolean).join(' · '),
      }));

      // CODING-GUIDE B3: schreibende Kommandos immer mit .select() abschließen
      // und auf 0 Zeilen prüfen — sonst meldet Supabase Erfolg trotz RLS-Block.
      const { data, error } = await supabase
        .from('competitor_properties')
        .insert(zeilen)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Es wurden 0 Zeilen geschrieben (RLS oder Constraint).');
      }

      toast({
        title: 'Wettbewerber übernommen',
        description: `${data.length} Objekte gespeichert. Sie erscheinen jetzt im Gäste-Tab beim Wettbewerbsvergleich.`,
      });
    } catch (e: any) {
      console.error('[AirROIQueryCard] Übernehmen fehlgeschlagen', e);
      toast({
        variant: 'destructive',
        title: 'Übernehmen fehlgeschlagen',
        description: e?.message ?? 'Unbekannter Fehler',
      });
    } finally {
      setUebernehmeLaeuft(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5 text-primary" />
          AirROI Abfrage (manuell)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Holt echte Vergleichsobjekte aus der AirROI-Datenbank (Airbnb-Basis), inklusive
          Reinigungsgebühr pro Objekt. Jeder Aufruf kostet Guthaben — deshalb läuft hier nichts
          automatisch. Preise laut{' '}
          <a
            href="https://www.airroi.com/api/pricing"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            airroi.com/api/pricing
          </a>
          , Guthaben im{' '}
          <a
            href="https://www.airroi.com/api/developer"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Developer-Dashboard
          </a>
          .
        </p>

        <div className="space-y-2">
          <Label>Haus</Label>
          <Select value={houseId} onValueChange={(v) => { setHouseId(v); setBestaetigt(false); }}>
            <SelectTrigger>
              <SelectValue placeholder="Haus auswählen" />
            </SelectTrigger>
            <SelectContent>
              {houses?.map((h: any) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Adresse, Schlafzimmer, Bäder und Gästezahl werden aus dem Haus übernommen.
          </p>
        </div>

        <div className="space-y-3 border-t pt-3">
          <Label>Schritte</Label>
          {SCHRITTE.map((s) => (
            <div key={s.key} className="flex items-start gap-3">
              <Checkbox
                id={`schritt-${s.key}`}
                checked={aktiveSchritte.includes(s.key)}
                onCheckedChange={() => toggle(s.key)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <label
                  htmlFor={`schritt-${s.key}`}
                  className="flex flex-wrap items-center gap-2 text-sm font-medium cursor-pointer"
                >
                  {s.titel}
                  <Badge variant="outline" className="text-xs">
                    ${AIRROI_COSTS[s.key].toFixed(2)}
                    {s.proObjekt ? ' / Objekt' : ''}
                  </Badge>
                </label>
                <p className="text-xs text-muted-foreground">{s.beschreibung}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3">
          <div className="space-y-1">
            <Label className="text-xs">Radius (Meilen, max. 10)</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Im ländlichen Raum hoch lassen — sonst bleibt die Suche leer.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tagespreise für wie viele Objekte</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={maxFutureRates}
              onChange={(e) => { setMaxFutureRates(e.target.value); setBestaetigt(false); }}
            />
            <p className="text-xs text-muted-foreground">Je Objekt $0.10.</p>
          </div>
        </div>

        {aktiveSchritte.includes('radius_search') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Breitengrad</Label>
              <Input value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="47.25" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Längengrad</Label>
              <Input value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="12.27" />
            </div>
          </div>
        )}

        <div className="rounded-lg bg-muted/50 p-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">Geschätzte Kosten dieses Laufs:</span>
          <span className="text-lg font-bold">${geschaetzteKosten.toFixed(2)}</span>
        </div>

        {bestaetigt && !laeuft && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <span>
              Dieser Lauf kostet ca. <strong>${geschaetzteKosten.toFixed(2)}</strong> echtes
              Guthaben. Nochmal klicken zum Starten.
            </span>
          </div>
        )}

        <Button
          onClick={starten}
          disabled={laeuft || aktiveSchritte.length === 0 || !houseId}
          className="w-full"
          variant={bestaetigt ? 'destructive' : 'default'}
        >
          {laeuft ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Abfrage läuft…
            </>
          ) : bestaetigt ? (
            `Jetzt wirklich starten ($${geschaetzteKosten.toFixed(2)})`
          ) : (
            `Abfrage vorbereiten ($${geschaetzteKosten.toFixed(2)})`
          )}
        </Button>

        {ergebnis && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium flex items-center gap-2">
                {ergebnis.ergebnis === 'ALLES OK' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                )}
                {ergebnis.ergebnis}
              </span>
              <Badge variant="secondary">Kosten ca. ${ergebnis.kosten_usd}</Badge>
            </div>

            {(ergebnis.schritte ?? []).map((s: any, i: number) => (
              <div key={i} className="rounded-lg border p-3 space-y-1 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{s.endpunkt}</span>
                  <Badge variant={s.ok ? 'default' : 'destructive'} className="text-xs">
                    {s.http_status ?? 'übersprungen'}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">{s.befund}</p>

                {s?.daten?.adr_pro_nacht && (
                  <p className="text-xs">
                    Nachtpreis: <strong>Ø €{s.daten.adr_pro_nacht.durchschnitt}</strong> (Median €
                    {s.daten.adr_pro_nacht.median}, {s.daten.adr_pro_nacht.min}–
                    {s.daten.adr_pro_nacht.max})
                  </p>
                )}
                {s?.daten?.reinigungsgebuehr && (
                  <p className="text-xs">
                    Reinigungsgebühr: Ø €{s.daten.reinigungsgebuehr.durchschnitt} (
                    {s.daten.reinigungsgebuehr.min}–{s.daten.reinigungsgebuehr.max}, bei{' '}
                    {s.daten.reinigungsgebuehr.anzahl} Objekten angegeben)
                  </p>
                )}
                {s?.daten?.preis_statistik && (
                  <p className="text-xs">
                    Tagespreise: Ø €{s.daten.preis_statistik.durchschnitt} ·{' '}
                    {s.daten.tage_verfuegbar}/{s.daten.tage_gesamt} Tage frei
                  </p>
                )}
                {typeof s?.daten?.mit_genauer_lage === 'number' && s?.daten?.anzahl > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {s.daten.mit_genauer_lage} von {s.daten.anzahl} Objekten mit genauer Lage —
                    bei den übrigen verschleiert Airbnb die Position, die Entfernung ist ungefähr.
                  </p>
                )}
              </div>
            ))}

            {gefundeneObjekte.length > 0 && (
              <div className="space-y-2">
                <AirROIComparablesPicker
                  objekte={gefundeneObjekte as AirroiObjekt[]}
                  ausgewaehlteIds={ausgewaehlteIds}
                  onAuswahlChange={setAusgewaehlteIds}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={uebernehmen}
                  disabled={uebernehmeLaeuft || zuUebernehmen.length === 0}
                >
                  {uebernehmeLaeuft ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {zuUebernehmen.length} ausgewählte Objekte als Wettbewerber übernehmen
                </Button>
                <p className="text-xs text-muted-foreground">
                  Danach erscheinen sie im Gäste-Tab beim Wettbewerbsvergleich. Kostet nichts
                  extra — die Daten sind schon abgerufen.
                </p>

                {/* Rohdaten: belegt, welche Felder AirROI wirklich liefert.
                    Das Antwortschema ist öffentlich nicht vollständig
                    dokumentiert — hier steht es statt einer Vermutung. */}
                <button
                  type="button"
                  className="text-xs underline text-muted-foreground"
                  onClick={() => setZeigeRohdaten((v) => !v)}
                >
                  {zeigeRohdaten ? 'Rohdaten ausblenden' : 'Rohdaten des ersten Objekts anzeigen'}
                </button>
                {zeigeRohdaten && (
                  <pre className="text-[10px] leading-tight bg-muted/50 rounded-lg p-3 overflow-auto max-h-72">
                    {JSON.stringify(
                      (ergebnis?.schritte ?? []).find((s: any) => s?.daten?.rohdaten_erstes_objekt)
                        ?.daten?.rohdaten_erstes_objekt ?? {},
                      null,
                      2,
                    )}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
