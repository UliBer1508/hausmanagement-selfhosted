import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Settings } from 'lucide-react';
import { useCleaningAutomationSettings } from '@/hooks/useCleaningAutomationSettings';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';

const AutoCleaningSettingsCard = () => {
  const { settings, isLoading, updateSettings, isUpdating } = useCleaningAutomationSettings();
  
  const [localProviderId, setLocalProviderId] = useState<string>('');
  const [localScheduleTiming, setLocalScheduleTiming] = useState<'on_checkin' | 'on_checkout'>('on_checkin');
  const [localTime, setLocalTime] = useState<string>('10:00');
  const [localIsEnabled, setLocalIsEnabled] = useState<boolean>(true);
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings into local state when available
  useEffect(() => {
    if (settings) {
      setLocalProviderId(settings.default_provider_id || '');
      setLocalScheduleTiming(settings.schedule_timing);
      setLocalTime(settings.default_time.substring(0, 5)); // Trim seconds (10:00:00 -> 10:00)
      setLocalIsEnabled(settings.is_enabled);
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
      is_enabled: localIsEnabled,
    });
    setHasChanges(false);
  };

  const handleChange = () => {
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-2 lg:space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Automatisierung
          </CardTitle>
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
      <CardHeader className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Settings className="h-5 w-5 shrink-0" />
          Automatisierung
        </CardTitle>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center gap-2 min-w-0">
            <Switch
              checked={localIsEnabled}
              onCheckedChange={(checked) => {
                setLocalIsEnabled(checked);
                handleChange();
              }}
              disabled={isLoading}
            />
            <Label className="text-sm font-medium cursor-pointer">
              Automatisierung aktivieren
            </Label>
          </div>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isUpdating}
            size="sm"
            className="gap-2 ml-auto"
          >
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Speichere...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">Einstellungen speichern</span>
                <span className="sm:hidden">Speichern</span>
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
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
              disabled={!localIsEnabled}
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
              onValueChange={(value: 'on_checkin' | 'on_checkout') => {
                setLocalScheduleTiming(value);
                handleChange();
              }}
              disabled={!localIsEnabled}
            >
              <SelectTrigger id="schedule-timing" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="on_checkin">Am Check-in-Tag</SelectItem>
                <SelectItem value="on_checkout">Am Check-out-Tag</SelectItem>
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
              disabled={!localIsEnabled}
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
      </CardContent>
    </Card>
  );
};

export default AutoCleaningSettingsCard;
