import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Save } from 'lucide-react';
import { useRatingReminderSettings, DEFAULT_RATING_REMINDER_SETTINGS, RatingReminderSettings } from '@/hooks/useSystemSettings';
import { useToast } from '@/hooks/use-toast';

export default function RatingReminderSettingsCard() {
  const { toast } = useToast();
  const { data: settings, saveSettings, isSaving } = useRatingReminderSettings();
  
  const [localSettings, setLocalSettings] = useState<RatingReminderSettings>(DEFAULT_RATING_REMINDER_SETTINGS);

  useEffect(() => {
    if (settings) {
      setLocalSettings({ ...DEFAULT_RATING_REMINDER_SETTINGS, ...settings });
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await saveSettings(localSettings);
      toast({
        title: "Einstellungen gespeichert",
        description: "Die Bewertungs-Erinnerungs-Einstellungen wurden aktualisiert.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Fehler beim Speichern",
        description: error.message || "Einstellungen konnten nicht gespeichert werden.",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="w-5 h-5 text-primary" />
          Bewertungs-Erinnerungen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Erinnerungen aktiviert</Label>
            <p className="text-sm text-muted-foreground">
              Banner im Dashboard anzeigen
            </p>
          </div>
          <Switch
            checked={localSettings.is_enabled}
            onCheckedChange={(checked) => 
              setLocalSettings(prev => ({ ...prev, is_enabled: checked }))
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="minDays">Min. Tage nach Check-out</Label>
            <Input
              id="minDays"
              type="number"
              min={1}
              max={365}
              value={localSettings.min_days_after_checkout}
              onChange={(e) => 
                setLocalSettings(prev => ({ 
                  ...prev, 
                  min_days_after_checkout: parseInt(e.target.value) || 14 
                }))
              }
            />
          </div>
          <div>
            <Label htmlFor="maxDays">Max. Tage nach Check-out</Label>
            <Input
              id="maxDays"
              type="number"
              min={1}
              max={365}
              value={localSettings.max_days_after_checkout}
              onChange={(e) => 
                setLocalSettings(prev => ({ 
                  ...prev, 
                  max_days_after_checkout: parseInt(e.target.value) || 90 
                }))
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Nur mit Plattform</Label>
            <p className="text-sm text-muted-foreground">
              Nur Buchungen mit Airbnb, Booking.com etc.
            </p>
          </div>
          <Switch
            checked={localSettings.require_platform}
            onCheckedChange={(checked) => 
              setLocalSettings(prev => ({ ...prev, require_platform: checked }))
            }
          />
        </div>

        <div>
          <Label>Vermietungstyp</Label>
          <Select
            value={localSettings.rental_type_filter}
            onValueChange={(value: 'tourist' | 'tenant' | 'all') => 
              setLocalSettings(prev => ({ ...prev, rental_type_filter: value }))
            }
          >
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Typ auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tourist">🏖️ Nur Ferienwohnungen</SelectItem>
              <SelectItem value="tenant">🏠 Nur Mietwohnungen</SelectItem>
              <SelectItem value="all">📊 Alle</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button 
          className="w-full" 
          onClick={handleSave}
          disabled={isSaving}
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Speichern...' : 'Einstellungen speichern'}
        </Button>

        <p className="text-xs text-muted-foreground">
          Buchungen werden {localSettings.min_days_after_checkout}-{localSettings.max_days_after_checkout} Tage 
          nach Check-out als ausstehend markiert, wenn keine externe Bewertung vorliegt.
        </p>
      </CardContent>
    </Card>
  );
}
