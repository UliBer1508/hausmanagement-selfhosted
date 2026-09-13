import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Percent, Save } from 'lucide-react';
import { usePlatformMarkups } from '@/hooks/useSystemSettings';
import {
  DEFAULT_PLATFORM_MARKUPS,
  MARKUP_PLATFORM_LABELS,
  withMarkupDefaults,
  type PlatformMarkupSettings,
} from '@/lib/platformMarkup';
import { useToast } from '@/hooks/use-toast';

// Einstellungen für den Plattform-Aufschlag. Hintergrund und Rechenweg:
// src/lib/platformMarkup.ts. Die Sätze wirken auf die Preisempfehlung in der
// Lückenanalyse (Gäste-Tab) und auf die KI-Analyse (analyze-vacancy).
export default function PlatformMarkupSettingsCard() {
  const { toast } = useToast();
  const { data: settings, saveSettings, isSaving } = usePlatformMarkups();

  const [local, setLocal] = useState<PlatformMarkupSettings>(DEFAULT_PLATFORM_MARKUPS);

  useEffect(() => {
    if (settings) setLocal(withMarkupDefaults(settings));
  }, [settings]);

  const setPlatform = (key: string, raw: string) => {
    const v = raw === '' ? 0 : parseFloat(raw);
    setLocal((prev) => ({
      ...prev,
      by_platform: { ...prev.by_platform, [key]: Number.isFinite(v) ? v : 0 },
    }));
  };

  const handleSave = async () => {
    try {
      await saveSettings(local);
      toast({
        title: 'Aufschlag-Sätze gespeichert',
        description: 'Die Preisempfehlungen rechnen ab jetzt mit den neuen Sätzen.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fehler beim Speichern',
        description: error.message || 'Einstellungen konnten nicht gespeichert werden.',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="w-5 h-5 text-primary" />
          Plattform-Aufschlag (Auszahlung → Verkaufspreis)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            In einer Buchung wird der Betrag gespeichert, den du vom Portal
            <strong> ausgezahlt </strong> bekommst. Der Gast zahlt mehr — das Portal
            schlägt seine Provision oben drauf. Damit die Preisempfehlung einen
            Betrag nennt, den du so im Portal <strong>eintragen</strong> kannst, wird
            die Auszahlung mit diesen Sätzen hochgerechnet.
          </p>
          <p>
            Belvilla gibt selbst +30 % an. Booking.com und Airbnb kannst du aus deiner
            Abrechnung exakt ablesen — je genauer die Werte, desto belastbarer die
            Empfehlung.
          </p>
        </div>

        <div className="space-y-3 pt-2 border-t">
          {MARKUP_PLATFORM_LABELS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <Label className="flex-1">{label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={200}
                  step={1}
                  className="w-24 text-right"
                  value={local.by_platform[key] ?? 0}
                  onChange={(e) => setPlatform(key, e.target.value)}
                />
                <span className="text-sm text-muted-foreground w-4">%</span>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-4 pt-3 border-t">
            <div className="flex-1">
              <Label>Sonstige / unbekannte Plattform</Label>
              <p className="text-xs text-muted-foreground">
                Gilt für Buchungen ohne hinterlegte Plattform
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={200}
                step={1}
                className="w-24 text-right"
                value={local.default_percent}
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
                  setLocal((prev) => ({
                    ...prev,
                    default_percent: Number.isFinite(v) ? v : 0,
                  }));
                }}
              />
              <span className="text-sm text-muted-foreground w-4">%</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Beispiel:</strong> Auszahlung 180 €/Nacht
          bei {local.by_platform['airbnb'] ?? local.default_percent} % Aufschlag ={' '}
          <strong className="text-foreground">
            {Math.round(180 * (1 + (local.by_platform['airbnb'] ?? local.default_percent) / 100))} €
          </strong>{' '}
          Verkaufspreis, den du im Portal einträgst.
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Speichert…' : 'Speichern'}
        </Button>
      </CardContent>
    </Card>
  );
}
