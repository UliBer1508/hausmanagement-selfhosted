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
import { useToast } from "@/hooks/use-toast";
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
  onGenerateOrder?: (optimization: OptimizationResult) => void;
}

const SmartLinenOptimizer: React.FC<SmartLinenOptimizerProps> = ({
  houseId,
  houseName,
  aiSettings,
  onOptimizationStart,
  onGenerateOrder
}) => {
  const { toast } = useToast();
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const linenLabels: Record<keyof LinenItem, string> = {
    bedding: 'Bettwäsche',
    large_towels: 'Badetücher',
    small_towels: 'Kleine Handtücher',
    bath_mats: 'Badematten',
    sink_towels: 'WB-Handtücher',
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
      
      // Speichere KI-Analyseergebnisse in der Datenbank
      try {
        const { error: saveError } = await supabase
          .from('ai_optimization_results')
          .insert({
            house_id: houseId,
            optimization_result: data,
            confidence_score: data.confidence_score || 0.8,
            recommendations: data.order_suggestion,
            guest_behavior_insights: data.ai_insights || [],
            seasonal_patterns: data.seasonal_patterns || {},
            booking_patterns: data.booking_patterns || {}
          });
          
        if (saveError) {
          console.error('Failed to save optimization results:', saveError);
        } else {
          console.log('Optimization results saved to database');
        }
      } catch (saveError) {
        console.error('Error saving optimization to database:', saveError);
      }
      
      toast({
        title: "KI-Optimierung abgeschlossen",
        description: `Analyse für ${houseName} erfolgreich durchgeführt und gespeichert`,
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
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Brain className="w-4 h-4 md:w-5 md:h-5" />
            KI-Optimierung
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Intelligente Bedarfsanalyse und Bestellempfehlungen basierend auf kommenden Buchungen
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs md:text-sm text-muted-foreground">
                Letzte Analyse: {optimization ? 'Gerade durchgeführt' : 'Noch nicht durchgeführt'}
              </p>
              {optimization && (
                <p className="text-xs text-muted-foreground">
                  Vertrauen: <span className={getConfidenceColor(optimization.confidence_score)}>
                    {Math.round(optimization.confidence_score * 100)}%
                  </span>
                </p>
              )}
            </div>
            <Button 
              onClick={runOptimization}
              disabled={isOptimizing}
              size="sm"
              className="w-full sm:w-auto text-sm"
            >
              <Zap className="w-4 h-4 mr-2" />
              {isOptimizing ? 'Analysiere...' : 'KI-Optimierung starten'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Optimierungsergebnisse */}
      {optimization && (
        <div className="space-y-4">
          {/* Bestellempfehlung */}
          {optimization.order_suggestion && (
            <Card>
              <CardHeader className="p-4 md:p-6">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base md:text-lg">
                        <ShoppingCart className="w-4 h-4 md:w-5 md:h-5" />
                        <span>Intelligente Bestellempfehlung</span>
                        <Badge 
                          variant={getPriorityColor(optimization.order_suggestion.order_priority)}
                          className="text-xs"
                        >
                          {optimization.order_suggestion.order_priority}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs md:text-sm">
                        {optimization.order_suggestion.total_items} Artikel • 
                        Kosten: €{optimization.order_suggestion.estimated_cost}
                      </CardDescription>
                    </div>
                    {onGenerateOrder && (
                      <Button 
                        onClick={() => onGenerateOrder(optimization)}
                        size="sm"
                        className="w-full sm:w-auto text-sm shrink-0"
                      >
                        <ShoppingCart className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Bestellung generieren</span>
                        <span className="sm:hidden">Generieren</span>
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                  {Object.entries(optimization.order_suggestion.items).map(([itemType, itemData]) => {
                    const orderQty = typeof itemData === 'object' ? itemData.order_quantity : itemData;
                    if (orderQty === 0) return null;
                    return (
                      <div key={itemType} className="flex items-center justify-between p-2 md:p-3 border rounded-lg">
                        <span className="text-xs md:text-sm font-medium truncate">
                          {linenLabels[itemType as keyof LinenItem] || itemType}
                        </span>
                        <Badge variant="secondary" className="text-xs shrink-0 ml-2">
                          {orderQty}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* KI-Insights */}
          {optimization.ai_insights && optimization.ai_insights.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  KI-Insights
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
        </div>
      )}
    </div>
  );
};

export default SmartLinenOptimizer;