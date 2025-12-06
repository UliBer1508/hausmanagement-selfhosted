import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Save, RotateCcw, Euro, Info, Calculator, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLinenAI } from '@/hooks/useLinenAI';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { LinenSetDefinition } from '@/types/linen';

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

  const [localPrices, setLocalPrices] = useState<Record<string, number>>({});

  // Lade Linen Set Definitions für dieses Haus
  const { data: linenDef, isLoading: isLoadingDef } = useQuery({
    queryKey: ['linen-set-definitions', houseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', houseId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  // Extrahiere aktive Items aus custom_categories ODER alten Spalten
  const activeItems = useMemo(() => {
    // Zuerst: Versuche custom_categories zu verwenden
    if (linenDef?.custom_categories && Object.keys(linenDef.custom_categories).length > 0) {
      const items: Record<string, string> = {};
      const categories = linenDef.custom_categories as Record<string, any>;
      
      Object.entries(categories).forEach(([key, config]) => {
        if (config.active) {
          items[key] = config.label;
        }
      });
      return items;
    }
    
    // Fallback: Verwende alte Spalten
    if (linenDef) {
      const items: Record<string, string> = {};
      
      // Mapping von alten Spalten zu Keys und Labels
      const oldColumnMap = {
        bedding_per_guest: { key: 'bedding', label: 'Bettwäsche' },
        large_towels_per_guest: { key: 'large_towels', label: 'Badetücher' },
        small_towels_per_guest: { key: 'small_towels', label: 'Handtücher' },
        sauna_towels_per_guest: { key: 'sauna_towels', label: 'Saunatücher' },
        bath_mats_per_booking: { key: 'bath_mats', label: 'Badematten' },
        sink_towels_per_booking: { key: 'sink_towels', label: 'WB-Handtücher' },
        kitchen_towels_per_booking: { key: 'kitchen_towels', label: 'Küchenhandtücher' }
      };
      
      Object.entries(oldColumnMap).forEach(([oldKey, { key, label }]) => {
        // Nur Items hinzufügen, wenn die alte Spalte existiert und nicht 0 ist
        const value = linenDef[oldKey as keyof typeof linenDef];
        if (typeof value === 'number' && value > 0) {
          items[key] = label;
        }
      });
      
      return items;
    }
    
    return {};
  }, [linenDef]);

  // Lade Einstellungen beim Mount
  useEffect(() => {
    loadAISettings(houseId);
  }, [houseId, loadAISettings]);

  // Update lokale Preise wenn AI Settings geladen werden ODER activeItems sich ändern
  useEffect(() => {
    const newPrices: Record<string, number> = {};
    
    // Für jedes aktive Item
    Object.keys(activeItems).forEach(key => {
      // Nutze existierenden Preis aus aiSettings oder setze 0
      newPrices[key] = aiSettings.prices?.[key] ?? 0;
    });
    
    setLocalPrices(newPrices);
  }, [aiSettings.prices, activeItems]);

  // Prüfe ob Items mit 0 EUR existieren
  const hasZeroPriceItems = useMemo(() => {
    return Object.values(localPrices).some(price => price === 0);
  }, [localPrices]);

  const handlePriceChange = (itemType: string, value: string) => {
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
      // Speichere direkt mit den neuen Preisen als Parameter
      const success = await saveAISettings(houseId, { prices: localPrices as any });
      
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
    // Setze alle Preise auf 0
    const resetPrices: Record<string, number> = {};
    Object.keys(activeItems).forEach(key => {
      resetPrices[key] = 0;
    });
    setLocalPrices(resetPrices);
    
    toast({
      title: "Preise zurückgesetzt",
      description: "Alle Preise wurden auf 0 EUR zurückgesetzt",
    });
  };

  // Beispielkalkulation mit den ersten 6 Items oder allen wenn weniger
  const exampleOrder = useMemo(() => {
    const order: Record<string, number> = {};
    const itemKeys = Object.keys(activeItems).slice(0, 6);
    itemKeys.forEach((key, index) => {
      // Beispiel-Mengen: 10, 15, 8, 5, 6, 4
      order[key] = [10, 15, 8, 5, 6, 4][index] || 5;
    });
    return order;
  }, [activeItems]);

  const calculateExampleCost = () => {
    return Object.entries(exampleOrder).reduce((total, [itemType, quantity]) => {
      const price = localPrices[itemType] || 0;
      return total + (price * quantity);
    }, 0);
  };

  if (isLoadingDef) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Lade Wäsche-Regeln...</div>
      </div>
    );
  }

  if (Object.keys(activeItems).length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Keine aktiven Wäsche-Artikel gefunden. Bitte definieren Sie zuerst Artikel im "Wäsche-Regeln" Tab.
        </AlertDescription>
      </Alert>
    );
  }

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
          {/* Warnung bei 0 EUR Preisen */}
          {hasZeroPriceItems && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Warnung:</strong> Einige Artikel haben einen Preis von 0 EUR. 
                Bitte setzen Sie Preise für alle Artikel, damit die Kostenberechnung korrekt funktioniert.
              </AlertDescription>
            </Alert>
          )}

          {/* Preistabelle */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(activeItems).map(([itemType, label]) => (
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
                      onChange={(e) => handlePriceChange(itemType, e.target.value)}
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
                    const price = localPrices[itemType] || 0;
                    const lineTotal = price * quantity;
                    const label = activeItems[itemType] || itemType;
                    return (
                      <div key={itemType} className="flex justify-between items-center">
                        <span className="text-muted-foreground">
                          {quantity}x {label} @ {price.toFixed(2)}€
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
