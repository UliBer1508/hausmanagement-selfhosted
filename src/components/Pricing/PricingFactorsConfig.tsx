import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Info, RotateCcw, Save, ChevronDown } from 'lucide-react';
import {
  DEFAULT_PRICING_CONFIG,
  usePricingSettings,
  useSavePricingSettings,
  type PricingConfig,
} from '@/hooks/usePricingSettings';
import AirROISyncCard from '@/components/Settings/AirROISyncCard';

// Defaults — spiegeln supabase/functions/pricing-engine/index.ts (DEFAULT_FACTORS).
// Jede Abweichung hier senkt oder hebt die real berechneten Preise, weil das
// gespeicherte factors-Objekt die Engine-Defaults überschreibt (mergeFactors).
// Bei Änderungen an der Engine: diese Werte im selben Schritt nachziehen.
export const DEFAULT_FACTORS = {
  season: { 1: 1.40, 2: 1.50, 3: 0.85, 4: 0.70, 5: 0.85, 6: 1.10, 7: 1.50, 8: 1.55, 9: 0.95, 10: 0.75, 11: 0.65, 12: 1.30 },
  // Mo=0 … So=6 (ISO, wie isoWeekday in der Engine)
  dow: { 0: 0.85, 1: 0.85, 2: 0.85, 3: 0.95, 4: 1.25, 5: 1.35, 6: 1.10 },
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
  // short = 1–2 Nächte, long = 3–4, medium = 5–7, none = keine Lücke (neutral)
  gap: { short: 0.75, long: 0.88, medium: 0.92, none: 1.00 },
  event: { small: 1.05, medium: 1.15, large: 1.30 },
  weather: { clear: 1.05, cloudy: 1.00, rain: 0.95, snow_winter: 1.10, snow_summer: 0.90, storm: 0.92 },
  holiday: {
    at: 1.30,
    de_by: 1.30,
    at_plus_de: 1.45,
    foreign_single: 1.15,
    foreign_multi: 1.25,
    at_or_de_plus_foreign: 1.55,
  },
  // Rabatt für lange zusammenhängende freie Blöcke (Length of Stay)
  los: { d7: 0.95, d14: 0.90, d21: 0.85 },
};

/**
 * Führt gespeicherte Faktoren mit den Defaults zusammen — eine Ebene tief.
 * Nötig, weil ein flacher Spread eine gespeicherte Gruppe komplett ersetzt:
 * Ein älteres `gap: { short, long }` ohne `medium` ergäbe sonst ein leeres
 * Eingabefeld. Arrays (leadtime, occupancy) werden bewusst ersetzt, nicht gemischt.
 */
function mergeFactors(custom: any) {
  const c = custom ?? {};
  return {
    season: { ...DEFAULT_FACTORS.season, ...(c.season ?? {}) },
    dow: { ...DEFAULT_FACTORS.dow, ...(c.dow ?? {}) },
    leadtime: Array.isArray(c.leadtime) && c.leadtime.length ? c.leadtime : DEFAULT_FACTORS.leadtime,
    occupancy: Array.isArray(c.occupancy) && c.occupancy.length ? c.occupancy : DEFAULT_FACTORS.occupancy,
    gap: { ...DEFAULT_FACTORS.gap, ...(c.gap ?? {}) },
    event: { ...DEFAULT_FACTORS.event, ...(c.event ?? {}) },
    weather: { ...DEFAULT_FACTORS.weather, ...(c.weather ?? {}) },
    holiday: { ...DEFAULT_FACTORS.holiday, ...(c.holiday ?? {}) },
    los: { ...DEFAULT_FACTORS.los, ...(c.los ?? {}) },
  };
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

interface Props { houseId: string }

export function PricingFactorsConfig({ houseId }: Props) {
  const [factors, setFactors] = useState<any>(DEFAULT_FACTORS);
  const [pricingConfig, setPricingConfig] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const { data: globalCfg } = usePricingSettings();
  const saveGlobal = useSavePricingSettings();
  const [airroi, setAirroi] = useState({
    airroi_room_type: DEFAULT_PRICING_CONFIG.airroi_room_type,
    airroi_min_bedrooms: DEFAULT_PRICING_CONFIG.airroi_min_bedrooms,
    airroi_num_months: DEFAULT_PRICING_CONFIG.airroi_num_months,
    airroi_currency: DEFAULT_PRICING_CONFIG.airroi_currency,
    airroi_country: DEFAULT_PRICING_CONFIG.airroi_country,
    airroi_region: DEFAULT_PRICING_CONFIG.airroi_region,
    airroi_locality: DEFAULT_PRICING_CONFIG.airroi_locality,
    airroi_district: DEFAULT_PRICING_CONFIG.airroi_district,
  });

  useEffect(() => {
    if (globalCfg) {
      setAirroi({
        airroi_room_type: globalCfg.airroi_room_type,
        airroi_min_bedrooms: globalCfg.airroi_min_bedrooms,
        airroi_num_months: globalCfg.airroi_num_months,
        airroi_currency: globalCfg.airroi_currency,
        airroi_country: globalCfg.airroi_country ?? DEFAULT_PRICING_CONFIG.airroi_country,
        airroi_region: globalCfg.airroi_region ?? DEFAULT_PRICING_CONFIG.airroi_region,
        airroi_locality: globalCfg.airroi_locality ?? DEFAULT_PRICING_CONFIG.airroi_locality,
        airroi_district: globalCfg.airroi_district ?? DEFAULT_PRICING_CONFIG.airroi_district,
      });
    }
  }, [globalCfg]);

  useEffect(() => {
    if (!houseId) return;
    (async () => {
      const { data } = await supabase.from('houses').select('pricing_config').eq('id', houseId).maybeSingle();
      const cfg = (data?.pricing_config as any) ?? {};
      setPricingConfig(cfg);
      setFactors(mergeFactors(cfg.factors));
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
      const { data, error } = await supabase
        .from('houses')
        .update({ pricing_config: newCfg })
        .eq('id', houseId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Keine Zeile aktualisiert — Haus nicht gefunden oder keine Berechtigung.');
      const mergedGlobal: PricingConfig = { ...DEFAULT_PRICING_CONFIG, ...(globalCfg ?? {}), ...airroi };
      await saveGlobal.mutateAsync(mergedGlobal);
      setPricingConfig(newCfg);
      toast.success('Konfiguration gespeichert. Greift bei nächster Smart-Berechnung & nächstem AirROI-Sync.');
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
      const { data, error } = await supabase
        .from('houses')
        .update({ pricing_config: newCfg })
        .eq('id', houseId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Keine Zeile aktualisiert — Haus nicht gefunden oder keine Berechtigung.');
      setPricingConfig(newCfg);
      setFactors(DEFAULT_FACTORS);
      setAirroi({
        airroi_room_type: DEFAULT_PRICING_CONFIG.airroi_room_type,
        airroi_min_bedrooms: DEFAULT_PRICING_CONFIG.airroi_min_bedrooms,
        airroi_num_months: DEFAULT_PRICING_CONFIG.airroi_num_months,
        airroi_currency: DEFAULT_PRICING_CONFIG.airroi_currency,
        airroi_country: DEFAULT_PRICING_CONFIG.airroi_country,
        airroi_region: DEFAULT_PRICING_CONFIG.airroi_region,
        airroi_locality: DEFAULT_PRICING_CONFIG.airroi_locality,
        airroi_district: DEFAULT_PRICING_CONFIG.airroi_district,
      });
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
              <p className="text-xs text-muted-foreground">Multiplikatoren (pro Haus) & Datenquellen-Filter (global).</p>
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
          <li><strong>Feiertage &amp; Schulferien:</strong> OpenHolidays API (AT, DE-BY, NL, CZ, PL, HU)</li>
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
          <li>Alle Faktoren werden <strong>multiplikativ</strong> kombiniert: Endpreis = Basispreis × Saison × Wochentag × Leadtime × Auslastung × Lücke × Event × Wetter × Feiertag × Langaufenthalt</li>
          <li>An Feiertagen hebt die Engine die Saison auf mindestens 1.10 an und setzt den Langaufenthalts-Rabatt aus.</li>
        </ul>
      </div>

      <Accordion type="multiple" className="w-full">
        <AccordionItem value="datasources">
          <AccordionTrigger className="text-sm">Datenquellen (AirROI Marktdaten)</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2 mb-3">
              Diese Filter bestimmen, welche Vergleichsobjekte AirROI für die Marktauslastung heranzieht.
              Der ermittelte Auslastungswert fließt als Eingabe in den Preisalgorithmus oben ein.
            </p>
            <div className="rounded border border-border p-3 mb-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marktdefinition</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Land *</Label>
                  <Input className="h-9" disabled={saving} value={airroi.airroi_country}
                    onChange={(e) => setAirroi((p) => ({ ...p, airroi_country: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Region *</Label>
                  <Input className="h-9" disabled={saving} value={airroi.airroi_region}
                    onChange={(e) => setAirroi((p) => ({ ...p, airroi_region: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ort/Markt *</Label>
                  <Input className="h-9" disabled={saving} value={airroi.airroi_locality}
                    onChange={(e) => setAirroi((p) => ({ ...p, airroi_locality: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stadtteil/Gebiet</Label>
                <Input className="h-9" disabled={saving} value={airroi.airroi_district}
                  placeholder="Optional – z.B. Pinzgau"
                  onChange={(e) => setAirroi((p) => ({ ...p, airroi_district: e.target.value }))} />
              </div>
              <p className="text-xs text-muted-foreground">
                Diese Werte werden direkt an die AirROI Markets API übergeben. Nutze übergeordnete Regionen
                (z.B. „Salzburg" statt „Neukirchen") für bessere Ergebnisse — kleine Orte haben oft
                zu wenige Listings für aussagekräftige Marktdaten.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Zimmertyp</Label>
                <Select value={airroi.airroi_room_type} disabled={saving}
                  onValueChange={(v) => setAirroi((p) => ({ ...p, airroi_room_type: v as PricingConfig['airroi_room_type'] }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entire_home">Gesamte Unterkunft</SelectItem>
                    <SelectItem value="private_room">Privatzimmer</SelectItem>
                    <SelectItem value="shared_room">Geteiltes Zimmer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mindest-Schlafzimmer</Label>
                <Input type="number" min={1} max={10} step={1} className="h-9"
                  value={airroi.airroi_min_bedrooms} disabled={saving}
                  onChange={(e) => setAirroi((p) => ({ ...p, airroi_min_bedrooms: Math.max(1, Math.min(10, Number(e.target.value))) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Analysezeitraum</Label>
                <Select value={String(airroi.airroi_num_months)} disabled={saving}
                  onValueChange={(v) => setAirroi((p) => ({ ...p, airroi_num_months: Number(v) as PricingConfig['airroi_num_months'] }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 Monate</SelectItem>
                    <SelectItem value="12">12 Monate</SelectItem>
                    <SelectItem value="24">24 Monate</SelectItem>
                    <SelectItem value="36">36 Monate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Währung</Label>
                <Select value={airroi.airroi_currency} disabled={saving}
                  onValueChange={(v) => setAirroi((p) => ({ ...p, airroi_currency: v as PricingConfig['airroi_currency'] }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eur">EUR</SelectItem>
                    <SelectItem value="usd">USD</SelectItem>
                    <SelectItem value="native">Landeswährung</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <AirROISyncCard />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="season">
          <AccordionTrigger className="text-sm">Saison (Monats-Multiplikatoren)</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 mb-3">
              Berücksichtigt typische Nachfrage im Jahresverlauf. Hochsaison (Winterferien Jan/Feb, Sommer Jul/Aug, Weihnachten Dez) bekommt einen Aufschlag; Nebensaison (Apr, Nov) einen Rabatt. Greift nach dem Monat des Check-in-Datums.
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
              Wochenenden (Fr/Sa) sind in Ferienregionen stärker nachgefragt → Aufschlag. Wochentage (Mo-Do) erhalten meist einen Rabatt, um die Auslastung zu glätten. Greift pro Übernachtung.
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
              Wird auf Tage angewendet, die zwischen zwei bestehenden Buchungen liegen (Suchfenster 14 Tage in jede Richtung). <strong>Kurze Lücken</strong> (1-2 Nächte) sind schwer verkäuflich → stärkerer Rabatt. <strong>3-4 Nächte</strong> → moderater Rabatt. <strong>5-7 Nächte</strong> → leichter Rabatt. Ab 8 Nächten gilt kein Lücken-Rabatt mehr.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Kurze Lücke (1-2 Nächte)</Label>
                <NumberInput value={factors.gap.short} onChange={(v) => setNum(['gap', 'short'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mittlere Lücke (3-4 Nächte)</Label>
                <NumberInput value={factors.gap.long} onChange={(v) => setNum(['gap', 'long'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lange Lücke (5-7 Nächte)</Label>
                <NumberInput value={factors.gap.medium} onChange={(v) => setNum(['gap', 'medium'], v)} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="los">
          <AccordionTrigger className="text-sm">Langaufenthalts-Rabatt (LOS)</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 mb-3">
              Greift auf Tage in einem langen zusammenhängenden freien Block. Je länger der freie Block, desto größer der Anreiz für eine lange Buchung. <strong>An Feiertagen wird dieser Rabatt automatisch ausgesetzt</strong> — dort ist die Nachfrage ohnehin hoch.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Ab 7 freien Nächten</Label>
                <NumberInput value={factors.los.d7} onChange={(v) => setNum(['los', 'd7'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ab 14 freien Nächten</Label>
                <NumberInput value={factors.los.d14} onChange={(v) => setNum(['los', 'd14'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ab 21 freien Nächten</Label>
                <NumberInput value={factors.los.d21} onChange={(v) => setNum(['los', 'd21'], v)} />
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
              Roh-Daten aus Open-Meteo (16-Tage-Vorhersage). Schönes Wetter steigert die Buchungslust, Schlechtwetter dämpft sie. Saison-abhängig: <strong>Schnee im Winter</strong> ist positiv (Skifahren), <strong>Schnee im Sommer</strong> negativ. Außerhalb der Vorhersage-Reichweite greift ein klimatologischer Monatswert.
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
          <AccordionTrigger className="text-sm">Feiertage &amp; Schulferien</AccordionTrigger>
          <AccordionContent>
            <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2 mb-3">
              Roh-Daten aus OpenHolidays (Feiertage <em>und</em> Schulferien) für sechs Quellmärkte. <strong>Inland</strong> = Österreich und Bayern. <strong>Ausland</strong> = Niederlande, Tschechien, Polen, Ungarn. Je mehr Quellmärkte gleichzeitig frei haben, desto höher der Aufschlag — bei Inland <em>und</em> Ausland gleichzeitig greift der stärkste Wert.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nur Österreich</Label>
                <NumberInput value={factors.holiday.at} onChange={(v) => setNum(['holiday', 'at'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nur Bayern</Label>
                <NumberInput value={factors.holiday.de_by} onChange={(v) => setNum(['holiday', 'de_by'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Österreich + Bayern</Label>
                <NumberInput value={factors.holiday.at_plus_de} onChange={(v) => setNum(['holiday', 'at_plus_de'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ein Auslandsmarkt</Label>
                <NumberInput value={factors.holiday.foreign_single} onChange={(v) => setNum(['holiday', 'foreign_single'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mehrere Auslandsmärkte</Label>
                <NumberInput value={factors.holiday.foreign_multi} onChange={(v) => setNum(['holiday', 'foreign_multi'], v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Inland + Ausland</Label>
                <NumberInput value={factors.holiday.at_or_de_plus_foreign} onChange={(v) => setNum(['holiday', 'at_or_de_plus_foreign'], v)} />
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
