import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Plus, RotateCcw, Save, Trash2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_PRICING_CONFIG,
  usePricingSettings,
  useSavePricingSettings,
  type PricingConfig,
} from '@/hooks/usePricingSettings';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function GlobalPricingConfigCard() {
  const { data, isLoading } = usePricingSettings();
  const save = useSavePricingSettings();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const disabled = save.isPending || isLoading;

  function patch<K extends keyof PricingConfig>(key: K, value: PricingConfig[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function setArrayItem<K extends 'season_factors' | 'dow_factors'>(key: K, idx: number, value: number) {
    setForm((p) => {
      const arr = [...p[key]];
      arr[idx] = value;
      return { ...p, [key]: arr };
    });
  }

  function setStepItem(key: 'lead_time_steps' | 'occupancy_steps', idx: number, col: 0 | 1, value: number) {
    setForm((p) => {
      const arr = p[key].map((row) => [...row] as [number, number]);
      arr[idx][col] = value;
      return { ...p, [key]: arr };
    });
  }

  function addStep(key: 'lead_time_steps' | 'occupancy_steps') {
    setForm((p) => ({ ...p, [key]: [...p[key], [0, 1.0]] as [number, number][] }));
  }

  function removeStep(key: 'lead_time_steps' | 'occupancy_steps', idx: number) {
    setForm((p) => ({ ...p, [key]: p[key].filter((_, i) => i !== idx) }));
  }

  function handleReset() {
    setForm({ ...DEFAULT_PRICING_CONFIG });
    toast.info('Standardwerte geladen — noch nicht gespeichert');
  }

  function handleSave() {
    save.mutate(form, {
      onSuccess: () => toast.success('Globale Pricing-Konfiguration gespeichert'),
      onError: (e: any) => toast.error('Speichern fehlgeschlagen: ' + e?.message),
    });
  }

  const NumInput = ({ value, onChange, step = 0.05, min = 0, max = 10 }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) => (
    <Input
      type="number" step={step} min={min} max={max} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      className="h-8 w-24 text-sm"
    />
  );

  return (
    <Card className="p-4 border-primary/30">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CollapsibleTrigger className="flex items-center gap-2 text-left flex-1 min-w-0">
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
            <Globe className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <h3 className="font-semibold">Globale Pricing-Konfiguration</h3>
              <p className="text-xs text-muted-foreground">
                Algorithmus-Parameter & AirROI-Filter (gilt für alle Häuser)
              </p>
            </div>
          </CollapsibleTrigger>
          {open && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset} disabled={disabled}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Standard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={disabled}>
                <Save className="h-3.5 w-3.5 mr-1" /> Speichern
              </Button>
            </div>
          )}
        </div>

        <CollapsibleContent className="pt-4">
          <Tabs defaultValue="airroi" className="w-full">
            <TabsList>
              <TabsTrigger value="airroi">AirROI Filter</TabsTrigger>
              <TabsTrigger value="algo">Preisalgorithmus</TabsTrigger>
            </TabsList>

            <TabsContent value="airroi" className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Zimmertyp</Label>
                  <Select value={form.airroi_room_type} disabled={disabled}
                    onValueChange={(v) => patch('airroi_room_type', v as PricingConfig['airroi_room_type'])}>
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
                  <Input type="number" min={1} max={10} step={1}
                    value={form.airroi_min_bedrooms} disabled={disabled}
                    onChange={(e) => patch('airroi_min_bedrooms', Math.max(1, Math.min(10, Number(e.target.value))))}
                    className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Analysezeitraum</Label>
                  <Select value={String(form.airroi_num_months)} disabled={disabled}
                    onValueChange={(v) => patch('airroi_num_months', Number(v) as PricingConfig['airroi_num_months'])}>
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
                  <Select value={form.airroi_currency} disabled={disabled}
                    onValueChange={(v) => patch('airroi_currency', v as PricingConfig['airroi_currency'])}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eur">EUR</SelectItem>
                      <SelectItem value="usd">USD</SelectItem>
                      <SelectItem value="native">Landeswährung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="algo" className="space-y-6 pt-4">
              <section className="space-y-2">
                <h4 className="text-sm font-medium">Saison-Faktoren (pro Monat)</h4>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {MONTHS.map((m, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-xs">{m}</Label>
                      <NumInput value={form.season_factors[i] ?? 1}
                        onChange={(v) => setArrayItem('season_factors', i, v)}
                        min={0.1} max={3} />
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-medium">Wochentag-Faktoren</h4>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
                  {DOW.map((d, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-xs">{d}</Label>
                      <NumInput value={form.dow_factors[i] ?? 1}
                        onChange={(v) => setArrayItem('dow_factors', i, v)}
                        min={0.1} max={3} />
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Lead-Time-Stufen</h4>
                  <Button variant="outline" size="sm" onClick={() => addStep('lead_time_steps')} disabled={disabled}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Zeile
                  </Button>
                </div>
                <div className="space-y-1">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1">
                    <span>≤ Tage</span><span>Faktor</span><span></span>
                  </div>
                  {form.lead_time_steps.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                      <Input type="number" step={1} min={0} value={row[0]} disabled={disabled}
                        onChange={(e) => setStepItem('lead_time_steps', idx, 0, Number(e.target.value))}
                        className="h-8" />
                      <Input type="number" step={0.05} min={0} max={5} value={row[1]} disabled={disabled}
                        onChange={(e) => setStepItem('lead_time_steps', idx, 1, Number(e.target.value))}
                        className="h-8" />
                      <Button variant="ghost" size="sm" onClick={() => removeStep('lead_time_steps', idx)} disabled={disabled}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Auslastungs-Stufen</h4>
                  <Button variant="outline" size="sm" onClick={() => addStep('occupancy_steps')} disabled={disabled}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Zeile
                  </Button>
                </div>
                <div className="space-y-1">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1">
                    <span>&lt; Auslastung (0–1)</span><span>Faktor</span><span></span>
                  </div>
                  {form.occupancy_steps.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                      <Input type="number" step={0.05} min={0} max={1} value={row[0]} disabled={disabled}
                        onChange={(e) => setStepItem('occupancy_steps', idx, 0, Number(e.target.value))}
                        className="h-8" />
                      <Input type="number" step={0.05} min={0} max={5} value={row[1]} disabled={disabled}
                        onChange={(e) => setStepItem('occupancy_steps', idx, 1, Number(e.target.value))}
                        className="h-8" />
                      <Button variant="ghost" size="sm" onClick={() => removeStep('occupancy_steps', idx)} disabled={disabled}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-medium">Event-Faktoren</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Small</Label>
                    <NumInput value={form.event_factor_small} onChange={(v) => patch('event_factor_small', v)} min={0.1} max={5} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Large</Label>
                    <NumInput value={form.event_factor_large} onChange={(v) => patch('event_factor_large', v)} min={0.1} max={5} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Festival</Label>
                    <NumInput value={form.event_factor_festival} onChange={(v) => patch('event_factor_festival', v)} min={0.1} max={5} />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-medium">Lücken-Faktoren</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">1 Tag</Label>
                    <NumInput value={form.gap_factor_1day} onChange={(v) => patch('gap_factor_1day', v)} min={0.1} max={2} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">2 Tage</Label>
                    <NumInput value={form.gap_factor_2days} onChange={(v) => patch('gap_factor_2days', v)} min={0.1} max={2} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">3+ Tage</Label>
                    <NumInput value={form.gap_factor_3plus} onChange={(v) => patch('gap_factor_3plus', v)} min={0.1} max={2} />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-medium">Preisgrenzen (Anteil vom Basispreis)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Floor (Min)</Label>
                    <NumInput value={form.price_floor_ratio} onChange={(v) => patch('price_floor_ratio', v)} min={0.1} max={1} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ceiling (Max)</Label>
                    <NumInput value={form.price_ceiling_ratio} onChange={(v) => patch('price_ceiling_ratio', v)} min={1} max={10} />
                  </div>
                </div>
              </section>
            </TabsContent>
          </Tabs>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default GlobalPricingConfigCard;