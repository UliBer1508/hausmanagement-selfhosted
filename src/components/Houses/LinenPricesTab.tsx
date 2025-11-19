import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Save, RotateCcw, Euro, Info, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLinenAI } from '@/hooks/useLinenAI';

interface LinenPricesTabProps {
  houseId: string;
}

const LinenPricesTab: React.FC<LinenPricesTabProps> = ({ houseId }) => {
  const { toast } = useToast();
  const { 
    aiSettings, 
    updateAISettings, 
    saveAISettings, 
    loadAISettings,
    isSavingSettings 
  } = useLinenAI();

  // Lade Wäschestück-Definitionen
  const { data: linenDef } = useQuery({
    queryKey: ['linen-definitions', houseId],
    queryFn: async () => {
      const { data } = await supabase
        .from('linen_set_definitions')
        .select('custom_categories')
        .eq('house_id', houseId)
        .maybeSingle();
      return data;
    }
  });

  const [localPrices, setLocalPrices] = useState<Record<string, number>>({});

  // Lade Einstellungen beim Mount
  useEffect(() => {
    loadAISettings(houseId);
  }, [houseId, loadAISettings]);

  // Synchronisiere Preise mit custom_categories
  useEffect(() => {
    if (linenDef?.custom_categories) {
      const pricesFromSettings = aiSettings.prices || {};
      const syncedPrices: Record<string, number> = {};
      
      // Für jedes Item in custom_categories: Preis übernehmen oder 0 setzen
      Object.keys(linenDef.custom_categories).forEach(key => {
        syncedPrices[key] = pricesFromSettings[key] || 0;
      });
      
      setLocalPrices(syncedPrices);
    }
  }, [linenDef, aiSettings.prices]);

  const handlePriceChange = (itemKey: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setLocalPrices(prev => ({
      ...prev,
      [itemKey]: numValue
    }));
  };

  const handleSave = async () => {
    console.log('💾 Speichere Preise für Haus:', houseId);
    console.log('📋 Neue Preise:', localPrices);
    
    try {
      // Für alle Keys in custom_categories: Wenn Preis fehlt, setze 0
      const allKeys = Object.keys(linenDef?.custom_categories || {});
      const updatedPrices = { ...localPrices };
      
      allKeys.forEach(key => {
        if (!(key in updatedPrices)) {
          updatedPrices[key] = 0; // Default-Preis für neue Items
        }
      });
      
      // Update AI Settings mit neuen Preisen
      updateAISettings({ prices: updatedPrices });
      
      // Speichere in Datenbank
      const success = await saveAISettings(houseId);
      
      if (success) {
        toast({
          title: "✅ Preise gespeichert",
          description: "Die Wäschepreise wurden erfolgreich aktualisiert",
        });
      } else {
        toast({
          title: "❌ Fehler beim Speichern",
          description: "Die Preise konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('❌ Fehler beim Speichern der Preise:', error);
      toast({
        title: "❌ Fehler",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    const defaultPrices: Record<string, number> = {
      bedding: 30,
      large_towels: 18,
      small_towels: 10,
      bath_mats: 15,
      sink_towels: 8,
      sauna_towels: 20
    };
    setLocalPrices(defaultPrices);
    
    toast({
      title: "Preise zurückgesetzt",
      description: "Die Preise wurden auf Standardwerte zurückgesetzt",
    });
  };

  // Beispielkalkulation
  const exampleCalculation = () => {
    const total = Object.entries(localPrices).reduce((sum, [key, price]) => {
      return sum + price;
    }, 0);
    return total;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Euro className="w-5 h-5 text-primary" />
            Wäschepreise
          </CardTitle>
          <CardDescription>
            Konfigurieren Sie die Preise pro Artikel für die Kostenberechnung bei Bestellungen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.keys(localPrices).length === 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Bitte erstellen Sie zuerst Wäschestücke im Tab "Wäsche-Regeln", 
                bevor Sie hier Preise festlegen können.
              </AlertDescription>
            </Alert>
          )}

          {Object.keys(localPrices).some(key => localPrices[key] === 0) && (
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Warnung:</strong> Einige Wäschestücke haben keinen Preis (0 EUR). 
                Kostenberechnungen sind dadurch ungenau.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            {Object.entries(linenDef?.custom_categories || {})
              .sort(([, a], [, b]) => (a as any).category.localeCompare((b as any).category))
              .map(([key, config]: [string, any]) => (
                <div key={key} className="flex items-center gap-4 p-3 rounded-lg border bg-card">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-lg">{config.icon}</span>
                    <Label htmlFor={`price_${key}`} className="text-sm font-medium">
                      {config.label}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      ({config.category})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`price_${key}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={localPrices[key] || 0}
                      onChange={(e) => handlePriceChange(key, e.target.value)}
                      className="w-24 text-right"
                    />
                    <span className="text-sm text-muted-foreground min-w-[20px]">€</span>
                  </div>
                </div>
            ))}
          </div>

          <Separator />

          <Alert>
            <Calculator className="h-4 w-4" />
            <AlertDescription>
              <strong>Gesamtpreis aller Artikel:</strong> {exampleCalculation().toFixed(2)} EUR
            </AlertDescription>
          </Alert>

          <Separator />

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Verwendung:</strong> Diese Preise werden automatisch in KI-generierten 
              Bestellvorschlägen verwendet, um die geschätzten Kosten zu berechnen. Sie dienen 
              zur Budgetplanung und Kostenoptimierung.
            </AlertDescription>
          </Alert>

          <Separator />

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isSavingSettings} className="flex-1">
              <Save className="w-4 h-4 mr-2" />
              {isSavingSettings ? 'Speichern...' : 'Preise speichern'}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={isSavingSettings}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Zurücksetzen
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LinenPricesTab;
