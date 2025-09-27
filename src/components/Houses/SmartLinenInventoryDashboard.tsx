import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Package,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  ShoppingCart,
  Edit,
  Home,
  Brain,
  Target,
  Calendar,
  BarChart3,
  Bed,
  Bath,
  ChefHat,
  Clock,
  Zap
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { useOptimizedLinenManagement, LinenDemandAnalysis } from '@/hooks/useOptimizedLinenManagement';
import { useLinenAI } from '@/hooks/useLinenAI';
import LinenSetRulesTab from './LinenSetRulesTab';
import LinenOrdersTab from './LinenOrdersTab';
import SmartLinenSettings from './SmartLinenSettings';
import SmartLinenOptimizer from './SmartLinenOptimizer';

interface SmartLinenInventoryDashboardProps {
  house: any;
}

const SmartLinenInventoryDashboard = ({ house }: SmartLinenInventoryDashboardProps) => {
  const { housesWithLinenData, createOptimizedOrderMutation } = useOptimizedLinenManagement();
  const { 
    aiSettings, 
    updateAISettings, 
    saveAISettings, 
    loadAISettings,
  } = useLinenAI();
  const [selectedCategory, setSelectedCategory] = useState<'bedroom' | 'bathroom' | 'kitchen' | null>(null);
  const [showAISettings, setShowAISettings] = useState(false);

  // Lade AI-Einstellungen beim Mount
  React.useEffect(() => {
    loadAISettings(house.id);
  }, [house.id, loadAISettings]);

  // Find current house data in the optimized dataset
  const houseData = useMemo(() => {
    return housesWithLinenData?.find(h => h.house.id === house.id);
  }, [housesWithLinenData, house.id]);

  // Debug logging für selectedCategory
  React.useEffect(() => {
    console.log('selectedCategory changed:', selectedCategory);
    if (selectedCategory && houseData) {
      console.log('Items for category:', houseData.categories[selectedCategory]);
    }
  }, [selectedCategory, houseData]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'bedroom': return <Bed className="w-5 h-5" />;
      case 'bathroom': return <Bath className="w-5 h-5" />;
      case 'kitchen': return <ChefHat className="w-5 h-5" />;
      default: return <Package className="w-5 h-5" />;
    }
  };

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'bedroom': return 'Schlafbereich';
      case 'bathroom': return 'Badbereich'; 
      case 'kitchen': return 'Küchenbereich';
      default: return 'Kategorie';
    }
  };

  const getStatusColor = (status: LinenDemandAnalysis['status']) => {
    switch (status) {
      case 'sufficient': return 'bg-green-100 text-green-800 border-green-200';
      case 'low': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'overstock': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: LinenDemandAnalysis['status']) => {
    switch (status) {
      case 'sufficient': return <CheckCircle className="w-4 h-4" />;
      case 'low': return <AlertTriangle className="w-4 h-4" />;
      case 'critical': return <AlertTriangle className="w-4 h-4" />;
      case 'overstock': return <Package className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const getTrendIcon = (trend: LinenDemandAnalysis['trend']) => {
    switch (trend) {
      case 'increasing': return <TrendingUp className="w-4 h-4 text-red-500" />;
      case 'decreasing': return <TrendingDown className="w-4 h-4 text-green-500" />;
      case 'stable': return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getProgressColor = (status: LinenDemandAnalysis['status']) => {
    switch (status) {
      case 'sufficient': return 'bg-green-500';
      case 'low': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      case 'overstock': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const handleSmartOrder = async () => {
    if (!houseData) return;
    
    const criticalItems: Record<string, number> = {};
    
    // Collect critical and low items with smart quantities
    Object.values(houseData.categories).flat().forEach(item => {
      if (item.status === 'critical') {
        // For critical: deficit + safety buffer based on next week prediction
        criticalItems[item.itemType] = item.deficit + Math.ceil(item.prediction.nextWeekDemand * 0.2);
      } else if (item.status === 'low' && item.prediction.nextWeekDemand > item.currentStock) {
        // For low with upcoming high demand: difference + small buffer  
        criticalItems[item.itemType] = Math.ceil((item.prediction.nextWeekDemand - item.currentStock) * 1.1);
      }
    });

    if (Object.keys(criticalItems).length > 0) {
      const isUrgent = houseData.nextBookingDaysAway !== undefined && houseData.nextBookingDaysAway <= 2;
      
      createOptimizedOrderMutation.mutate({
        houseId: house.id,
        orderItems: criticalItems,
        priority: isUrgent ? 'urgent' : 'normal',
        notes: `KI-optimierte Bestellung: ${Object.keys(criticalItems).length} Artikel mit prädiktiver Mengenberechnung`
      });
    }
  };

  if (!houseData) {
    return (
      <div className="text-center py-8">
        <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Lade intelligente Analyse...</p>
      </div>
    );
  }

  const allItems = Object.values(houseData.categories).flat();
  const criticalItems = allItems.filter(item => item.status === 'critical');
  const lowItems = allItems.filter(item => item.status === 'low');

  return (
    <div className="space-y-6">
      {/* Smart Header */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-blue-500/5 pointer-events-none" />
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Brain className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">{house.name}</CardTitle>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Home className="w-4 h-4" />
                  {house.address}
                  {houseData.nextBookingDate && (
                    <>
                      <Separator orientation="vertical" className="h-4" />
                      <Clock className="w-4 h-4" />
                      Nächste Buchung: {houseData.nextBookingDaysAway === 0 ? 'Heute' :
                                         houseData.nextBookingDaysAway === 1 ? 'Morgen' :
                                         `In ${houseData.nextBookingDaysAway} Tagen`}
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => {
                  console.log('KI-Einstellungen clicked, current state:', showAISettings);
                  setShowAISettings(prev => !prev);
                }}
                variant={showAISettings ? "default" : "outline"}
                className="shrink-0"
              >
                <Zap className="w-4 h-4 mr-2" />
                KI-Einstellungen
              </Button>
              <Button variant="outline" className="shrink-0">
                <Edit className="w-4 h-4 mr-2" />
                Bearbeiten
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* KI-Optimierung - Always visible */}
      <div>
        <SmartLinenOptimizer 
          houseId={house.id}
          houseName={house.name}
          aiSettings={aiSettings}
          onOptimizationStart={() => setShowAISettings(false)}
        />
      </div>

      {/* Collapsible AI Settings - Only Settings */}
      <Collapsible open={showAISettings} onOpenChange={setShowAISettings}>
        <CollapsibleContent className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                KI-Einstellungen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SmartLinenSettings 
                houseId={house.id}
                settings={aiSettings}
                onSettingsChange={updateAISettings}
                onSave={() => saveAISettings(house.id)}
                onLoad={loadAISettings}
              />
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <Tabs defaultValue="smart-analysis" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="smart-analysis">Smart-Analyse</TabsTrigger>
          <TabsTrigger value="predictions">Vorhersagen</TabsTrigger>
          <TabsTrigger value="wäscheset-regeln">Regeln</TabsTrigger>
          <TabsTrigger value="bestellungen">Bestellungen</TabsTrigger>
        </TabsList>

        <TabsContent value="smart-analysis" className="space-y-6">
          {/* Critical Alert */}
          {criticalItems.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{criticalItems.length} kritische Artikel</strong> erkannt.{' '}
                {houseData.nextBookingDaysAway !== undefined && houseData.nextBookingDaysAway <= 2 && (
                  <strong className="text-red-700">Check-in in {houseData.nextBookingDaysAway} Tag(en)!</strong>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Category Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Object.entries(houseData.categories).map(([categoryKey, items]) => {
              if (items.length === 0) return null;
              
              const criticalInCategory = items.filter(item => item.status === 'critical').length;
              const lowInCategory = items.filter(item => item.status === 'low').length;
              const sufficientInCategory = items.filter(item => item.status === 'sufficient').length;
              const overstockInCategory = items.filter(item => item.status === 'overstock').length;
              
              return (
                <Card 
                  key={categoryKey} 
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    selectedCategory === categoryKey ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => setSelectedCategory(selectedCategory === categoryKey ? null : categoryKey as any)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(categoryKey)}
                        <CardTitle className="text-base">{getCategoryTitle(categoryKey)}</CardTitle>
                      </div>
                      {criticalInCategory > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {criticalInCategory} kritisch
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-center p-2 rounded bg-green-50">
                        <div className="font-bold text-green-600">{sufficientInCategory}</div>
                        <div className="text-muted-foreground">Gut</div>
                      </div>
                      <div className="text-center p-2 rounded bg-yellow-50">
                        <div className="font-bold text-yellow-600">{lowInCategory}</div>
                        <div className="text-muted-foreground">Niedrig</div>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('Details ansehen clicked for category:', categoryKey);
                        setSelectedCategory(categoryKey as any);
                      }}
                    >
                      Details ansehen
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detailed Item View */}
          {selectedCategory && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    {getCategoryIcon(selectedCategory)}
                    {getCategoryTitle(selectedCategory)} - Detailanalyse
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedCategory(null)}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {houseData.categories[selectedCategory]?.map((item) => (
                    <Card key={item.itemType} className="relative">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="font-medium text-sm">{item.label}</h4>
                          <div className="flex items-center gap-1">
                            <Badge 
                              variant="outline" 
                              className={`${getStatusColor(item.status)} text-xs`}
                            >
                              {getStatusIcon(item.status)}
                            </Badge>
                            {getTrendIcon(item.trend)}
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Bestand:</span>
                            <span className="font-medium">{item.currentStock}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Bedarf:</span>
                            <span className="font-medium">{item.totalDemand}</span>
                          </div>
                          {item.deficit > 0 && (
                            <div className="flex justify-between text-red-600 font-medium">
                              <span>Fehlen:</span>
                              <span>{item.deficit}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Nächste Woche:</span>
                            <span>{item.prediction.nextWeekDemand}</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Verfügbarkeit</span>
                            <span>{Math.round((item.currentStock / Math.max(item.totalDemand, 1)) * 100)}%</span>
                          </div>
                          <Progress 
                            value={Math.min(100, (item.currentStock / Math.max(item.totalDemand, 1)) * 100)} 
                            className="h-2"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="predictions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Prädiktive Analyse & KI-Vorhersagen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allItems.map((item) => (
                  <Card key={item.itemType} className="relative">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-sm">{item.label}</h4>
                          {getTrendIcon(item.trend)}
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="bg-muted/50 p-2 rounded">
                            <div className="font-medium text-xs mb-1">Vorhersagen</div>
                            <div className="flex justify-between">
                              <span>Diese Woche:</span>
                              <span className="font-medium">{item.prediction.nextWeekDemand}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Nächster Monat:</span>
                              <span className="font-medium">{item.prediction.nextMonthDemand}</span>
                            </div>
                          </div>
                          
                          <div className="bg-blue-50 p-2 rounded border border-blue-200">
                            <div className="font-medium text-xs mb-1 text-blue-700">Reorder Point</div>
                            <div className="flex justify-between">
                              <span className="text-blue-600">Nachbestellen bei:</span>
                              <span className="font-bold text-blue-700">{item.prediction.reorderPoint}</span>
                            </div>
                          </div>
                          
                          {item.currentStock <= item.prediction.reorderPoint && (
                            <Alert className="p-2">
                              <Target className="w-4 h-4" />
                              <AlertDescription className="text-xs">
                                Reorder Point erreicht! Nachbestellung empfohlen.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wäscheset-regeln">
          <LinenSetRulesTab house={house} />
        </TabsContent>

        <TabsContent value="bestellungen">
          <LinenOrdersTab house={house} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SmartLinenInventoryDashboard;