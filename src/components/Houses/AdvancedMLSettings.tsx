import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Brain, TrendingUp, Calendar, Users, Cloud, Save } from "lucide-react";
import { toast } from "sonner";

interface AdvancedMLSettingsProps {
  houseId: string;
  currentSettings: any;
  onSave: (settings: any) => Promise<boolean>;
}

export const AdvancedMLSettings: React.FC<AdvancedMLSettingsProps> = ({
  houseId,
  currentSettings,
  onSave
}) => {
  const [settings, setSettings] = useState({
    learning_rate: currentSettings?.learning_rate || 0.01,
    seasonal_factor: currentSettings?.seasonal_factor || false,
    booking_pattern_influence: currentSettings?.booking_pattern_influence || 1.0,
    weather_impact_factor: currentSettings?.weather_impact_factor || 1.0,
    guest_type_multipliers: currentSettings?.guest_type_multipliers || {},
    seasonal_weights: currentSettings?.seasonal_weights || {}
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSettings({
      learning_rate: currentSettings?.learning_rate || 0.01,
      seasonal_factor: currentSettings?.seasonal_factor || false,
      booking_pattern_influence: currentSettings?.booking_pattern_influence || 1.0,
      weather_impact_factor: currentSettings?.weather_impact_factor || 1.0,
      guest_type_multipliers: currentSettings?.guest_type_multipliers || {},
      seasonal_weights: currentSettings?.seasonal_weights || {}
    });
  }, [currentSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const success = await onSave(settings);
      if (success) {
        toast.success("ML-Einstellungen erfolgreich gespeichert");
      } else {
        toast.error("Fehler beim Speichern");
      }
    } catch (error) {
      toast.error("Fehler beim Speichern der Einstellungen");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Machine Learning Parameter
          </CardTitle>
          <CardDescription>
            Erweiterte KI-Einstellungen für adaptive Lernfunktionen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Learning Rate */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Lernrate
              </Label>
              <span className="text-sm font-medium">{settings.learning_rate.toFixed(3)}</span>
            </div>
            <Slider
              value={[settings.learning_rate]}
              onValueChange={([value]) => setSettings({...settings, learning_rate: value})}
              min={0.001}
              max={0.1}
              step={0.001}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Wie schnell sich das Modell an neue Daten anpasst (0.001 = langsam, 0.1 = schnell)
            </p>
          </div>

          {/* Seasonal Factor */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Saisonale Faktoren aktivieren
              </Label>
              <p className="text-xs text-muted-foreground">
                Berücksichtigt saisonale Schwankungen im Wäschebedarf
              </p>
            </div>
            <Switch
              checked={settings.seasonal_factor}
              onCheckedChange={(checked) => setSettings({...settings, seasonal_factor: checked})}
            />
          </div>

          {/* Booking Pattern Influence */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Buchungsmuster-Einfluss
              </Label>
              <span className="text-sm font-medium">{settings.booking_pattern_influence.toFixed(1)}x</span>
            </div>
            <Slider
              value={[settings.booking_pattern_influence]}
              onValueChange={([value]) => setSettings({...settings, booking_pattern_influence: value})}
              min={0}
              max={2}
              step={0.1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Gewichtung des Einflusses von Buchungsmustern auf die Prognose
            </p>
          </div>

          {/* Weather Impact Factor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Cloud className="h-4 w-4" />
                Wetter-Einfluss-Faktor
              </Label>
              <span className="text-sm font-medium">{settings.weather_impact_factor.toFixed(1)}x</span>
            </div>
            <Slider
              value={[settings.weather_impact_factor]}
              onValueChange={([value]) => setSettings({...settings, weather_impact_factor: value})}
              min={0}
              max={2}
              step={0.1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Gewichtung des Wetters auf den Wäschebedarf (z.B. mehr Handtücher bei Regen)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Guest Type Multipliers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gästetyp-Multiplikatoren
          </CardTitle>
          <CardDescription>
            Anpassungen basierend auf Gästeverhalten und Nationalität
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Diese Werte werden automatisch aus historischen Daten gelernt. 
            Manuelle Anpassungen werden in zukünftigen Updates verfügbar sein.
          </p>
          <div className="mt-4 grid gap-2">
            {Object.entries(settings.guest_type_multipliers || {}).map(([type, multiplier]) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span className="capitalize">{type}</span>
                <span className="font-mono">{Number(multiplier).toFixed(2)}x</span>
              </div>
            ))}
            {Object.keys(settings.guest_type_multipliers || {}).length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                Noch keine Gästetyp-Daten vorhanden. Daten werden mit zukünftigen Buchungen gesammelt.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Seasonal Weights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Saisonale Gewichtungen
          </CardTitle>
          <CardDescription>
            Monatsspezifische Anpassungsfaktoren
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Diese Werte werden aus historischen Verbrauchsdaten pro Monat berechnet.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {Object.entries(settings.seasonal_weights || {}).map(([month, weight]) => (
              <div key={month} className="text-sm">
                <span className="font-medium">{month}:</span> {Number(weight).toFixed(2)}x
              </div>
            ))}
            {Object.keys(settings.seasonal_weights || {}).length === 0 && (
              <p className="text-sm text-muted-foreground italic col-span-3">
                Noch keine saisonalen Daten vorhanden. Aktivieren Sie "Saisonale Faktoren" und sammeln Sie Daten über mehrere Monate.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Speichern..." : "Einstellungen speichern"}
        </Button>
      </div>
    </div>
  );
};
