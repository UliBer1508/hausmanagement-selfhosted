import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { Star, Phone, Mail, MapPin, Edit2, Save, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface StaffDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  staff: any;
  onUpdate: () => void;
}

export const StaffDetailsDialog: React.FC<StaffDetailsDialogProps> = ({
  isOpen,
  onClose,
  staff,
  onUpdate
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    hourly_rate: '',
    is_active: true,
    notes: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (staff) {
      setFormData({
        name: staff.name || '',
        email: staff.email || '',
        phone: staff.phone || '',
        address: staff.address || '',
        hourly_rate: staff.hourly_rate?.toString() || '',
        is_active: staff.is_active ?? true,
        notes: staff.notes || ''
      });
    }
  }, [staff]);

  if (!staff) return null;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const renderStarRating = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
            }`}
          />
        ))}
        <span className="ml-2 text-sm text-gray-600">({rating.toFixed(1)})</span>
      </div>
    );
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Name ist erforderlich');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('cleaning_staff')
        .update({
          name: formData.name,
          email: formData.email || null,
          phone: formData.phone || null,
          address: formData.address || null,
          hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
          is_active: formData.is_active,
          notes: formData.notes || null
        })
        .eq('id', staff.id);

      if (error) throw error;

      toast.success('Putzkraft erfolgreich aktualisiert');
      setIsEditing(false);
      onUpdate();
    } catch (error: any) {
      toast.error('Fehler beim Aktualisieren: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: staff.name || '',
      email: staff.email || '',
      phone: staff.phone || '',
      address: staff.address || '',
      hourly_rate: staff.hourly_rate?.toString() || '',
      is_active: staff.is_active ?? true,
      notes: staff.notes || ''
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      // Check if staff has active assignments
      const { data: activeAssignments } = await supabase
        .from('service_tasks')
        .select('id')
        .eq('assigned_staff_id', staff.id)
        .in('status', ['scheduled', 'in_progress']);

      if (activeAssignments && activeAssignments.length > 0) {
        toast.error(`Putzkraft kann nicht gelöscht werden. Es gibt ${activeAssignments.length} aktive Aufträge.`);
        setIsLoading(false);
        return;
      }

      const { error } = await supabase
        .from('cleaning_staff')
        .delete()
        .eq('id', staff.id);

      if (error) throw error;

      toast.success('Putzkraft erfolgreich gelöscht');
      onUpdate();
      onClose();
    } catch (error: any) {
      toast.error('Fehler beim Löschen: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Putzkraft Details
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Avatar and Basic Info */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-blue-100 text-blue-600 text-lg">
                {getInitials(staff.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="Name der Putzkraft"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
                    />
                    <Label>Aktiv</Label>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-lg font-semibold">{staff.name}</h3>
                  <Badge 
                    className={`${staff.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'} border-0`}
                  >
                    {staff.is_active ? 'Aktiv' : 'Inaktiv'}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <h4 className="font-semibold">Kontaktinformationen</h4>
            
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="email">E-Mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="E-Mail-Adresse"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Telefon</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="Telefonnummer"
                  />
                </div>
                <div>
                  <Label htmlFor="address">Adresse</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    placeholder="Adresse"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {staff.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span>{staff.email}</span>
                  </div>
                )}
                {staff.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span>{staff.phone}</span>
                  </div>
                )}
                {staff.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span>{staff.address}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Performance Stats */}
          <div className="space-y-4">
            <h4 className="font-semibold">Leistung</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {staff.completed_assignments || 0}
                </div>
                <div className="text-sm text-gray-500">Abgeschlossen</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {staff.total_assignments || 0}
                </div>
                <div className="text-sm text-gray-500">Gesamt</div>
              </div>
            </div>

            {staff.quality_rating > 0 && (
              <div>
                <Label className="text-sm font-medium">Qualitätsbewertung</Label>
                {renderStarRating(staff.quality_rating)}
              </div>
            )}
          </div>

          {/* Hourly Rate */}
          <div className="space-y-2">
            <Label>Stundensatz</Label>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  value={formData.hourly_rate}
                  onChange={(e) => setFormData({...formData, hourly_rate: e.target.value})}
                  placeholder="0.00"
                />
                <span className="text-sm text-gray-500">€/Std.</span>
              </div>
            ) : (
              <div className="text-lg font-medium">
                {staff.hourly_rate ? `${staff.hourly_rate}€/Std.` : 'Nicht angegeben'}
              </div>
            )}
          </div>

          {/* Availability */}
          {staff.availability_days && staff.availability_days.length > 0 && (
            <div className="space-y-2">
              <Label>Verfügbarkeit</Label>
              <div className="flex flex-wrap gap-1">
                {staff.availability_days.map((day: string) => (
                  <Badge key={day} variant="outline">
                    {day}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notizen</Label>
            {isEditing ? (
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Zusätzliche Notizen..."
                rows={3}
              />
            ) : (
              <div className="text-sm text-gray-600 min-h-[60px] p-2 border rounded">
                {staff.notes || 'Keine Notizen verfügbar'}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t">
            {isEditing ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleCancel}
                  className="flex-1"
                  disabled={isLoading}
                >
                  <X className="h-4 w-4 mr-2" />
                  Abbrechen
                </Button>
                <Button 
                  onClick={handleSave}
                  className="flex-1"
                  disabled={isLoading}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Speichern
                </Button>
              </>
            ) : (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive"
                      size="sm"
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Löschen
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Putzkraft löschen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Möchten Sie <strong>{staff.name}</strong> wirklich löschen? 
                        Diese Aktion kann nicht rückgängig gemacht werden.
                        {staff.total_assignments > 0 && (
                          <span className="block mt-2 text-amber-600">
                            ⚠️ Diese Putzkraft hat {staff.total_assignments} Aufträge in der Historie.
                          </span>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Endgültig löschen
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Button 
                  variant="outline" 
                  onClick={onClose}
                  className="flex-1"
                >
                  Schließen
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};