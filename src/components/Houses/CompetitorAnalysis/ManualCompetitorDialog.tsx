import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { PenSquare } from 'lucide-react';
import { manualCompetitorSchema, type ManualCompetitorFormData } from './schemas/ManualCompetitorSchema';
import AmenitiesSelect from './AmenitiesSelect';
import { useAddCompetitor } from '@/hooks/useCompetitorAnalysis';

interface ManualCompetitorDialogProps {
  house_id: string;
}

const ManualCompetitorDialog = ({ house_id }: ManualCompetitorDialogProps) => {
  const [open, setOpen] = useState(false);
  const addCompetitor = useAddCompetitor();

  const form = useForm<ManualCompetitorFormData>({
    resolver: zodResolver(manualCompetitorSchema),
    defaultValues: {
      property_name: '',
      competitor_name: '',
      platform: 'booking.com',
      property_url: '',
      address: '',
      distance_km: undefined,
      max_guests: undefined,
      bedrooms: undefined,
      bathrooms: undefined,
      rating: undefined,
      review_count: undefined,
      notes: '',
      amenities: [],
      enable_scraping: false,
    },
  });

  const onSubmit = async (data: ManualCompetitorFormData) => {
    try {
      // Convert empty strings to undefined for optional number fields
      const cleanedData = {
        ...data,
        distance_km: data.distance_km || undefined,
        max_guests: data.max_guests || undefined,
        bedrooms: data.bedrooms || undefined,
        bathrooms: data.bathrooms || undefined,
        rating: data.rating || undefined,
        review_count: data.review_count || undefined,
        property_url: data.property_url || undefined,
        address: data.address || undefined,
        notes: data.notes || undefined,
        amenities: data.amenities && data.amenities.length > 0 ? data.amenities : undefined,
      };

      await addCompetitor.mutateAsync({
        house_id,
        competitor_data: cleanedData,
        enable_scraping: data.enable_scraping && !!data.property_url,
      });

      form.reset();
      setOpen(false);
    } catch (error) {
      console.error('Error adding competitor:', error);
    }
  };

  const onSubmitAndAddAnother = async (data: ManualCompetitorFormData) => {
    await onSubmit(data);
    form.reset();
    // Keep dialog open for next entry
  };

  const propertyUrl = form.watch('property_url');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PenSquare className="w-4 h-4 mr-2" />
          Manuell hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wettbewerber manuell hinzufügen</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basis-Informationen */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">BASIS-INFORMATIONEN (Pflicht)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="property_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. Alpine Chalet Hochkönig" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="competitor_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Competitor Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. Thomas Müller" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="platform"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plattform *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Plattform wählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="booking.com">Booking.com</SelectItem>
                          <SelectItem value="airbnb">Airbnb</SelectItem>
                          <SelectItem value="vrbo">VRBO</SelectItem>
                          <SelectItem value="fewo-direkt">FeWo-Direkt</SelectItem>
                          <SelectItem value="other">Andere</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="property_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">DETAILS (Optional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adresse</FormLabel>
                      <FormControl>
                        <Input placeholder="Straße, PLZ, Ort" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="distance_km"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Entfernung (km)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" placeholder="z.B. 2.5" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="max_guests"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max. Gäste</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="z.B. 8" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="rating"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bewertung (0-10)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" placeholder="z.B. 8.5" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bedrooms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Schlafzimmer</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="z.B. 3" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="review_count"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anzahl Bewertungen</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="z.B. 150" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bathrooms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Badezimmer</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="z.B. 2" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Ausstattung */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">AUSSTATTUNG</h3>
              <FormField
                control={form.control}
                name="amenities"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <AmenitiesSelect
                        value={field.value || []}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Notizen */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notizen</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Zusätzliche Informationen..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Scraping Option */}
            {propertyUrl && (
              <FormField
                control={form.control}
                name="enable_scraping"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Preis-Scraping aktivieren
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Preise werden automatisch von der angegebenen URL abgerufen
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Abbrechen
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={form.handleSubmit(onSubmitAndAddAnother)}
                disabled={addCompetitor.isPending}
              >
                Speichern & Neuen hinzufügen
              </Button>
              <Button type="submit" disabled={addCompetitor.isPending}>
                {addCompetitor.isPending ? 'Speichere...' : 'Speichern'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ManualCompetitorDialog;
