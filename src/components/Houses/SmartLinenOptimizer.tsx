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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            KI-Optimierung
          </CardTitle>
          <CardDescription>
            Intelligente Bedarfsanalyse und Bestellempfehlungen basierend auf kommenden Buchungen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
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
              size="lg"
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
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Intelligente Bestellempfehlung
                  <Badge variant={getPriorityColor(optimization.order_suggestion.order_priority)}>
                    {optimization.order_suggestion.order_priority}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {optimization.order_suggestion.total_items} Artikel • 
                  Geschätzte Kosten: €{optimization.order_suggestion.estimated_cost}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(optimization.order_suggestion.items).map(([itemType, quantity]) => {
                    if (quantity === 0) return null;
                    return (
                      <div key={itemType} className="flex items-center justify-between p-3 border rounded-lg">
                        <span className="text-sm font-medium">
                          {linenLabels[itemType as keyof LinenItem] || itemType}
                        </span>
                        <Badge variant="secondary">
                          {quantity} Stück
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