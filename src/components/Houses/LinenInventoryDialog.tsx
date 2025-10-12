import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Home, MapPin, Brain, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useLinenAI } from '@/hooks/useLinenAI';
import { useOptimizedLinenManagement } from '@/hooks/useOptimizedLinenManagement';
import SmartLinenInventoryDashboard from './SmartLinenInventoryDashboard';
import AIOptimizationDialog from './AIOptimizationDialog';
import EditHouseDialog from './EditHouseDialog';
import LinenOrderDialog from './LinenOrderDialog';

interface LinenInventoryDialogProps {
  house: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LinenInventoryDialog = ({ house, open, onOpenChange }: LinenInventoryDialogProps) => {
  const { toast } = useToast();
  const { createOptimizedOrderMutation } = useOptimizedLinenManagement();
  const { 
    aiSettings, 
    updateAISettings, 
    saveAISettings, 
    loadAISettings,
  } = useLinenAI();
  
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [aiOrderData, setAiOrderData] = useState<any>(null);
  const [showOrderDialog, setShowOrderDialog] = useState(false);

  // Load AI settings when house changes
  React.useEffect(() => {
    if (house?.id) {
      loadAISettings(house.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house?.id]);

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
            <SmartLinenInventoryDashboard house={house} />
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Order Dialog */}
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
