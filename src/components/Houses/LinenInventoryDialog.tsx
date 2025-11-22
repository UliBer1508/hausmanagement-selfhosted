import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Home, MapPin, Brain, Edit, Package, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Minus, Target, BarChart3, Bed, Bath, ChefHat } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useLinenAI } from '@/hooks/useLinenAI';
import { useOptimizedLinenManagement, LinenDemandAnalysis } from '@/hooks/useOptimizedLinenManagement';
import AIOptimizationDialog from './AIOptimizationDialog';
import EditHouseDialog from './EditHouseDialog';
import LinenOrderDialog from './LinenOrderDialog';
import LinenSetRulesTab from './LinenSetRulesTab';
import { LinenOrderAnalytics } from './LinenOrderAnalytics';
import LinenPricesTab from './LinenPricesTab';
import { BookingLinenOverview } from './BookingLinenOverview';

interface LinenInventoryDialogProps {
  house: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LinenInventoryDialog = ({ house, open, onOpenChange }: LinenInventoryDialogProps) => {
  const { toast } = useToast();
  const { housesWithLinenData, createOptimizedOrderMutation } = useOptimizedLinenManagement();
  const { 
    aiSettings, 
    updateAISettings, 
    saveAISettings, 
    loadAISettings,
  } = useLinenAI();
  
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'bedroom' | 'bathroom' | 'kitchen' | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [aiOrderData, setAiOrderData] = useState<any>(null);
  const [showOrderDialog, setShowOrderDialog] = useState(false);

  // Load AI settings when house changes
  React.useEffect(() => {
    if (house?.id) {
      loadAISettings(house.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house?.id]);

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
    
    // Extract items from AI recommendation
    const orderItems: Record<string, number> = {};
    Object.entries(optimization.order_suggestion.items).forEach(([itemType, itemData]) => {
      const orderQty = typeof itemData === 'object' ? (itemData as any).order_quantity : itemData;
      if (orderQty > 0) {
        orderItems[itemType] = orderQty;
      }
    });

    // Calculate smart delivery date based on priority
    const daysToAdd = optimization.order_suggestion.order_priority === 'high' ? 1 : 
                      optimization.order_suggestion.order_priority === 'medium' ? 2 : 3;
    const deliveryDate = format(new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

    // Create pre-filled notes from AI insights
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

  if (!house) return null;

  const allItems = houseData ? Object.values(houseData.categories).flat() : [];
  const criticalItems = allItems.filter(item => item.status === 'critical');
  const lowItems = allItems.filter(item => item.status === 'low');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 gap-0">
          <DialogHeader className="px-4 py-3 md:px-6 md:py-4 border-b">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-lg md:text-xl">
                  <Home className="w-5 h-5 text-primary" />
                  {house.name}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-1.5 text-xs md:text-sm">
                  <MapPin className="w-3 h-3 md:w-4 md:h-4" />
                  {house.address}
                </DialogDescription>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button 
                  onClick={() => setShowAIDialog(true)}
                  size="sm"
                  variant="default"
                  className="h-8 w-8 p-0"
                >
                  <Brain className="w-4 h-4" />
                </Button>
                <Button 
                  onClick={() => setShowEditDialog(true)}
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
            {!houseData ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Lade intelligente Analyse...</p>
              </div>
            ) : (
              <div className="space-y-6">
                <Tabs defaultValue="smart-analysis" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 h-auto">
                    <TabsTrigger value="smart-analysis" className="text-xs md:text-sm px-2 py-2 md:px-3 md:py-2.5 data-[state=active]:text-xs md:data-[state=active]:text-sm">
                      <span className="hidden sm:inline">Übersicht</span>
                      <span className="sm:hidden">Übersicht</span>
                    </TabsTrigger>
                    <TabsTrigger value="wäscheset-regeln" className="text-xs md:text-sm px-2 py-2 md:px-3 md:py-2.5 data-[state=active]:text-xs md:data-[state=active]:text-sm">
                      Regeln
                    </TabsTrigger>
                    <TabsTrigger value="preise" className="text-xs md:text-sm px-2 py-2 md:px-3 md:py-2.5 data-[state=active]:text-xs md:data-[state=active]:text-sm">
                      Preise
                    </TabsTrigger>
                    <TabsTrigger value="bestellungen" className="text-xs md:text-sm px-2 py-2 md:px-3 md:py-2.5 data-[state=active]:text-xs md:data-[state=active]:text-sm">
                      <span className="hidden xs:inline">Bestellungen</span>
                      <span className="xs:hidden">Best.</span>
                    </TabsTrigger>
                  </TabsList>

        <TabsContent value="smart-analysis" className="space-y-6">
          {/* Buchungsbasierte Wäscheübersicht (Zero-Stock) */}
          <BookingLinenOverview houseId={house.id} />
        </TabsContent>

                  <TabsContent value="wäscheset-regeln">
                    <LinenSetRulesTab house={house} />
                  </TabsContent>

                  <TabsContent value="preise">
                    <LinenPricesTab houseId={house.id} />
                  </TabsContent>

                  <TabsContent value="bestellungen">
                    <LinenOrderAnalytics house={house} />
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
                    availableBookings={houseData?.house?.bookings || []}
                    linenSetDefinition={houseData?.house?.linen_set_definitions?.[0]}
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
                      }, {
                        onSuccess: () => {
                          setShowOrderDialog(false);
                          setAiOrderData(null);
                        }
                      });
                    }}
                    isCreating={createOptimizedOrderMutation.isPending}
                  />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Order Dialog from AI Optimization */}
      {aiOrderData && (
        <LinenOrderDialog
          open={showOrderDialog}
          onOpenChange={setShowOrderDialog}
          houseId={house.id}
          houseName={house.name}
          orderItems={aiOrderData.orderItems}
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
            }, {
              onSuccess: () => {
                setShowOrderDialog(false);
                setAiOrderData(null);
              }
            });
          }}
          isCreating={createOptimizedOrderMutation.isPending}
        />
      )}

      {/* AI Optimization Dialog */}
      <AIOptimizationDialog
        open={showAIDialog}
        onOpenChange={setShowAIDialog}
        houseId={house.id}
        houseName={house.name}
        aiSettings={aiSettings}
        updateAISettings={updateAISettings}
        saveAISettings={saveAISettings}
        loadAISettings={loadAISettings}
        onGenerateOrder={handleGenerateAIOrder}
      />

      {/* Edit House Dialog */}
      <EditHouseDialog
        house={house}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />
    </>
  );
};

export default LinenInventoryDialog;
