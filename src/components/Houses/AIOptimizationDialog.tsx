import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Brain, Settings } from 'lucide-react';
import SmartLinenOptimizer from './SmartLinenOptimizer';
import SmartLinenSettings from './SmartLinenSettings';

interface AIOptimizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  houseId: string;
  houseName: string;
  aiSettings: any;
  updateAISettings: (settings: any) => void;
  saveAISettings: (houseId: string) => Promise<boolean>;
  loadAISettings: (houseId: string) => Promise<void>;
  onGenerateOrder?: (optimization: any) => void;
}

const AIOptimizationDialog = ({
  open,
  onOpenChange,
  houseId,
  houseName,
  aiSettings,
  updateAISettings,
  saveAISettings,
  loadAISettings,
  onGenerateOrder
}: AIOptimizationDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            KI-Optimierung
          </DialogTitle>
          <DialogDescription>
            Intelligente Bedarfsanalyse und Bestellempfehlungen für {houseName}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="optimization" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="optimization" className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Optimierung
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Einstellungen
            </TabsTrigger>
          </TabsList>

          <TabsContent value="optimization" className="space-y-4 mt-4">
            <SmartLinenOptimizer 
              houseId={houseId}
              houseName={houseName}
              aiSettings={aiSettings}
              onOptimizationStart={() => {}}
              onGenerateOrder={onGenerateOrder}
            />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 mt-4">
            <SmartLinenSettings 
              houseId={houseId}
              settings={aiSettings}
              onSettingsChange={updateAISettings}
              onSave={() => saveAISettings(houseId)}
              onLoad={loadAISettings}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AIOptimizationDialog;
