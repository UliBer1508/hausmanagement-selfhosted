import React, { useState, useEffect } from 'react';
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

  const [localPrices, setLocalPrices] = useState({
    bedding: 30,
    large_towels: 18,
    small_towels: 10,
    bath_mats: 15,
    sink_towels: 8,
    sauna_towels: 20
  });

  // Lade Einstellungen beim Mount
  useEffect(() => {
    loadAISettings(houseId);
  }, [houseId, loadAISettings]);

  // Update lokale Preise wenn AI Settings geladen werden
  useEffect(() => {
    if (aiSettings.prices) {
      setLocalPrices(aiSettings.prices);
    }
  }, [aiSettings.prices]);

  const linenLabels = {
    bedding: 'Bettwäsche',
    large_towels: 'Große Handtücher',
    small_towels: 'Kleine Handtücher',
    bath_mats: 'Badematten',
    sink_towels: 'WB-Handtücher',
    sauna_towels: 'Saunatücher'
  };

  const handlePriceChange = (itemType: keyof typeof localPrices, value: string) => {
    const numValue = parseFloat(value) || 0;
    setLocalPrices(prev => ({
      ...prev,
      [itemType]: numValue
    }));
  };

  const handleSave = async () => {
    console.log('💾 Speichere Preise für Haus:', houseId);
    console.log('📋 Neue Preise:', localPrices);
    
    try {
      // Update AI Settings mit neuen Preisen
      updateAISettings({ prices: localPrices });
      
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
    const defaultPrices = {
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
  const exampleOrder = {
    bedding: 10,
    large_towels: 15,
    small_towels: 8,
    bath_mats: 5,
    sink_towels: 6,
    sauna_towels: 4
  };

  const calculateExampleCost = () => {
    return Object.entries(exampleOrder).reduce((total, [itemType, quantity]) => {
      const price = localPrices[itemType as keyof typeof localPrices] || 0;
      return total + (price * quantity);
    }, 0);
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
          {/* Preistabelle */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(linenLabels).map(([itemType, label]) => (
                <div key={itemType} className="flex items-center gap-4 p-3 rounded-lg border bg-card">
                  <div className="flex-1">
                    <Label htmlFor={`price_${itemType}`} className="text-sm font-medium">
                      {label}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`price_${itemType}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={localPrices[itemType as keyof typeof localPrices]}
                      onChange={(e) => handlePriceChange(itemType as keyof typeof localPrices, e.target.value)}
                      className="w-24 text-right"
                    />
                    <span className="text-sm text-muted-foreground min-w-[20px]">€</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Beispielkalkulation */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-muted-foreground" />
              <Label className="text-base font-medium">Beispielkalkulation</Label>
            </div>
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <div className="space-y-2 text-sm">
                  {Object.entries(exampleOrder).map(([itemType, quantity]) => {
                    const price = localPrices[itemType as keyof typeof localPrices];
                    const lineTotal = price * quantity;
                    return (
                      <div key={itemType} className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          {quantity}x {linenLabels[itemType as keyof typeof linenLabels]} @ {price.toFixed(2)}€
                        </span>
                        <span className="font-medium">{lineTotal.toFixed(2)}€</span>
                      </div>
                    );
                  })}
                  <Separator className="my-3" />
                  <div className="flex justify-between items-center text-base font-bold">
                    <span>Gesamtkosten</span>
                    <span className="text-primary">{calculateExampleCost().toFixed(2)}€</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Info Box */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Verwendung:</strong> Diese Preise werden automatisch in KI-generierten 
              Bestellvorschlägen verwendet, um die geschätzten Kosten zu berechnen. Sie dienen 
              zur Budgetplanung und Kostenoptimierung.
            </AlertDescription>
          </Alert>

          <Separator />

          {/* Aktionen */}
          <div className="flex gap-2">
            <Button 
              onClick={handleSave} 
              disabled={isSavingSettings}
              className="flex-1"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSavingSettings ? 'Speichern...' : 'Preise speichern'}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleReset}
              disabled={isSavingSettings}
            >
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
