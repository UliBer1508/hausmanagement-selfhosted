import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { User, Mail, Phone, MapPin, Loader2 } from 'lucide-react';

interface Guest {
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  nationality?: string;
  bookings: any[];
  total_revenue: number;
  last_booking?: any;
  next_booking?: any;
  stay_count: number;
  category: 'new' | 'returning';
}

interface GuestEditDialogProps {
  guest: Guest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GuestEditDialog = ({ guest, open, onOpenChange }: GuestEditDialogProps) => {
  const [formData, setFormData] = useState({
    guest_name: guest.guest_name || '',
    guest_email: guest.guest_email || '',
    guest_phone: guest.guest_phone || '',
    nationality: guest.nationality || '',
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateGuestMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Update all bookings for this guest
      const bookingIds = guest.bookings.map(booking => booking.id);
      
      if (bookingIds.length === 0) {
        throw new Error('Keine Buchungen für diesen Gast gefunden');
      }

      const { data: updatedBookings, error } = await supabase
        .from('bookings')
        .update({
          guest_name: data.guest_name,
          guest_email: data.guest_email || null,
          guest_phone: data.guest_phone || null,
          nationality: data.nationality || null,
        })
        .in('id', bookingIds)
        .select();

      if (error) throw error;
      return updatedBookings;
    },
    onSuccess: () => {
      toast({
        title: "Gast aktualisiert",
        description: `Die Daten für ${formData.guest_name} wurden erfolgreich aktualisiert.`,
      });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Fehler beim Aktualisieren des Gastes:', error);
      toast({
        title: "Fehler",
        description: "Die Gast-Daten konnten nicht aktualisiert werden.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.guest_name.trim()) {
      toast({
        title: "Fehler",
        description: "Der Name des Gastes ist erforderlich.",
        variant: "destructive",
      });
      return;
    }

    updateGuestMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Gast bearbeiten
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Aktualisieren Sie die Kontaktinformationen des Gastes
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="guest_name">Name *</Label>
            <div className="relative">
              <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="guest_name"
                value={formData.guest_name}
                onChange={(e) => handleInputChange('guest_name', e.target.value)}
                placeholder="Name des Gastes"
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest_email">E-Mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="guest_email"
                type="email"
                value={formData.guest_email}
                onChange={(e) => handleInputChange('guest_email', e.target.value)}
                placeholder="E-Mail-Adresse"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest_phone">Telefon</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="guest_phone"
                value={formData.guest_phone}
                onChange={(e) => handleInputChange('guest_phone', e.target.value)}
                placeholder="Telefonnummer"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nationality">Nationalität</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="nationality"
                value={formData.nationality}
                onChange={(e) => handleInputChange('nationality', e.target.value)}
                placeholder="DE, AT, CH, etc."
                className="pl-10"
                maxLength={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateGuestMutation.isPending}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={updateGuestMutation.isPending}
            >
              {updateGuestMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Speichern
            </Button>
          </div>
        </form>

        <div className="mt-4 p-3 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Hinweis:</strong> Die Änderungen werden auf alle {guest.bookings.length} Buchung(en) 
            dieses Gastes angewendet.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GuestEditDialog;