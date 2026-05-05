import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Info, RotateCcw, Save, ChevronDown } from 'lucide-react';

// Defaults — must mirror supabase/functions/pricing-engine/index.ts
export const DEFAULT_FACTORS = {
  season: { 1: 1.40, 2: 1.50, 3: 0.80, 4: 0.70, 5: 0.85, 6: 1.00, 7: 1.30, 8: 1.40, 9: 0.90, 10: 0.75, 11: 0.65, 12: 1.30 },
  dow: { 0: 0.85, 1: 0.85, 2: 0.85, 3: 0.90, 4: 1.10, 5: 1.20, 6: 0.95 },
  leadtime: [
    { days: 90, factor: 0.90 },
    { days: 60, factor: 0.95 },
    { days: 30, factor: 1.00 },
    { days: 14, factor: 1.05 },
    { days: 7, factor: 1.10 },
    { days: 0, factor: 0.85 },
  ],
  occupancy: [
    { threshold: 0.30, factor: 0.85 },
    { threshold: 0.50, factor: 0.90 },
    { threshold: 0.70, factor: 1.00 },
    { threshold: 0.85, factor: 1.10 },
    { threshold: 1.01, factor: 1.25 },
  ],
  gap: { short: 0.75, long: 0.88 },
  event: { small: 1.05, medium: 1.15, large: 1.30 },
  weather: { clear: 1.05, cloudy: 1.00, rain: 0.95, snow_winter: 1.10, snow_summer: 0.90, storm: 0.92 },
  holiday: { at: 1.25, de_by: 1.20, both: 1.35 },
};

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

interface Props { houseId: string }

export function PricingFactorsConfig({ houseId }: Props) {
  const [factors, setFactors] = useState<any>(DEFAULT_FACTORS);
  const [pricingConfig, setPricingConfig] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!houseId) return;
    (async () => {
      const { data } = await supabase.from('houses').select('pricing_config').eq('id', houseId).maybeSingle();
      const cfg = (data?.pricing_config as any) ?? {};
      setPricingConfig(cfg);
      setFactors({ ...DEFAULT_FACTORS, ...(cfg.factors ?? {}) });
    })();
  }, [houseId]);

  function setNum(path: string[], value: number) {
    setFactors((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev));
      let obj = next;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      obj[path[path.length - 1]] = value;
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const newCfg = { ...pricingConfig, factors };
      const { error } = await supabase.from('houses').update({ pricing_config: newCfg }).eq('id', houseId);
      if (error) throw error;
      setPricingConfig(newCfg);
      toast.success('Faktoren gespeichert. Greifen bei nächster Smart-Berechnung.');
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen: ' + e?.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      const newCfg = { ...pricingConfig };
      delete newCfg.factors;
      const { error } = await supabase.from('houses').update({ pricing_config: newCfg }).eq('id', houseId);
      if (error) throw error;
      setPricingConfig(newCfg);
      setFactors(DEFAULT_FACTORS);
      toast.success('Auf Standardwerte zurückgesetzt');
    } catch (e: any) {
      toast.error('Reset fehlgeschlagen: ' + e?.message);
    } finally {
      setSaving(false);
    }
  }

  const NumberInput = ({ value, onChange, step = 0.05 }: { value: number; onChange: (v: number) => void; step?: number }) => (
    <Input type="number" step={step} min={0.1} max={3} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 w-20 text-sm"
    />
  );

  return (
    <Card className="p-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CollapsibleTrigger className="flex items-center gap-2 text-left group flex-1 min-w-0">
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
            <div className="min-w-0">
              <h3 className="font-semibold">Preis-Faktoren konfigurieren</h3>
              <p className="text-xs text-muted-foreground">Multiplikatoren pro Haus. Defaults gelten für Pinzgau.</p>
            </div>
          </CollapsibleTrigger>
          {open && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Standard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-3.5 w-3.5 mr-1" /> Speichern
              </Button>
            </div>
          )}
        </div>

        <CollapsibleContent className="space-y-4 pt-4">
      <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-medium"><Info className="h-3.5 w-3.5" /> Datenquellen (Roh-Daten):</div>
        <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
          <li><strong>Wetter:</strong> Open-Meteo API (16-Tage-Vorhersage, Lat 47.25 / Lon 12.17)</li>
          <li><strong>Feiertage:</strong> OpenHolidays API (Österreich + Bayern)</li>
          <li><strong>Events:</strong> Tabelle <code>local_events</code></li>
          <li><strong>Auslastung:</strong> Live aus <code>daily_pricing</code></li>
          <li><strong>Multiplikatoren:</strong> Werden hier definiert (sonst Standard)</li>
        </ul>
      </div>

      <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
        <div className="flex items-center gap-1.5 font-medium"><Info className="h-3.5 w-3.5" /> So liest du die Werte:</div>
        <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
          <li><strong>1.00</strong> = neutral (Basispreis bleibt unverändert)</li>
          <li><strong>&gt; 1.00</strong> = Aufschlag (z. B. 1.20 = +20 %)</li>
          <li><strong>&lt; 1.00</strong> = Rabatt (z. B. 0.85 = −15 %)</li>
          <li>Alle Faktoren werden <strong>multiplikativ</strong> kombiniert: Endpreis = Basispreis × Saison × Wochentag × Leadtime × Auslastung × Wetter × Feiertag × Event × Lücke</li>
        </ul>
      </div>

      <Accordion type="multiple" className="w-full">
        <AccordionItem value="season">
          <AccordionTrigger className="text-sm">Saison (Monats-Multiplikatoren)</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 mb-3">
              Berücksichtigt typische Nachfrage im Jahresverlauf. Hochsaison (Winterferien Feb, Sommer Jul/Aug, Weihnachten Dez) bekommt einen Aufschlag; Nebensaison (Apr, Nov) einen Rabatt. Greift nach dem Monat des Check-in-Datums.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {MONTHS.map((m, i) => (
                <div key={i} className="space-y-1">
                  <Label className="text-xs">{m}</Label>
                  <NumberInput value={factors.season[i + 1] ?? 1} onChange={(v) => setNum(['season', String(i + 1)], v)} />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="dow">
          <AccordionTrigger className="text-sm">Wochentage</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 mb-3">
              Wochenenden (Fr/Sa) sind in Ferienregionen stärker nachgefragt → Aufschlag. Wochentage (So-Do) erhalten meist einen Rabatt, um die Auslastung zu glätten. Greift pro Übernachtung.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
              {DOW.map((d, i) => (
                <div key={i} className="space-y-1">
                  <Label className="text-xs">{d}</Label>
                  <NumberInput value={factors.dow[i] ?? 1} onChange={(v) => setNum(['dow', String(i)], v)} />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="leadtime">
          <AccordionTrigger className="text-sm">Vorlaufzeit (Lead-Time)</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 mb-3">
              Steuert Frühbucher- und Last-Minute-Logik. <strong>Lange Vorlaufzeit</strong> (&gt; 60-90 Tage) = leichter Frühbucher-Rabatt zur Buchungssicherung. <strong>Mittlere Vorlaufzeit</strong> (14-30 Tage) = Standardpreis bzw. leichter Aufschlag (höchste Zahlungsbereitschaft). <strong>Kurzfristig</strong> (&lt; 7 Tage) = Last-Minute-Rabatt, um Leerstand zu vermeiden. Reihenfolge: höchste Tage-Schwelle zuerst — die erste passende Regel greift.
            </p>
            <div className="space-y-2">
              {factors.leadtime.map((row: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-24">&gt; {row.days} Tage:</span>
                  <NumberInput value={row.factor}
                    onChange={(v) => setFactors((p: any) => { const n = JSON.parse(JSON.stringify(p)); n.leadtime[idx].factor = v; return n; })} />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="occupancy">
          <AccordionTrigger className="text-sm">Auslastung</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 mb-3">
              Reagiert auf die Buchungsdichte des Monats (Yield Management). <strong>Niedrige Auslastung</strong> → Rabatt, um Buchungen anzuziehen. <strong>Hohe Auslastung</strong> → Aufschlag, weil Knappheit höhere Preise rechtfertigt. Wert = Anteil belegter Tage im Monat (0 = leer, 1 = voll).
            </p>
            <div className="space-y-2">
              {factors.occupancy.map((row: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-24">&lt; {Math.round(row.threshold * 100)}%:</span>
                  <NumberInput value={row.factor}
                    onChange={(v) => setFactors((p: any) => { const n = JSON.parse(JSON.stringify(p)); n.occupancy[idx].factor = v; return n; })} />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="gap">
          <AccordionTrigger className="text-sm">Lücken-Rabatt (zwischen Buchungen)</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 mb-3">
              Wird auf einzelne Tage angewendet, die zwischen zwei bestehenden Buchungen liegen. <strong>Kurze Lücken</strong> (1-2 Nächte) sind schwer verkäuflich → stärkerer Rabatt. <strong>Längere Lücken</strong> (3-4 Nächte) → moderater Rabatt. Verhindert Leerstand zwischen Gäste-Wechseln.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Kurze Lücke (1-2 Nächte)</Label>
                <NumberInput value={factors.gap.short} onChange={(v) => setNum(['gap', 'short'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lange Lücke (3-4 Nächte)</Label>
                <NumberInput value={factors.gap.long} onChange={(v) => setNum(['gap', 'long'], v)} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="event">
          <AccordionTrigger className="text-sm">Lokale Events</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 mb-3">
              Greift, wenn in der Tabelle <code>local_events</code> ein Event im Buchungszeitraum hinterlegt ist. <strong>Small</strong> = lokales Event mit moderater Zugkraft. <strong>Medium</strong> = überregional. <strong>Large</strong> = Großveranstaltung mit hoher Übernachtungs-Nachfrage (Festival, Sport-Großevent).
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(['small', 'medium', 'large'] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs capitalize">{k}</Label>
                  <NumberInput value={factors.event[k]} onChange={(v) => setNum(['event', k], v)} />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="weather">
          <AccordionTrigger className="text-sm">Wetter</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 mb-3">
              Roh-Daten aus Open-Meteo (16-Tage-Vorhersage). Schönes Wetter steigert die Buchungslust, Schlechtwetter dämpft sie. Saison-abhängig: <strong>Schnee im Winter</strong> ist positiv (Skifahren), <strong>Schnee im Sommer</strong> negativ. Greift nur innerhalb der Vorhersage-Reichweite.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {([
                ['clear', 'Klar/Sonnig'],
                ['cloudy', 'Bewölkt'],
                ['rain', 'Regen'],
                ['snow_winter', 'Schnee (Winter)'],
                ['snow_summer', 'Schnee (Sommer)'],
                ['storm', 'Sturm'],
              ] as const).map(([k, label]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <NumberInput value={factors.weather[k]} onChange={(v) => setNum(['weather', k], v)} />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="holiday">
          <AccordionTrigger className="text-sm">Feiertage</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 mb-3">
              Roh-Daten aus OpenHolidays (AT + Bayern). Aufschlag für Feier- und Brückentage. <strong>Beide</strong> = Feiertag in Österreich UND Bayern → stärkster Aufschlag, weil die Reisetätigkeit aus beiden Quellmärkten gleichzeitig hoch ist.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Österreich</Label>
                <NumberInput value={factors.holiday.at} onChange={(v) => setNum(['holiday', 'at'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bayern</Label>
                <NumberInput value={factors.holiday.de_by} onChange={(v) => setNum(['holiday', 'de_by'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Beide</Label>
                <NumberInput value={factors.holiday.both} onChange={(v) => setNum(['holiday', 'both'], v)} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default PricingFactorsConfig;