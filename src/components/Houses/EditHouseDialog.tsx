import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import LinenInventory from './LinenInventory';
import LinenManagement from './LinenManagement';
import HouseInventory from './HouseInventory';
import SmartLinenSettings from './SmartLinenSettings';
import { useLinenAI } from '@/hooks/useLinenAI';

interface EditHouseDialogProps {
  house: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EditHouseDialog = ({ house, open, onOpenChange }: EditHouseDialogProps) => {
  const [formData, setFormData] = useState({
    name: house?.name || '',
    address: house?.address || '',
    max_guests: house?.max_guests || 6,
    bathrooms: house?.bathrooms || 1,
    bedrooms: house?.bedrooms || 3,
    living_area_sqm: house?.living_area_sqm || 0,
    amenities: house?.amenities || {
      sauna: false,
      terrace: false,
      ski_cellar: false,
      garage_spaces: 0,
      glacier_view: false,
      additional_toilet: false,
    }
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // KI-Einstellungen Hook
  const {
    aiSettings,
    isSavingSettings,
    updateAISettings,
    saveAISettings,
    loadAISettings
  } = useLinenAI();

  const updateHouseMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('houses')
        .update({
          name: data.name,
          address: data.address,
          max_guests: data.max_guests,
          bathrooms: data.bathrooms,
          bedrooms: data.bedrooms,
          living_area_sqm: data.living_area_sqm || null,
          amenities: data.amenities,
        })
        .eq('id', house.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['houses-full'] });
      toast({
        title: "Haus aktualisiert",
        description: "Die Änderungen wurden erfolgreich gespeichert.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Die Änderungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
      console.error('Error updating house:', error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim()) {
      toast({
        title: "Eingabe erforderlich",
        description: "Bitte füllen Sie alle Pflichtfelder aus.",
        variant: "destructive",
      });
      return;
    }
    updateHouseMutation.mutate(formData);
  };

  // Update form data when house prop changes
  useEffect(() => {
    if (house) {
      setFormData({
        name: house.name || '',
        address: house.address || '',
        max_guests: house.max_guests || 6,
        bathrooms: house.bathrooms || 1,
        bedrooms: house.bedrooms || 3,
        living_area_sqm: house.living_area_sqm || 0,
        amenities: house.amenities || {
          sauna: false,
          terrace: false,
          ski_cellar: false,
          garage_spaces: 0,
          glacier_view: false,
          additional_toilet: false,
        }
      });
    }
  }, [house]);

  if (!house) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Haus bearbeiten: {house.name}</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic">Grunddaten</TabsTrigger>
            <TabsTrigger value="linen">Wäsche-Inventar</TabsTrigger>
            <TabsTrigger value="linen-management">Wäsche-Management</TabsTrigger>
            <TabsTrigger value="ai-settings">KI-Einstellungen</TabsTrigger>
            <TabsTrigger value="inventory">Inventar</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. Wald Chalet"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Adresse *</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Vollständige Adresse eingeben"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max_guests">Max. Gäste</Label>
                  <Input
                    id="max_guests"
                    type="number"
                    min="1"
                    max="20"
                    value={formData.max_guests}
                    onChange={(e) => setFormData({ ...formData, max_guests: parseInt(e.target.value) || 6 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bathrooms">Badezimmer</Label>
                  <Input
                    id="bathrooms"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.bathrooms}
                    onChange={(e) => setFormData({ ...formData, bathrooms: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bedrooms">Schlafzimmer</Label>
                  <Input
                    id="bedrooms"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.bedrooms}
                    onChange={(e) => setFormData({ ...formData, bedrooms: parseInt(e.target.value) || 3 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="living_area_sqm">Wohnfläche (qm)</Label>
                  <Input
                    id="living_area_sqm"
                    type="number"
                    min="0"
                    max="1000"
                    value={formData.living_area_sqm || ''}
                    onChange={(e) => setFormData({ ...formData, living_area_sqm: parseInt(e.target.value) || 0 })}
                    placeholder="z.B. 130"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label>Ausstattung</Label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.amenities.sauna}
                      onChange={(e) => setFormData({
                        ...formData,
                        amenities: { ...formData.amenities, sauna: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span className="text-sm">🧖 Sauna</span>
                  </label>
                  
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.amenities.terrace}
                      onChange={(e) => setFormData({
                        ...formData,
                        amenities: { ...formData.amenities, terrace: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span className="text-sm">☀️ Terrasse/Balkon</span>
                  </label>
                  
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.amenities.ski_cellar}
                      onChange={(e) => setFormData({
                        ...formData,
                        amenities: { ...formData.amenities, ski_cellar: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span className="text-sm">⛷️ Skikeller</span>
                  </label>
                  
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.amenities.glacier_view}
                      onChange={(e) => setFormData({
                        ...formData,
                        amenities: { ...formData.amenities, glacier_view: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span className="text-sm">🏔️ Gletscherblick</span>
                  </label>
                  
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.amenities.additional_toilet}
                      onChange={(e) => setFormData({
                        ...formData,
                        amenities: { ...formData.amenities, additional_toilet: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <span className="text-sm">🚻 Zusätzliche Toilette</span>
                  </label>
                  
                  <div className="space-y-2">
                    <Label htmlFor="garage_spaces" className="text-sm">🚗 Garage (Stellplätze)</Label>
                    <Input
                      id="garage_spaces"
                      type="number"
                      min="0"
                      max="10"
                      value={formData.amenities.garage_spaces || 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        amenities: { ...formData.amenities, garage_spaces: parseInt(e.target.value) || 0 }
                      })}
                      className="h-8"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Abbrechen
                </Button>
                <Button
                  type="submit"
                  disabled={updateHouseMutation.isPending}
                >
                  {updateHouseMutation.isPending ? 'Speichern...' : 'Speichern'}
                </Button>
              </div>
            </form>
          </TabsContent>
          
          <TabsContent value="linen">
            <LinenInventory house={house} />
          </TabsContent>
          
          <TabsContent value="linen-management">
            <LinenManagement house={house} />
          </TabsContent>
          
          <TabsContent value="ai-settings">
            <SmartLinenSettings
              houseId={house.id}
              settings={aiSettings}
              onSettingsChange={updateAISettings}
              onSave={() => saveAISettings(house.id)}
              onLoad={loadAISettings}
              isSaving={isSavingSettings}
            />
          </TabsContent>
          
          <TabsContent value="inventory">
            <HouseInventory house={house} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default EditHouseDialog;