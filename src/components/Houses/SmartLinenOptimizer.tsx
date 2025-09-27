import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Brain, 
  TrendingUp, 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Target,
  BarChart3,
  ShoppingCart,
  Zap
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface LinenItem {
  bedding: number;
  large_towels: number;
  small_towels: number;
  bath_mats: number;
  sink_towels: number;
  sauna_towels: number;
}

interface OptimizationResult {
  current_stock: LinenItem;
  upcoming_demand: LinenItem;
  recommended_stock: LinenItem;
  order_suggestion: {
    items: Record<string, any>;
    total_items: number;
    has_urgent_items: boolean;
    estimated_cost: number;
    order_priority: string;
  };
  ai_insights: string[];
  confidence_score: number;
  storage_utilization: number;
}

interface SmartLinenOptimizerProps {
  houseId: string;
  houseName: string;
  aiSettings: any;
  onOptimizationStart?: () => void;
}

const SmartLinenOptimizer: React.FC<SmartLinenOptimizerProps> = ({
  houseId,
  houseName,
  aiSettings,
  onOptimizationStart
}) => {
  const { toast } = useToast();
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const linenLabels: Record<keyof LinenItem, string> = {
    bedding: 'Bettwäsche',
    large_towels: 'Große Handtücher',
    small_towels: 'Kleine Handtücher',
    bath_mats: 'Badematten',
    sink_towels: 'Waschbeckentücher',
    sauna_towels: 'Saunatücher'
  };

  const runOptimization = async () => {
    setIsOptimizing(true);
    
    // Schließe KI-Einstellungen wenn Optimierung startet
    if (onOptimizationStart) {
      onOptimizationStart();
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('optimize-linen-inventory', {
        body: {
          house_id: houseId,
          ai_settings: aiSettings
        }
      });

      if (error) throw error;

      setOptimization(data);
      toast({
        title: "KI-Optimierung abgeschlossen",
        description: `Analyse für ${houseName} erfolgreich durchgeführt`,
      });

    } catch (error) {
      console.error('Optimization error:', error);
      toast({
        title: "Optimierung fehlgeschlagen",
        description: "Die KI-Analyse konnte nicht durchgeführt werden",
        variant: "destructive",
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Header & Steuerung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            KI-Wäscheoptimierung - {houseName}
          </CardTitle>
          <CardDescription>
            Intelligente Bedarfsanalyse und Lageroptimierung für die nächsten Buchungen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={runOptimization} 
            disabled={isOptimizing}
            className="w-full"
            size="lg"
          >
            <Zap className="w-4 h-4 mr-2" />
            {isOptimizing ? 'KI analysiert...' : 'KI-Optimierung starten'}
          </Button>
        </CardContent>
      </Card>

      {optimization && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Übersicht</TabsTrigger>
            <TabsTrigger value="analysis">Analyse</TabsTrigger>
            <TabsTrigger value="recommendations">Empfehlungen</TabsTrigger>
            <TabsTrigger value="ordering">Bestellung</TabsTrigger>
          </TabsList>

          {/* Übersicht Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Vertrauen Score */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">KI-Vertrauen</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Progress value={optimization.confidence_score * 100} className="flex-1" />
                    <span className={`text-sm font-medium ${getConfidenceColor(optimization.confidence_score)}`}>
                      {(optimization.confidence_score * 100).toFixed(0)}%
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Lagerauslastung */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Lagerauslastung</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Progress value={optimization.storage_utilization * 100} className="flex-1" />
                    <span className="text-sm font-medium">
                      {(optimization.storage_utilization * 100).toFixed(0)}%
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Bestellstatus */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Bestellbedarf</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant={getPriorityColor(optimization.order_suggestion.order_priority)}>
                    {optimization.order_suggestion.order_priority === 'high' ? 'Dringend' :
                     optimization.order_suggestion.order_priority === 'medium' ? 'Mittel' : 'Niedrig'}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            {/* KI Insights */}
            {optimization.ai_insights.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    KI-Erkenntnisse
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {optimization.ai_insights.map((insight, index) => (
                      <Alert key={index}>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{insight}</AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Analyse Tab */}
          <TabsContent value="analysis" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Aktueller Bestand */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    Aktueller Bestand
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(optimization.current_stock).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-sm">{linenLabels[key as keyof LinenItem]}</span>
                        <Badge variant="outline">{value}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Prognostizierter Bedarf */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Prognostizierter Bedarf
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(optimization.upcoming_demand).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-sm">{linenLabels[key as keyof LinenItem]}</span>
                        <Badge variant="secondary">{value}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Empfehlungen Tab */}
          <TabsContent value="recommendations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  KI-Empfohlener Zielbestand
                </CardTitle>
                <CardDescription>
                  Optimaler Lagerbestand basierend auf KI-Analyse
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(optimization.recommended_stock).map(([key, recommended]) => {
                    const current = optimization.current_stock[key as keyof LinenItem] || 0;
                    const difference = recommended - current;
                    const isShortage = difference > 0;

                    return (
                      <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium">{linenLabels[key as keyof LinenItem]}</p>
                            <p className="text-sm text-muted-foreground">
                              Aktuell: {current} → Empfohlen: {recommended}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {difference !== 0 && (
                            <Badge variant={isShortage ? "destructive" : "secondary"}>
                              {isShortage ? '+' : ''}{difference}
                            </Badge>
                          )}
                          {difference === 0 && (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bestellung Tab */}
          <TabsContent value="ordering" className="space-y-4">
            {optimization.order_suggestion.total_items > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Intelligente Bestellempfehlung
                  </CardTitle>
                  <CardDescription>
                    KI-generierte Bestellliste basierend auf Ihrer Konfiguration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Bestellübersicht */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Gesamtmenge</p>
                        <p className="text-2xl font-bold">{optimization.order_suggestion.total_items}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Geschätzte Kosten</p>
                        <p className="text-2xl font-bold">€{optimization.order_suggestion.estimated_cost}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Priorität</p>
                        <Badge variant={getPriorityColor(optimization.order_suggestion.order_priority)}>
                          {optimization.order_suggestion.order_priority === 'high' ? 'Hoch' :
                           optimization.order_suggestion.order_priority === 'medium' ? 'Mittel' : 'Niedrig'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Dringende Items</p>
                        <p className="text-2xl font-bold text-red-600">
                          {optimization.order_suggestion.has_urgent_items ? '!' : '✓'}
                        </p>
                      </div>
                    </div>

                    {/* Bestellliste */}
                    <div className="space-y-3">
                      {Object.entries(optimization.order_suggestion.items).map(([itemType, details]: [string, any]) => (
                        <div key={itemType} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{linenLabels[itemType as keyof LinenItem]}</p>
                            <p className="text-sm text-muted-foreground">
                              Aktuell: {details.current_stock} / Empfohlen: {details.recommended}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={details.urgency === 'high' ? 'destructive' : 'default'}>
                              {details.order_quantity} bestellen
                            </Badge>
                            {details.urgency === 'high' && (
                              <Clock className="w-4 h-4 text-red-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button className="w-full" size="lg">
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Bestellung erstellen
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <CheckCircle className="w-12 h-12 mx-auto text-green-600 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Kein Bestellbedarf</h3>
                  <p className="text-muted-foreground">
                    Die KI hat analysiert, dass aktuell ausreichend Wäsche vorhanden ist.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default SmartLinenOptimizer;