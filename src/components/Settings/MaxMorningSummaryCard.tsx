import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Loader2, Save, Sunrise } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useMorningSummarySettings,
  DEFAULT_MORNING_SUMMARY_SETTINGS,
} from '@/hooks/useSystemSettings';

/**
 * Einstellungen für Max' Morgen-Übersicht.
 *
 * - enabled:  Not-Aus für die proaktive Zustellung. Steht er auf AUS,
 *             sendet die Edge Function `morning-summary` NICHTS —
 *             selbst wenn der Cron sie mit deliver=true aufruft.
 * - email_to: Empfänger der täglichen Übersicht.
 * - time:     Wird hier NICHT mehr gesetzt. Die echten Uhrzeiten stehen in
 *             `max_automation_schedule` und werden von der Karte
 *             MaxAutomationScheduleCard.tsx gesteuert (deutsche Zeit).
 *
 * Die Übersicht im Chat (beim Öffnen der App) funktioniert unabhängig
 * von diesem Schalter — er betrifft nur die proaktive E-Mail.
 */
const MaxMorningSummaryCard = () => {
  const { data: settings, isLoading, saveSettings, isSaving } = useMorningSummarySettings();
  const { toast } = useToast();

  const [enabled, setEnabled] = useState(DEFAULT_MORNING_SUMMARY_SETTINGS.enabled);
  const [emailTo, setEmailTo] = useState(DEFAULT_MORNING_SUMMARY_SETTINGS.email_to);
  const [time, setTime] = useState(DEFAULT_MORNING_SUMMARY_SETTINGS.time);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled ?? DEFAULT_MORNING_SUMMARY_SETTINGS.enabled);
      setEmailTo(settings.email_to ?? DEFAULT_MORNING_SUMMARY_SETTINGS.email_to);
      setTime(settings.time ?? DEFAULT_MORNING_SUMMARY_SETTINGS.time);
    }
  }, [settings]);

  const handleSave = async () => {
    if (enabled && !emailTo.trim()) {
      toast({
        title: 'E-Mail-Adresse fehlt',
        description: 'Ohne Empfänger kann die Übersicht nicht gesendet werden.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await saveSettings({
        enabled,
        time,
        channel: 'email',
        email_to: emailTo.trim(),
      });
      toast({
        title: 'Gespeichert',
        description: enabled
          ? `Max sendet die Morgen-Übersicht künftig an ${emailTo.trim()}.`
          : 'Die proaktive Zustellung ist ausgeschaltet.',
      });
    } catch (e) {
      toast({
        title: 'Fehler beim Speichern',
        description: String(e),
        variant: 'destructive',
      });
    }
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
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md bg-amber-100 p-2 dark:bg-amber-900/40">
            <Sunrise className="h-4 w-4 text-amber-700 dark:text-amber-300" />
          </div>
          <div>
            <CardTitle className="text-base">Max: Morgen-Übersicht</CardTitle>
            <CardDescription>
              Max schickt dir jeden Morgen deine Tagesübersicht per E-Mail
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Not-Aus */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5 pr-4">
            <Label className="text-sm font-medium">Tägliche E-Mail aktiv</Label>
            <p className="text-sm text-muted-foreground">
              {enabled
                ? 'Max sendet die Übersicht jeden Morgen (Uhrzeit siehe Karte „Zeiten der Automatik").'
                : 'Max sendet nichts – die Übersicht erscheint nur im Chat, wenn du die App öffnest.'}
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {/* Empfänger */}
        <div className="space-y-2 rounded-lg border p-4">
          <Label htmlFor="morning-email" className="text-sm font-medium">
            Empfänger
          </Label>
          <p className="text-sm text-muted-foreground">
            An diese Adresse geht die tägliche Übersicht.
          </p>
          <Input
            id="morning-email"
            type="email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="deine@email.de"
            className="max-w-md"
          />
        </div>

        {/* Uhrzeit: wird in der Karte „Max: Zeiten der Automatik" gesteuert. */}
        <div className="space-y-1 rounded-lg border border-dashed p-4">
          <Label className="text-sm font-medium">Uhrzeit</Label>
          <p className="text-sm text-muted-foreground">
            Die Uhrzeit stellst du in der Karte <strong>„Max: Zeiten der
            Automatik"</strong> ein (weiter unten) — dort in deutscher Zeit.
          </p>
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Speichern…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Einstellungen speichern
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default MaxMorningSummaryCard;
