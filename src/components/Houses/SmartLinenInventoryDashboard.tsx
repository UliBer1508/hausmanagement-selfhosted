import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
import LinenSetRulesTab from './LinenSetRulesTab';
import LinenOrdersTab from './LinenOrdersTab';
import SmartLinenSettings from './SmartLinenSettings';
import SmartLinenOptimizer from './SmartLinenOptimizer';
import LinenOrderDialog from './LinenOrderDialog';

interface SmartLinenInventoryDashboardProps {
  house: any;
}

const SmartLinenInventoryDashboard = ({ house }: SmartLinenInventoryDashboardProps) => {
  const { toast } = useToast();
  const { housesWithLinenData, createOptimizedOrderMutation } = useOptimizedLinenManagement();
  const { 
    aiSettings, 
    updateAISettings, 
    saveAISettings, 
    loadAISettings,
  } = useLinenAI();
  const [selectedCategory, setSelectedCategory] = useState<'bedroom' | 'bathroom' | 'kitchen' | null>(null);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [aiOrderData, setAiOrderData] = useState<any>(null);
  const [showOrderDialog, setShowOrderDialog] = useState(false);

  // Lade AI-Einstellungen beim Mount
  React.useEffect(() => {
    loadAISettings(house.id);
  }, [house.id, loadAISettings]);

  // Find current house data in the optimized dataset
  const houseData = useMemo(() => {
    return housesWithLinenData?.find(h => h.house.id === house.id);
  }, [housesWithLinenData, house.id]);

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

  const handleGenerateAIOrder = (optimization: any) => {
    console.log('🤖 Generiere Bestellung aus KI-Empfehlung:', optimization);
    
    // Extrahiere Artikel aus KI-Empfehlung
    const orderItems: Record<string, number> = {};
    Object.entries(optimization.order_suggestion.items).forEach(([itemType, itemData]) => {
      const orderQty = typeof itemData === 'object' ? (itemData as any).order_quantity : itemData;
      if (orderQty > 0) {
        orderItems[itemType] = orderQty;
      }
    });

    // Berechne intelligentes Lieferdatum basierend auf Priorität
    const daysToAdd = optimization.order_suggestion.order_priority === 'high' ? 1 : 
                      optimization.order_suggestion.order_priority === 'medium' ? 2 : 3;
    const deliveryDate = format(new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

    // Erstelle vorbefüllte Notizen aus KI-Insights
    const notes = optimization.ai_insights && optimization.ai_insights.length > 0
      ? `KI-Empfehlung (${optimization.order_suggestion.order_priority} Priorität):\n${optimization.ai_insights.join('\n')}`
      : `Automatisch generierte Bestellung basierend auf KI-Analyse (${optimization.order_suggestion.order_priority} Priorität)`;

    setAiOrderData({
      orderItems,
      deliveryDate,
      deliveryType: 'delivery' as const,
      notes,
      priority: optimization.order_suggestion.order_priority,
      estimatedCost: optimization.order_suggestion.estimated_cost
    });
    
    setShowOrderDialog(true);
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
        <CardHeader className="p-4 md:p-6">
          <div className="flex flex-col gap-3 md:gap-4">
            <div className="flex items-start gap-2 md:gap-3">
              <div className="p-1.5 md:p-2 rounded-lg bg-primary/10 shrink-0">
                <Brain className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base md:text-xl truncate">{house.name}</CardTitle>
                <p className="text-xs md:text-sm text-muted-foreground flex flex-wrap items-center gap-1 md:gap-2 mt-1">
                  <Home className="w-3 h-3 md:w-4 md:h-4 shrink-0" />
                  <span className="truncate">{house.address}</span>
                  {houseData.nextBookingDate && (
                    <>
                      <Separator orientation="vertical" className="h-3 md:h-4" />
                      <Clock className="w-3 h-3 md:w-4 md:h-4 shrink-0" />
                      <span className="whitespace-nowrap text-xs md:text-sm">
                        {houseData.nextBookingDaysAway === 0 ? 'Heute' :
                         houseData.nextBookingDaysAway === 1 ? 'Morgen' :
                         `In ${houseData.nextBookingDaysAway} Tagen`}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button 
                onClick={() => {
                  console.log('KI-Einstellungen clicked, current state:', showAISettings);
                  setShowAISettings(prev => !prev);
                }}
                variant={showAISettings ? "default" : "outline"}
                className="w-full sm:w-auto text-sm"
                size="sm"
              >
                <Zap className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">KI-Einstellungen</span>
                <span className="sm:hidden">Einstellungen</span>
              </Button>
              <Button variant="outline" className="w-full sm:w-auto text-sm" size="sm">
                <Edit className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Bearbeiten</span>
                <span className="sm:hidden">Haus bearbeiten</span>
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
          onGenerateOrder={handleGenerateAIOrder}
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
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="smart-analysis" className="text-xs md:text-sm px-2 py-2 md:px-3 md:py-2.5 data-[state=active]:text-xs md:data-[state=active]:text-sm">
            <span className="hidden sm:inline">Smart-Analyse</span>
            <span className="sm:hidden">Analyse</span>
          </TabsTrigger>
          <TabsTrigger value="predictions" className="text-xs md:text-sm px-2 py-2 md:px-3 md:py-2.5 data-[state=active]:text-xs md:data-[state=active]:text-sm">
            <span className="hidden xs:inline">Vorhersagen</span>
            <span className="xs:hidden">Prog.</span>
          </TabsTrigger>
          <TabsTrigger value="wäscheset-regeln" className="text-xs md:text-sm px-2 py-2 md:px-3 md:py-2.5 data-[state=active]:text-xs md:data-[state=active]:text-sm">
            Regeln
          </TabsTrigger>
          <TabsTrigger value="bestellungen" className="text-xs md:text-sm px-2 py-2 md:px-3 md:py-2.5 data-[state=active]:text-xs md:data-[state=active]:text-sm">
            <span className="hidden xs:inline">Bestellungen</span>
            <span className="xs:hidden">Best.</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="smart-analysis" className="space-y-6">
          {/* Critical Alert */}
          {criticalItems.length > 0 && (
            <Alert variant="destructive" className="p-3 md:p-4">
              <AlertTriangle className="h-3 w-3 md:h-4 md:w-4" />
              <AlertDescription className="text-xs md:text-sm">
                <strong className="block xs:inline">{criticalItems.length} kritische Artikel</strong>
                <span className="hidden xs:inline"> erkannt.</span>{' '}
                {houseData.nextBookingDaysAway !== undefined && houseData.nextBookingDaysAway <= 2 && (
                  <strong className="text-red-700 block xs:inline mt-1 xs:mt-0">
                    Check-in in {houseData.nextBookingDaysAway} Tag(en)!
                  </strong>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Category Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
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
                >
                  <CardHeader className="p-3 md:pb-3 md:px-6 md:pt-6">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                        {getCategoryIcon(categoryKey)}
                        <CardTitle className="text-sm md:text-base truncate">{getCategoryTitle(categoryKey)}</CardTitle>
                      </div>
                      {criticalInCategory > 0 && (
                        <Badge variant="destructive" className="text-[10px] md:text-xs px-1 md:px-2 py-0 md:py-0.5 h-4 md:h-auto shrink-0">
                          {criticalInCategory}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 md:space-y-3 p-3 md:p-6 pt-0">
                    <div className="grid grid-cols-2 gap-1.5 md:gap-2 text-xs">
                      {criticalInCategory > 0 && (
                        <div className="text-center p-1.5 md:p-2 rounded bg-red-50 border border-red-200">
                          <div className="font-bold text-red-600 text-sm md:text-base">{criticalInCategory}</div>
                          <div className="text-muted-foreground text-[10px] md:text-xs">Kritisch</div>
                        </div>
                      )}
                      {lowInCategory > 0 && (
                        <div className="text-center p-1.5 md:p-2 rounded bg-yellow-50">
                          <div className="font-bold text-yellow-600 text-sm md:text-base">{lowInCategory}</div>
                          <div className="text-muted-foreground text-[10px] md:text-xs">Niedrig</div>
                        </div>
                      )}
                      {sufficientInCategory > 0 && (
                        <div className="text-center p-1.5 md:p-2 rounded bg-green-50">
                          <div className="font-bold text-green-600 text-sm md:text-base">{sufficientInCategory}</div>
                          <div className="text-muted-foreground text-[10px] md:text-xs">Gut</div>
                        </div>
                      )}
                      {overstockInCategory > 0 && (
                        <div className="text-center p-1.5 md:p-2 rounded bg-blue-50">
                          <div className="font-bold text-blue-600 text-sm md:text-base">{overstockInCategory}</div>
                          <div className="text-muted-foreground text-[10px] md:text-xs">Überbestand</div>
                        </div>
                      )}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full text-xs md:text-sm h-7 md:h-9"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCategory(categoryKey as any);
                        setShowDetailDialog(true);
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
                    onClick={() => {
                      setSelectedCategory(null);
                    }}
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

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCategory && getCategoryIcon(selectedCategory)}
              {selectedCategory && getCategoryTitle(selectedCategory)} - Detailanalyse
            </DialogTitle>
            <DialogDescription>
              Detaillierte Übersicht aller Wäsche-Items in dieser Kategorie mit aktuellen Beständen, Bedarf und Status.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {selectedCategory && houseData && (
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
                            <span>Fehlbetrag:</span>
                            <span>{item.deficit}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Verfügbarkeit:</span>
                          <span className={`font-medium ${getProgressColor(item.status)}`}>
                            {Math.round((item.currentStock / Math.max(item.totalDemand, 1)) * 100)}%
                          </span>
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
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI-generated Order Dialog */}
      {showOrderDialog && aiOrderData && (
        <LinenOrderDialog
          open={showOrderDialog}
          onOpenChange={setShowOrderDialog}
          orderItems={aiOrderData.orderItems}
          houseName={house.name}
          houseId={house.id}
          selectedBooking={undefined}
          initialData={{
            deliveryDate: aiOrderData.deliveryDate,
            deliveryType: aiOrderData.deliveryType,
            notes: aiOrderData.notes
          }}
          onCreateOrder={(orderData) => {
            console.log('🚀 Erstelle KI-Bestellung:', orderData);
            
            createOptimizedOrderMutation.mutate({
              houseId: house.id,
              orderItems: orderData.orderItems,
              priority: aiOrderData.priority,
              notes: orderData.notes
            });
            
            setShowOrderDialog(false);
            setAiOrderData(null);
          }}
          isCreating={createOptimizedOrderMutation.isPending}
        />
      )}
    </div>
  );
};

export default SmartLinenInventoryDashboard;