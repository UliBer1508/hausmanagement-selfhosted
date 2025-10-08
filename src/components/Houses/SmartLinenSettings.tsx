import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Settings, Brain, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface AISettings {
  lookahead_bookings: number;
  safety_buffer: number;
  max_storage_ratio: number;
  reorder_threshold: number;
  seasonal_factor: boolean;
  prices: {
    bedding: number;
    large_towels: number;
    small_towels: number;
    bath_mats: number;
    sink_towels: number;
    sauna_towels: number;
  };
}

interface SmartLinenSettingsProps {
  houseId: string;
  settings: AISettings;
  onSettingsChange: (settings: AISettings) => void;
  onSave: () => Promise<boolean>;
  onLoad: (houseId: string) => void;
  isSaving?: boolean;
}

const SmartLinenSettings: React.FC<SmartLinenSettingsProps> = ({
  houseId,
  settings,
  onSettingsChange,
  onSave,
  onLoad,
  isSaving = false
}) => {
  const { toast } = useToast();
  
  // Lade Einstellungen beim Komponenten-Mount
  useEffect(() => {
    onLoad(houseId);
  }, [houseId, onLoad]);
  
  // Sichere Default-Preise falls nicht vorhanden
  const safeSettings = {
    ...settings,
    prices: settings.prices || {
      bedding: 30,
      large_towels: 18,
      small_towels: 10,
      bath_mats: 15,
      sink_towels: 8,
      sauna_towels: 20
    }
  };
  
  const [localSettings, setLocalSettings] = useState<AISettings>(safeSettings);

  const handleReset = () => {
    const defaultSettings: AISettings = {
      lookahead_bookings: 3,
      safety_buffer: 1.2,
      max_storage_ratio: 1.5,
      reorder_threshold: 0.8,
      seasonal_factor: false,
      prices: {
        bedding: 30,
        large_towels: 18,
        small_towels: 10,
        bath_mats: 15,
        sink_towels: 8,
        sauna_towels: 20
      }
    };
    setLocalSettings(defaultSettings);
    onSettingsChange(defaultSettings);
    
    toast({
      title: "Einstellungen zurückgesetzt",
      description: "Die KI-Parameter wurden auf Standardwerte zurückgesetzt",
    });
  };

  const handleSave = async () => {
    console.log('💾 Save button clicked in SmartLinenSettings');
    console.log('📋 Current settings:', localSettings);
    
    try {
      console.log('📤 Updating parent settings...');
      onSettingsChange(localSettings);
      
      console.log('⏳ Calling onSave()...');
      const success = await onSave();
      
      console.log('📊 Save result:', success);
      
      if (success) {
        toast({
          title: "✅ Einstellungen gespeichert",
          description: "Die KI-Parameter wurden erfolgreich in der Datenbank gespeichert",
          duration: 5000,
        });
      } else {
        toast({
          title: "❌ Fehler beim Speichern",
          description: "Die Einstellungen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.",
          variant: "destructive",
          duration: 7000,
        });
      }
    } catch (error) {
      console.error('❌ Error in handleSave:', error);
      toast({
        title: "❌ Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive",
        duration: 7000,
      });
    }
  };

  const updateSetting = (key: keyof AISettings, value: number | boolean) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          KI-Optimierungseinstellungen
        </CardTitle>
        <CardDescription>
          Konfigurieren Sie die Parameter für die intelligente Wäschebedarfsberechnung
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Vorhersage-Zeitraum */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Vorhersage-Zeitraum</Label>
          <div className="space-y-2">
            <Label htmlFor="lookahead_bookings" className="text-sm text-muted-foreground">
              Anzahl Buchungen im Voraus: {localSettings.lookahead_bookings}
            </Label>
            <Slider
              id="lookahead_bookings"
              min={1}
              max={5}
              step={1}
              value={[localSettings.lookahead_bookings]}
              onValueChange={(value) => updateSetting('lookahead_bookings', value[0])}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Empfohlen: 3 Buchungen (begrenzte Lagerkapazität)
            </p>
          </div>
        </div>

        <Separator />

        {/* Sicherheitspuffer */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Sicherheitspuffer</Label>
          <div className="space-y-2">
            <Label htmlFor="safety_buffer" className="text-sm text-muted-foreground">
              Pufferfaktor: {localSettings.safety_buffer.toFixed(1)}x
            </Label>
            <Slider
              id="safety_buffer"
              min={1.0}
              max={2.0}
              step={0.1}
              value={[localSettings.safety_buffer]}
              onValueChange={(value) => updateSetting('safety_buffer', value[0])}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Zusätzliche Wäsche über dem berechneten Bedarf
            </p>
          </div>
        </div>

        <Separator />

        {/* Maximale Lagerauslastung */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Lager-Limits</Label>
          <div className="space-y-2">
            <Label htmlFor="max_storage_ratio" className="text-sm text-muted-foreground">
              Max. Lagerauslastung: {localSettings.max_storage_ratio.toFixed(1)}x
            </Label>
            <Slider
              id="max_storage_ratio"
              min={1.0}
              max={3.0}
              step={0.1}
              value={[localSettings.max_storage_ratio]}
              onValueChange={(value) => updateSetting('max_storage_ratio', value[0])}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Faktor der maximalen Gästeanzahl für Lagerbegrenzung
            </p>
          </div>
        </div>

        <Separator />

        {/* Nachbestellschwelle */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Nachbestellung</Label>
          <div className="space-y-2">
            <Label htmlFor="reorder_threshold" className="text-sm text-muted-foreground">
              Nachbestellschwelle: {(localSettings.reorder_threshold * 100).toFixed(0)}%
            </Label>
            <Slider
              id="reorder_threshold"
              min={0.5}
              max={1.0}
              step={0.05}
              value={[localSettings.reorder_threshold]}
              onValueChange={(value) => updateSetting('reorder_threshold', value[0])}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Bei diesem Lagerstand wird nachbestellt
            </p>
          </div>
        </div>

        <Separator />

        {/* Erweiterte Optionen */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Erweiterte Optionen</Label>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="seasonal_factor" className="text-sm">
                Saisonale Anpassungen
              </Label>
              <p className="text-xs text-muted-foreground">
                Berücksichtigung saisonaler Trends (experimentell)
              </p>
            </div>
            <Switch
              id="seasonal_factor"
              checked={localSettings.seasonal_factor}
              onCheckedChange={(checked) => updateSetting('seasonal_factor', checked)}
            />
          </div>
        </div>

        <Separator />

        {/* Aktionen */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={isSaving} className="flex-1">
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Speichern...' : 'Einstellungen speichern'}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Zurücksetzen
          </Button>
        </div>

        {/* Info Box */}
        <div className="bg-muted p-4 rounded-lg">
          <div className="flex items-start gap-2">
            <Settings className="w-4 h-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Optimierungsstrategie</p>
              <p className="text-xs text-muted-foreground mt-1">
                Die KI analysiert die nächsten {localSettings.lookahead_bookings} Buchungen und 
                berechnet den optimalen Lagerbestand unter Berücksichtigung Ihrer Lagerkapazität 
                und eines Sicherheitspuffers von {(localSettings.safety_buffer * 100 - 100).toFixed(0)}%.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartLinenSettings;