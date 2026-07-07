import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Bot, ChevronDown, Minus, Plus } from 'lucide-react';
import { useCleaningAutomationSettings } from '@/hooks/useCleaningAutomationSettings';
import { useState, useEffect } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * Einstellungen für die automatischen Terminfragen des KI-Assistenten Max.
 * - max_reminder_enabled: An/Aus-Schalter (Not-Aus, falls Amela es zu viel wird)
 * - max_reminder_days_before: wie viele Tage vor der Reinigung Max fragt
 */
const MaxReminderSettingsCard = () => {
  const { settings, isLoading, updateSettings, isUpdating } = useCleaningAutomationSettings();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(true);
  useEffect(() => { setOpen(!isMobile); }, [isMobile]);

  const [localEnabled, setLocalEnabled] = useState<boolean>(false);
  const [localDaysBefore, setLocalDaysBefore] = useState<number>(3);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (settings) {
      setLocalEnabled(settings.max_reminder_enabled ?? false);
      setLocalDaysBefore(settings.max_reminder_days_before ?? 3);
      setHasChanges(false);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings({
      max_reminder_enabled: localEnabled,
      max_reminder_days_before: localDaysBefore,
    });
    setHasChanges(false);
  };

  const changeDays = (delta: number) => {
    setLocalDaysBefore((prev) => {
      const next = Math.min(30, Math.max(1, prev + delta));
      return next;
    });
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2 text-left">
              <Bot className="h-5 w-5 text-purple-600" />
              <div>
                <CardTitle className="text-base">Max: Automatische Terminfragen</CardTitle>
                <CardDescription className="text-sm">
                  Max fragt Amela/Teuni automatisch, ob anstehende Reinigungstermine passen
                </CardDescription>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* An/Aus-Schalter (Not-Aus) */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Automatische Fragen aktiv</Label>
                <p className="text-sm text-muted-foreground">
                  {localEnabled
                    ? 'Max fragt selbstständig nach anstehenden Terminen.'
                    : 'Max ist still – es werden keine automatischen Fragen gesendet.'}
                </p>
              </div>
              <Switch
                checked={localEnabled}
                onCheckedChange={(v) => { setLocalEnabled(v); setHasChanges(true); }}
              />
            </div>

            {/* Vorlaufzeit */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="space-y-0.5">
                <Label className="text-base">Vorlaufzeit</Label>
                <p className="text-sm text-muted-foreground">
                  Wie viele Tage vor der Reinigung soll Max fragen? Bespreche den Wert mit Amela.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => changeDays(-1)}
                  disabled={localDaysBefore <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <div className="min-w-[4rem] text-center">
                  <span className="text-2xl font-semibold">{localDaysBefore}</span>
                  <span className="text-sm text-muted-foreground ml-1">
                    {localDaysBefore === 1 ? 'Tag' : 'Tage'}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => changeDays(1)}
                  disabled={localDaysBefore >= 30}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button onClick={handleSave} disabled={!hasChanges || isUpdating} className="w-full">
              {isUpdating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Speichern…</>
              ) : (
                <><Save className="h-4 w-4 mr-2" /> Einstellungen speichern</>
              )}
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default MaxReminderSettingsCard;
