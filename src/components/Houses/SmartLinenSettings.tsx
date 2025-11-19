import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Brain, Save, RotateCcw, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useBookingLinenOrders } from "@/hooks/useBookingLinenOrders";
import { useBookings } from "@/hooks/useBookings";
import { format } from "date-fns";
import { de } from "date-fns/locale";

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
  const { config, orderStatus, saveConfig, isSavingConfig } = useBookingLinenOrders(houseId);
  const { data: bookings } = useBookings();
  
  // Get upcoming bookings for this house
  const upcomingBookings = bookings?.filter(b => 
    b.house_id === houseId && 
    b.status === 'confirmed' &&
    new Date(b.check_in) >= new Date()
  ).sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime()) || [];
  
  const [bookingConfig, setBookingConfig] = useState({
    lookahead_bookings: config?.lookahead_bookings || 3,
    warning_days_before: config?.warning_days_before || 7,
  });
  
  // Lade Einstellungen beim Komponenten-Mount
  useEffect(() => {
    onLoad(houseId);
  }, [houseId, onLoad]);
  
  // Sync with config when loaded
  useEffect(() => {
    if (config) {
      setBookingConfig({
        lookahead_bookings: config.lookahead_bookings,
        warning_days_before: config.warning_days_before,
      });
    }
  }, [config]);
  
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
  
  const handleSaveBookingConfig = async () => {
    saveConfig(bookingConfig);
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
        {/* Buchungsbezogene Konfiguration */}
        <div className="space-y-4 p-4 border-2 border-primary/20 rounded-lg bg-primary/5">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <Label className="text-base font-medium">Buchungsbezogene Bestellungen (NEU)</Label>
          </div>
          
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="booking_lookahead" className="text-sm text-muted-foreground">
                Anzahl Buchungen im Voraus: {bookingConfig.lookahead_bookings}
              </Label>
              <Slider
                id="booking_lookahead"
                min={1}
                max={10}
                step={1}
                value={[bookingConfig.lookahead_bookings]}
                onValueChange={(value) => setBookingConfig({ ...bookingConfig, lookahead_bookings: value[0] })}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Legt fest, für wieviele kommende Buchungen automatisch Bestellungen vorgeschlagen werden.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="warning_days" className="text-sm text-muted-foreground">
                Warnung vor Check-in (Tage)
              </Label>
              <Input
                id="warning_days"
                type="number"
                min={1}
                max={30}
                value={bookingConfig.warning_days_before}
                onChange={(e) => setBookingConfig({ ...bookingConfig, warning_days_before: parseInt(e.target.value) || 7 })}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Markiert Bestellungen als DRINGEND wenn Check-in in weniger als X Tagen ist.
              </p>
            </div>

            {/* Preview der berücksichtigten Buchungen */}
            {upcomingBookings.length > 0 && (
              <Alert>
                <AlertDescription>
                  <p className="font-medium mb-2">Berücksichtigte Buchungen:</p>
                  <ul className="space-y-1">
                    {upcomingBookings.slice(0, bookingConfig.lookahead_bookings).map(booking => {
                      const hasOrder = orderStatus?.bookings.find(b => b.booking_id === booking.id)?.linen_order.exists;
                      return (
                        <li key={booking.id} className="flex items-center gap-2 text-sm">
                          {hasOrder ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-orange-600" />
                          )}
                          <span className="flex-1">
                            {booking.guest_name} ({format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de })})
                          </span>
                          {hasOrder ? (
                            <span className="text-xs text-green-600">✓ Bestellt</span>
                          ) : (
                            <span className="text-xs text-orange-600">⚠ Fehlt</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {upcomingBookings.length > bookingConfig.lookahead_bookings && (
                    <p className="text-xs text-muted-foreground mt-2">
                      + {upcomingBookings.length - bookingConfig.lookahead_bookings} weitere Buchung(en) werden nicht berücksichtigt
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Button 
              onClick={handleSaveBookingConfig} 
              disabled={isSavingConfig}
              className="w-full"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSavingConfig ? 'Speichern...' : 'Buchungskonfiguration speichern'}
            </Button>
          </div>
        </div>

        <Separator />
        
        {/* Alte KI-Einstellungen */}
        <div className="space-y-3">
          <Label className="text-base font-medium">KI-Optimierung (Legacy)</Label>
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