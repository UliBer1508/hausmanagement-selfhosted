import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import LinenManagement from './LinenManagement';
import HouseInventory from './HouseInventory';
import SmartLinenSettings from './SmartLinenSettings';
import AdditionalFeesTab from './AdditionalFeesTab';
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
    property_type: house?.property_type || 'house',
    rental_type: house?.rental_type || 'tourist',
    max_guests: house?.max_guests || 6,
    bathrooms: house?.bathrooms || 1,
    bedrooms: house?.bedrooms || 3,
    living_area_sqm: house?.living_area_sqm || 0,
    default_cleaning_hours: house?.default_cleaning_hours || 3,
    default_linen_color: house?.default_linen_color || 'white_striped',
    external_objektnummer: house?.external_objektnummer || '',
    amenities: house?.amenities || {
      sauna: false,
      terrace: false,
      ski_cellar: false,
      garage_spaces: 0,
      glacier_view: false,
      additional_toilet: false,
    }
  });

  const [tenantInfo, setTenantInfo] = useState({
    tenant_name: house?.tenant_info?.tenant_name || '',
    tenant_email: house?.tenant_info?.tenant_email || '',
    tenant_phone: house?.tenant_info?.tenant_phone || '',
    contract_start: house?.tenant_info?.contract_start || '',
    contract_end: house?.tenant_info?.contract_end || '',
    monthly_rent: house?.tenant_info?.monthly_rent || 0,
    deposit_amount: house?.tenant_info?.deposit_amount || 0,
    payment_day: house?.tenant_info?.payment_day || 1,
    payment_method: house?.tenant_info?.payment_method || 'bank_transfer',
    notes: house?.tenant_info?.notes || ''
  });

  const [isUnlimitedContract, setIsUnlimitedContract] = useState(!house?.tenant_info?.contract_end);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(house?.image_url || null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteOldImage, setDeleteOldImage] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validierung
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Datei zu groß",
        description: "Bitte wählen Sie ein Bild unter 5MB.",
        variant: "destructive",
      });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Ungültiges Format",
        description: "Bitte wählen Sie eine Bilddatei.",
        variant: "destructive",
      });
      return;
    }

    setImageFile(file);
    
    // Markiere altes Bild zum Löschen
    if (house?.image_filename) {
      setDeleteOldImage(true);
    }
    
    // Preview erstellen
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setDeleteOldImage(false);
  };

  const handleRemoveCurrentImage = () => {
    if (!house?.image_filename) return;
    
    setDeleteOldImage(true);
    setCurrentImage(null);
    
    toast({
      title: "Bild wird entfernt",
      description: "Das Bild wird beim Speichern gelöscht.",
    });
  };
  
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
      const updates: any = {
        name: data.name,
        address: data.address,
        property_type: data.property_type,
        rental_type: data.rental_type,
        max_guests: data.max_guests,
        bathrooms: data.bathrooms,
        bedrooms: data.bedrooms,
        living_area_sqm: data.living_area_sqm || null,
        default_cleaning_hours: data.default_cleaning_hours || 3,
        default_linen_color: data.default_linen_color || 'white_striped',
        external_objektnummer: data.external_objektnummer || null,
        amenities: data.amenities,
      };

      // 1. Altes Bild löschen wenn markiert
      if (deleteOldImage && house.image_filename) {
        try {
          const { error: deleteError } = await supabase.storage
            .from('house-images')
            .remove([house.image_filename]);

          if (deleteError) {
            console.error('Delete error:', deleteError);
          }
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }

      // 2. Neues Bild hochladen wenn vorhanden
      if (imageFile) {
        setIsUploading(true);
        try {
          const fileExt = imageFile.name.split('.').pop();
          const fileName = `${crypto.randomUUID()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('house-images')
            .upload(fileName, imageFile, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            setIsUploading(false);
            throw new Error('Bild konnte nicht hochgeladen werden');
          }

          const { data: urlData } = supabase.storage
            .from('house-images')
            .getPublicUrl(fileName);

          updates.image_url = urlData.publicUrl;
          updates.image_filename = fileName;
        } finally {
          setIsUploading(false);
        }
      } else if (deleteOldImage) {
        // Bild wurde entfernt, keine neue hochgeladen
        updates.image_url = null;
        updates.image_filename = null;
      }

      // 3. Nur tenant_info speichern wenn long_term
      if (formData.rental_type === 'long_term') {
        // Leerer contract_end String wird als null gespeichert
        updates.tenant_info = {
          ...tenantInfo,
          contract_end: tenantInfo.contract_end || null
        };
      }

      // 4. Update durchführen
      const { error } = await supabase
        .from('houses')
        .update(updates)
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
        property_type: house.property_type || 'house',
        rental_type: house.rental_type || 'tourist',
        max_guests: house.max_guests || 6,
        bathrooms: house.bathrooms || 1,
        bedrooms: house.bedrooms || 3,
        living_area_sqm: house.living_area_sqm || 0,
        default_cleaning_hours: house.default_cleaning_hours || 3,
        default_linen_color: house.default_linen_color || 'white_striped',
        external_objektnummer: house.external_objektnummer || '',
        amenities: house.amenities || {
          sauna: false,
          terrace: false,
          ski_cellar: false,
          garage_spaces: 0,
          glacier_view: false,
          additional_toilet: false,
        }
      });

      // Tenant Info laden
      if (house.tenant_info) {
        setTenantInfo({
          tenant_name: house.tenant_info.tenant_name || '',
          tenant_email: house.tenant_info.tenant_email || '',
          tenant_phone: house.tenant_info.tenant_phone || '',
          contract_start: house.tenant_info.contract_start || '',
          contract_end: house.tenant_info.contract_end || '',
          monthly_rent: house.tenant_info.monthly_rent || 0,
          deposit_amount: house.tenant_info.deposit_amount || 0,
          payment_day: house.tenant_info.payment_day || 1,
          payment_method: house.tenant_info.payment_method || 'bank_transfer',
          notes: house.tenant_info.notes || ''
        });
      }
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
          <TabsList className={`grid w-full ${
            formData.rental_type === 'long_term' 
              ? 'grid-cols-4'
              : 'grid-cols-5'
          }`}>
            <TabsTrigger value="basic">Grunddaten</TabsTrigger>
            
            {formData.rental_type === 'long_term' ? (
              <TabsTrigger value="tenant">🏘️ Mietvertrag</TabsTrigger>
            ) : (
              <>
                <TabsTrigger value="linen-management">Wäsche-Management</TabsTrigger>
                <TabsTrigger value="ai-settings">KI-Einstellungen</TabsTrigger>
              </>
            )}
            
            <TabsTrigger value="fees">Nebenkosten</TabsTrigger>
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

              {/* Objektbild */}
              <div className="space-y-2">
                <Label>Objektbild</Label>
                <div className="space-y-4">
                  {/* Aktuelles Bild anzeigen */}
                  {currentImage && !imagePreview && (
                    <div className="relative">
                      <img
                        src={currentImage}
                        alt={formData.name}
                        className="w-full h-48 object-cover rounded-lg border"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={handleRemoveCurrentImage}
                      >
                        Entfernen
                      </Button>
                    </div>
                  )}

                  {/* Neue Bild-Vorschau */}
                  {imagePreview && (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="Neue Vorschau"
                        className="w-full h-48 object-cover rounded-lg border border-primary"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={handleRemoveImage}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  )}

                  {/* Upload-Button */}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    disabled={isUploading}
                  />
                  
                  {isUploading && (
                    <p className="text-sm text-muted-foreground">
                      Bild wird hochgeladen...
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="property_type">Objekttyp *</Label>
                <Select 
                  value={formData.property_type}
                  onValueChange={(value: any) => setFormData({ ...formData, property_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="house">🏠 Haus</SelectItem>
                    <SelectItem value="apartment">🏢 Wohnung</SelectItem>
                    <SelectItem value="studio">🛏️ Studio</SelectItem>
                    <SelectItem value="other">🏗️ Sonstige</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rental_type">Vermietungsart *</Label>
                <Select 
                  value={formData.rental_type}
                  onValueChange={(value: any) => setFormData({ ...formData, rental_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tourist">🏖️ Touristische Vermietung</SelectItem>
                    <SelectItem value="long_term">🏘️ Festvermietung</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.rental_type !== house.rental_type && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Achtung: Das Ändern der Vermietungsart kann Auswirkungen auf 
                    Buchungen, Wäschebestellungen und Reinigungsaufträge haben!
                  </AlertDescription>
                </Alert>
              )}

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

                <div className="space-y-2">
                  <Label htmlFor="default_cleaning_hours">Standard-Reinigungszeit (Stunden)</Label>
                  <Input
                    id="default_cleaning_hours"
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={formData.default_cleaning_hours || ''}
                    onChange={(e) => setFormData({ ...formData, default_cleaning_hours: parseFloat(e.target.value) || 3 })}
                    placeholder="z.B. 3"
                  />
                  <p className="text-sm text-muted-foreground">
                    Standardzeit für Reinigungsaufträge dieses Objekts
                  </p>
                </div>

                {formData.rental_type === 'tourist' && (
                  <div className="space-y-2">
                    <Label htmlFor="external_objektnummer">Externe Objektnummer (Wäscheportal)</Label>
                    <Input
                      id="external_objektnummer"
                      value={formData.external_objektnummer || ''}
                      onChange={(e) => setFormData({ ...formData, external_objektnummer: e.target.value })}
                      placeholder="z.B. O550634"
                    />
                    <p className="text-sm text-muted-foreground">
                      Objektnummer im externen Wäscheportal für automatische Synchronisation
                    </p>
                  </div>
                )}

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
          
          {formData.rental_type === 'long_term' && (
            <TabsContent value="tenant" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Mieter-Informationen</CardTitle>
                  <CardDescription>
                    Verwalten Sie die Daten Ihres Mieters für diese Festvermietung
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Persönliche Daten */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tenant_name">Mieter Name</Label>
                      <Input
                        id="tenant_name"
                        value={tenantInfo.tenant_name}
                        onChange={(e) => setTenantInfo({...tenantInfo, tenant_name: e.target.value})}
                        placeholder="Max Mustermann"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="tenant_email">Email</Label>
                      <Input
                        id="tenant_email"
                        type="email"
                        value={tenantInfo.tenant_email}
                        onChange={(e) => setTenantInfo({...tenantInfo, tenant_email: e.target.value})}
                        placeholder="max@example.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tenant_phone">Telefon</Label>
                      <Input
                        id="tenant_phone"
                        value={tenantInfo.tenant_phone}
                        onChange={(e) => setTenantInfo({...tenantInfo, tenant_phone: e.target.value})}
                        placeholder="+49 123 456789"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="monthly_rent">Monatliche Miete (€)</Label>
                      <Input
                        id="monthly_rent"
                        type="number"
                        value={tenantInfo.monthly_rent}
                        onChange={(e) => setTenantInfo({...tenantInfo, monthly_rent: parseFloat(e.target.value) || 0})}
                        placeholder="1200"
                      />
                    </div>
                  </div>

                  {/* Vertragsdaten */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contract_start">Vertragsbeginn</Label>
                      <Input
                        id="contract_start"
                        type="date"
                        value={tenantInfo.contract_start}
                        onChange={(e) => setTenantInfo({...tenantInfo, contract_start: e.target.value})}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="contract_end">Vertragsende</Label>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="unlimited_contract"
                            checked={isUnlimitedContract}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setIsUnlimitedContract(checked);
                              if (checked) {
                                setTenantInfo({...tenantInfo, contract_end: ''});
                              }
                            }}
                            className="h-4 w-4 rounded border-input"
                          />
                          <Label htmlFor="unlimited_contract" className="text-sm font-normal">
                            Unbefristeter Vertrag
                          </Label>
                        </div>
                        <Input
                          id="contract_end"
                          type="date"
                          value={tenantInfo.contract_end}
                          onChange={(e) => setTenantInfo({...tenantInfo, contract_end: e.target.value})}
                          disabled={isUnlimitedContract}
                          className={isUnlimitedContract ? 'bg-muted cursor-not-allowed' : ''}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Finanzielle Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="deposit_amount">Kaution (€)</Label>
                      <Input
                        id="deposit_amount"
                        type="number"
                        value={tenantInfo.deposit_amount}
                        onChange={(e) => setTenantInfo({...tenantInfo, deposit_amount: parseFloat(e.target.value) || 0})}
                        placeholder="2400"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="payment_day">Zahlungstag im Monat</Label>
                      <Input
                        id="payment_day"
                        type="number"
                        min="1"
                        max="31"
                        value={tenantInfo.payment_day}
                        onChange={(e) => setTenantInfo({...tenantInfo, payment_day: parseInt(e.target.value) || 1})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="payment_method">Zahlungsmethode</Label>
                    <Select
                      value={tenantInfo.payment_method}
                      onValueChange={(value) => setTenantInfo({...tenantInfo, payment_method: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank_transfer">Banküberweisung</SelectItem>
                        <SelectItem value="direct_debit">Lastschrift</SelectItem>
                        <SelectItem value="cash">Bar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Notizen */}
                  <div className="space-y-2">
                    <Label htmlFor="tenant_notes">Notizen</Label>
                    <Textarea
                      id="tenant_notes"
                      value={tenantInfo.notes}
                      onChange={(e) => setTenantInfo({...tenantInfo, notes: e.target.value})}
                      placeholder="Zusätzliche Informationen zum Mietverhältnis..."
                      rows={4}
                    />
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
                      type="button"
                      onClick={() => updateHouseMutation.mutate(formData)}
                      disabled={updateHouseMutation.isPending}
                    >
                      {updateHouseMutation.isPending ? 'Speichern...' : 'Speichern'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
          
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
          
          <TabsContent value="fees">
            <AdditionalFeesTab houseId={house.id} />
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