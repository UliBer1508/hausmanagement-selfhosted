import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Globe, TrendingUp, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface MLSettings {
  // Grundeinstellungen
  minRentableNights: number;
  analysisPeriodMonths: number;
  preferredCheckInDay: number; // 0=So, 6=Sa
  
  // Feiertags-Einstellungen
  holidaysEnabled: boolean;
  relevantCountries: string[];
  
  // Analyse-Prioritäten
  showHistoricalReference: boolean;
  prioritizeShortGaps: boolean;
}

export const DEFAULT_ML_SETTINGS: MLSettings = {
  minRentableNights: 4,
  analysisPeriodMonths: 6,
  preferredCheckInDay: 6, // Samstag
  holidaysEnabled: true,
  relevantCountries: ['DE', 'NL', 'BE', 'AT'],
  showHistoricalReference: true,
  prioritizeShortGaps: true,
};

const STORAGE_KEY = 'ml-settings-v1';

const WEEKDAYS = [
  { value: 0, label: 'Sonntag' },
  { value: 1, label: 'Montag' },
  { value: 2, label: 'Dienstag' },
  { value: 3, label: 'Mittwoch' },
  { value: 4, label: 'Donnerstag' },
  { value: 5, label: 'Freitag' },
  { value: 6, label: 'Samstag' },
];

const COUNTRIES = [
  { code: 'DE', name: 'Deutschland', flag: '🇩🇪' },
  { code: 'NL', name: 'Niederlande', flag: '🇳🇱' },
  { code: 'BE', name: 'Belgien', flag: '🇧🇪' },
  { code: 'AT', name: 'Österreich', flag: '🇦🇹' },
];

interface MLSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: MLSettings;
  onSettingsChange: (settings: MLSettings) => void;
}

export const MLSettingsDialog = ({ open, onOpenChange, settings, onSettingsChange }: MLSettingsDialogProps) => {
  const [localSettings, setLocalSettings] = useState<MLSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
    onSettingsChange(localSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localSettings));
    onOpenChange(false);
  };

  const handleReset = () => {
    setLocalSettings(DEFAULT_ML_SETTINGS);
  };

  const toggleCountry = (countryCode: string) => {
    setLocalSettings(prev => ({
      ...prev,
      relevantCountries: prev.relevantCountries.includes(countryCode)
        ? prev.relevantCountries.filter(c => c !== countryCode)
        : [...prev.relevantCountries, countryCode]
    }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            ML-Analyse Einstellungen
          </SheetTitle>
          <SheetDescription>
            Passen Sie die Parameter für die Machine Learning-basierte Auslastungsanalyse an
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Grundeinstellungen */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="h-4 w-4" />
              Grundeinstellungen
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="minNights">Mindestaufenthalt (Nächte)</Label>
              <Input
                id="minNights"
                type="number"
                min="1"
                max="14"
                value={localSettings.minRentableNights}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, minRentableNights: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                Lücken unter dieser Anzahl werden als "nicht vermietbar" markiert
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="analysisPeriod">Analyse-Zeitraum (Monate)</Label>
              <Input
                id="analysisPeriod"
                type="number"
                min="3"
                max="12"
                value={localSettings.analysisPeriodMonths}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, analysisPeriodMonths: parseInt(e.target.value) }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="checkInDay">Bevorzugter Check-in Tag</Label>
              <Select
                value={localSettings.preferredCheckInDay.toString()}
                onValueChange={(value) => setLocalSettings(prev => ({ ...prev, preferredCheckInDay: parseInt(value) }))}
              >
                <SelectTrigger id="checkInDay">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map(day => (
                    <SelectItem key={day.value} value={day.value.toString()}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Feiertags-Konfiguration */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Globe className="h-4 w-4" />
              Feiertags-Konfiguration
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="holidays"
                checked={localSettings.holidaysEnabled}
                onCheckedChange={(checked) => setLocalSettings(prev => ({ ...prev, holidaysEnabled: checked as boolean }))}
              />
              <label htmlFor="holidays" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Feiertage und Schulferien berücksichtigen
              </label>
            </div>

            {localSettings.holidaysEnabled && (
              <div className="pl-6 space-y-3">
                <Label className="text-sm">Relevante Länder:</Label>
                <div className="grid grid-cols-2 gap-3">
                  {COUNTRIES.map(country => (
                    <div key={country.code} className="flex items-center space-x-2">
                      <Checkbox
                        id={country.code}
                        checked={localSettings.relevantCountries.includes(country.code)}
                        onCheckedChange={() => toggleCountry(country.code)}
                      />
                      <label htmlFor={country.code} className="text-sm leading-none cursor-pointer">
                        {country.flag} {country.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Info Alert - Datenbasierte Analyse */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Datenbasierte Analyse:</strong> Alle Preisempfehlungen basieren jetzt auf deinen historischen Buchungsdaten - den tatsächlich realisierten Preisen in jedem Monat. Theoretische Boost-Faktoren wurden entfernt.
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleReset} className="flex-1">
            Zurücksetzen
          </Button>
          <Button onClick={handleSave} className="flex-1">
            Speichern
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// Helper function to load settings from localStorage
export const loadMLSettings = (): MLSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_ML_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('Failed to load ML settings:', error);
  }
  return DEFAULT_ML_SETTINGS;
};
