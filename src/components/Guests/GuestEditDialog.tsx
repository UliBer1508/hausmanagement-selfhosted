import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { User, Mail, Phone, MapPin, Loader2, FileText, Home, Calendar, CreditCard } from 'lucide-react';

interface Guest {
  id?: string;              // ID aus guests-Tabelle (optional für Legacy-Kompatibilität)
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  nationality?: string;
  guest_notes?: string;
  guest_street?: string;
  guest_city?: string;
  guest_postal_code?: string;
  guest_birth_date?: string;
  guest_travel_document?: string;
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
    guest_notes: guest.guest_notes || '',
    guest_street: guest.guest_street || '',
    guest_city: guest.guest_city || '',
    guest_postal_code: guest.guest_postal_code || '',
    guest_birth_date: guest.guest_birth_date || '',
    guest_travel_document: guest.guest_travel_document || '',
  });

  // Sync formData when dialog opens or guest changes
  useEffect(() => {
    if (open) {
      setFormData({
        guest_name: guest.guest_name || '',
        guest_email: guest.guest_email || '',
        guest_phone: guest.guest_phone || '',
        nationality: guest.nationality || '',
        guest_notes: guest.guest_notes || '',
        guest_street: guest.guest_street || '',
        guest_city: guest.guest_city || '',
        guest_postal_code: guest.guest_postal_code || '',
        guest_birth_date: guest.guest_birth_date || '',
        guest_travel_document: guest.guest_travel_document || '',
      });
    }
  }, [open, guest]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateGuestMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // SCHRITT 1: Primär in guests-Tabelle schreiben (wenn id vorhanden)
      if (guest.id) {
        const { error: guestError } = await supabase
          .from('guests')
          .update({
            name: data.guest_name,
            email: data.guest_email || null,
            phone: data.guest_phone || null,
            nationality: data.nationality || null,
            notes: data.guest_notes || null,
            street: data.guest_street || null,
            city: data.guest_city || null,
            postal_code: data.guest_postal_code || null,
            birth_date: data.guest_birth_date || null,
            travel_document: data.guest_travel_document || null,
          })
          .eq('id', guest.id);

        if (guestError) throw guestError;

        // SCHRITT 2a: Alle Buchungen mit dieser guest_id aktualisieren (Abwärtskompatibilität)
        const { error: bookingsError } = await supabase
          .from('bookings')
          .update({
            guest_name: data.guest_name,
            guest_email: data.guest_email || null,
            guest_phone: data.guest_phone || null,
            nationality: data.nationality || null,
            guest_notes: data.guest_notes || null,
            guest_street: data.guest_street || null,
            guest_city: data.guest_city || null,
            guest_postal_code: data.guest_postal_code || null,
            guest_birth_date: data.guest_birth_date || null,
            guest_travel_document: data.guest_travel_document || null,
          })
          .eq('guest_id', guest.id);

        if (bookingsError) throw bookingsError;
      } else {
        // SCHRITT 2b: Fallback - Legacy-Modus mit booking IDs
        const bookingIds = guest.bookings.map(booking => booking.id);
        
        if (bookingIds.length === 0) {
          throw new Error('Keine Buchungen für diesen Gast gefunden');
        }

        const { error } = await supabase
          .from('bookings')
          .update({
            guest_name: data.guest_name,
            guest_email: data.guest_email || null,
            guest_phone: data.guest_phone || null,
            nationality: data.nationality || null,
            guest_notes: data.guest_notes || null,
            guest_street: data.guest_street || null,
            guest_city: data.guest_city || null,
            guest_postal_code: data.guest_postal_code || null,
            guest_birth_date: data.guest_birth_date || null,
            guest_travel_document: data.guest_travel_document || null,
          })
          .in('id', bookingIds);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Gast aktualisiert",
        description: `Die Daten für ${formData.guest_name} wurden erfolgreich aktualisiert.`,
      });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['guests'] });
      queryClient.invalidateQueries({ queryKey: ['guests-with-bookings'] });
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
          {/* Persönliche Daten */}
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

          <div className="grid grid-cols-2 gap-3">
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="guest_birth_date">Geburtsdatum</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="guest_birth_date"
                  type="date"
                  value={formData.guest_birth_date}
                  onChange={(e) => handleInputChange('guest_birth_date', e.target.value)}
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
                  placeholder="DE, AT, CH..."
                  className="pl-10"
                  maxLength={2}
                />
              </div>
            </div>
          </div>

          {/* Adresse */}
          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Home className="w-4 h-4" />
              Adresse
            </h4>
            
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="guest_street">Straße</Label>
                <Input
                  id="guest_street"
                  value={formData.guest_street}
                  onChange={(e) => handleInputChange('guest_street', e.target.value)}
                  placeholder="Straße und Hausnummer"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="guest_postal_code">PLZ</Label>
                  <Input
                    id="guest_postal_code"
                    value={formData.guest_postal_code}
                    onChange={(e) => handleInputChange('guest_postal_code', e.target.value)}
                    placeholder="PLZ"
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label htmlFor="guest_city">Stadt/Ort</Label>
                  <Input
                    id="guest_city"
                    value={formData.guest_city}
                    onChange={(e) => handleInputChange('guest_city', e.target.value)}
                    placeholder="Stadt oder Ort"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Reisedokument */}
          <div className="space-y-2">
            <Label htmlFor="guest_travel_document">Reisedokument Nr.</Label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="guest_travel_document"
                value={formData.guest_travel_document}
                onChange={(e) => handleInputChange('guest_travel_document', e.target.value)}
                placeholder="Pass- oder Ausweisnummer"
                className="pl-10"
              />
            </div>
          </div>

          {/* Notizen */}
          <div className="space-y-2">
            <Label htmlFor="guest_notes">Notizen & Vorlieben</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Textarea
                id="guest_notes"
                value={formData.guest_notes}
                onChange={(e) => handleInputChange('guest_notes', e.target.value)}
                placeholder="z.B. Allergiker, bevorzugt Erdgeschoss, Stammgast-Extras..."
                className="pl-10 min-h-[80px]"
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
            <strong>Hinweis:</strong>{' '}
            {guest.id ? (
              <>Die Änderungen werden im Gast-Profil und allen {guest.bookings.length} verknüpften Buchung(en) gespeichert.</>
            ) : (
              <>Die Änderungen werden auf alle {guest.bookings.length} Buchung(en) dieses Gastes angewendet.</>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GuestEditDialog;
