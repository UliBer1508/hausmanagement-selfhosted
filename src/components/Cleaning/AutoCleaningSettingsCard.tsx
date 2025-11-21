import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Settings } from 'lucide-react';
import { useCleaningAutomationSettings } from '@/hooks/useCleaningAutomationSettings';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';

const AutoCleaningSettingsCard = () => {
  const { settings, isLoading, updateSettings, isUpdating } = useCleaningAutomationSettings();
  
  const [localProviderId, setLocalProviderId] = useState<string>('');
  const [localScheduleTiming, setLocalScheduleTiming] = useState<'day_before' | 'on_checkin' | 'day_after'>('on_checkin');
  const [localTime, setLocalTime] = useState<string>('10:00');
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings into local state when available
  useEffect(() => {
    if (settings) {
      setLocalProviderId(settings.default_provider_id || '');
      setLocalScheduleTiming(settings.schedule_timing);
      setLocalTime(settings.default_time);
      setHasChanges(false);
    }
  }, [settings]);

  // Fetch service providers for dropdown
  const { data: providers } = useQuery({
    queryKey: ['service-providers-cleaning'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_providers')
        .select('*')
        .eq('service_type', 'cleaning')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const handleSave = () => {
    updateSettings({
      default_provider_id: localProviderId || null,
      schedule_timing: localScheduleTiming,
      default_time: localTime,
    });
    setHasChanges(false);
  };

  const handleChange = () => {
    setHasChanges(true);
  };

  const getScheduleTimingLabel = (timing: string) => {
    switch (timing) {
      case 'day_before':
        return 'Tag vor Check-in';
      case 'on_checkin':
        return 'Am Check-in-Tag';
      case 'day_after':
        return 'Tag nach Check-out';
      default:
        return timing;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Automatisierung
          </CardTitle>
          <CardDescription>
            Globale Einstellungen für automatische Reinigungsaufträge
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Automatisierung
        </CardTitle>
        <CardDescription>
          Globale Einstellungen für automatische Reinigungsaufträge
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Standard Provider */}
          <div className="space-y-2">
            <Label htmlFor="default-provider">Standard-Dienstleister</Label>
            <Select
              value={localProviderId}
              onValueChange={(value) => {
                setLocalProviderId(value);
                handleChange();
              }}
            >
              <SelectTrigger id="default-provider" className="bg-background">
                <SelectValue placeholder="Dienstleister auswählen" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {providers?.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule Timing */}
          <div className="space-y-2">
            <Label htmlFor="schedule-timing">Zeitpunkt der Reinigung</Label>
            <Select
              value={localScheduleTiming}
              onValueChange={(value: 'day_before' | 'on_checkin' | 'day_after') => {
                setLocalScheduleTiming(value);
                handleChange();
              }}
            >
              <SelectTrigger id="schedule-timing" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="day_before">Tag vor Check-in</SelectItem>
                <SelectItem value="on_checkin">Am Check-in-Tag</SelectItem>
                <SelectItem value="day_after">Tag nach Check-out</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Default Time */}
          <div className="space-y-2">
            <Label htmlFor="default-time">Uhrzeit</Label>
            <Select
              value={localTime}
              onValueChange={(value) => {
                setLocalTime(value);
                handleChange();
              }}
            >
              <SelectTrigger id="default-time" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {Array.from({ length: 24 }, (_, i) => {
                  const hour = i.toString().padStart(2, '0');
                  return [
                    <SelectItem key={`${hour}:00`} value={`${hour}:00`}>{`${hour}:00`}</SelectItem>,
                    <SelectItem key={`${hour}:30`} value={`${hour}:30`}>{`${hour}:30`}</SelectItem>
                  ];
                }).flat()}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isUpdating}
            className="gap-2"
          >
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Speichere...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Einstellungen speichern
              </>
            )}
          </Button>
        </div>

        {/* Info about dynamic calculation */}
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
          <p className="font-medium mb-1">Hinweis:</p>
          <p>
            Die Reinigungsstunden und -kosten werden automatisch basierend auf den 
            <span className="font-medium"> Standard-Reinigungsstunden</span> des gebuchten Hauses und dem 
            <span className="font-medium"> Stundensatz</span> des ausgewählten Dienstleisters berechnet.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AutoCleaningSettingsCard;
