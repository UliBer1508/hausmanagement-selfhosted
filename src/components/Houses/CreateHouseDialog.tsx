import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface CreateHouseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateHouseDialog = ({ open, onOpenChange }: CreateHouseDialogProps) => {
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    max_guests: 6,
    bathrooms: 1,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createHouseMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: house, error } = await supabase
        .from('houses')
        .insert([{
          name: data.name,
          address: data.address,
          max_guests: data.max_guests,
          bathrooms: data.bathrooms,
          linen_stock: {
            bedding: 0,
            large_towels: 0,
            small_towels: 0,
            sauna_towels: 0,
            bath_mats: 0,
            sink_towels: 0,
            blankets: 0,
            kitchen_towels: 0,
            pillow_cases: 0
          },
          linen_dirty: {},
          linen_in_cleaning: {},
          linen_in_use: {},
          linen_reserved: {},
          ordered_linen: {}
        }])
        .select()
        .single();

      if (error) throw error;

      // Create default linen set definitions
      const { error: linenDefError } = await supabase
        .from('linen_set_definitions')
        .insert([{
          house_id: house.id,
          bedding_per_guest: 1,
          large_towels_per_guest: 1,
          small_towels_per_guest: 1,
          sauna_towels_per_guest: 0,
          bath_mats_per_booking: 3,
          sink_towels_per_booking: 3,
          kitchen_towels_per_booking: 2,
          table_linens_per_booking: 0,
          blankets_per_guest: 0,
          pillow_cases_per_guest: 0
        }]);

      if (linenDefError) throw linenDefError;

      return house;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['houses-full'] });
      toast({
        title: "Haus erstellt",
        description: "Das neue Haus wurde erfolgreich erstellt.",
      });
      onOpenChange(false);
      setFormData({
        name: '',
        address: '',
        max_guests: 6,
        bathrooms: 1,
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Das Haus konnte nicht erstellt werden.",
        variant: "destructive",
      });
      console.error('Error creating house:', error);
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
    createHouseMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Neues Haus erstellen</DialogTitle>
        </DialogHeader>
        
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
              disabled={createHouseMutation.isPending}
            >
              {createHouseMutation.isPending ? 'Erstellen...' : 'Erstellen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateHouseDialog;