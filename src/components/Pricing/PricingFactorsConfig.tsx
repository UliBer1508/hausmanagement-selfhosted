import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Info, RotateCcw, Save } from 'lucide-react';

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
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Preis-Faktoren konfigurieren</h3>
          <p className="text-xs text-muted-foreground">Multiplikatoren pro Haus. Defaults gelten für Pinzgau.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Standard
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" /> Speichern
          </Button>
        </div>
      </div>

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

      <Accordion type="multiple" className="w-full">
        <AccordionItem value="season">
          <AccordionTrigger className="text-sm">Saison (Monats-Multiplikatoren)</AccordionTrigger>
          <AccordionContent>
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
            <p className="text-xs text-muted-foreground mb-2">Faktor je nach Tagen bis Check-in. Reihenfolge: höchste Schwelle zuerst.</p>
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
            <p className="text-xs text-muted-foreground mb-2">Faktor je nach Monats-Auslastung (0–1).</p>
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
    </Card>
  );
}

export default PricingFactorsConfig;