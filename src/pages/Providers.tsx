import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import AppLayout from '@/components/Layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, Mail, Phone, Building2, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

// Validation schema
const providerSchema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich').max(100),
  service_type: z.enum(['cleaning', 'laundry']),
  contact_email: z.string().trim().email('Ungültige E-Mail-Adresse').max(255),
  contact_phone: z.string().trim().max(50),
  is_active: z.boolean(),
  has_portal: z.boolean()
});

type ProviderFormData = z.infer<typeof providerSchema>;

const Providers = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<any>(null);
  const [formData, setFormData] = useState<ProviderFormData>({
    name: '',
    service_type: 'cleaning',
    contact_email: '',
    contact_phone: '',
    is_active: true,
    has_portal: false
  });

  // Fetch all providers
  const { data: providers, isLoading } = useQuery({
    queryKey: ['service-providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_providers')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    }
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: ProviderFormData) => {
      const validated = providerSchema.parse(data);
      const { error } = await supabase
        .from('service_providers')
        .insert([{
          name: validated.name,
          service_type: validated.service_type,
          contact_email: validated.contact_email,
          contact_phone: validated.contact_phone,
          is_active: validated.is_active,
          has_portal: validated.has_portal
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-providers'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: 'Provider erstellt',
        description: 'Der Service Provider wurde erfolgreich erstellt.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Provider konnte nicht erstellt werden.',
        variant: 'destructive'
      });
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProviderFormData }) => {
      const validated = providerSchema.parse(data);
      const { error } = await supabase
        .from('service_providers')
        .update({
          name: validated.name,
          service_type: validated.service_type,
          contact_email: validated.contact_email,
          contact_phone: validated.contact_phone,
          is_active: validated.is_active,
          has_portal: validated.has_portal
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-providers'] });
      setEditingProvider(null);
      resetForm();
      toast({
        title: 'Provider aktualisiert',
        description: 'Die Änderungen wurden gespeichert.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Provider konnte nicht aktualisiert werden.',
        variant: 'destructive'
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_providers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-providers'] });
      toast({
        title: 'Provider gelöscht',
        description: 'Der Service Provider wurde entfernt.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message || 'Provider konnte nicht gelöscht werden.',
        variant: 'destructive'
      });
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      service_type: 'cleaning',
      contact_email: '',
      contact_phone: '',
      is_active: true,
      has_portal: false
    });
  };

  const handleCreate = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (provider: any) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      service_type: provider.service_type,
      contact_email: provider.contact_email || '',
      contact_phone: provider.contact_phone || '',
      is_active: provider.is_active,
      has_portal: provider.has_portal || false
    });
  };

  const handleSubmit = () => {
    if (editingProvider) {
      updateMutation.mutate({ id: editingProvider.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Möchten Sie diesen Provider wirklich löschen?')) {
      deleteMutation.mutate(id);
    }
  };

  const getServiceTypeBadge = (type: string) => {
    const badges = {
      cleaning: { label: 'Reinigung', variant: 'default' as const },
      laundry: { label: 'Wäscherei', variant: 'secondary' as const }
    };
    const badge = badges[type as keyof typeof badges] || badges.cleaning;
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Service Provider</h1>
            <p className="text-muted-foreground mt-2">
              Verwalten Sie Ihre Dienstleister für Reinigung, Wäscherei und mehr
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Neuer Provider
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8">Lade Provider...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {providers?.map((provider) => (
              <Card key={provider.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                    </div>
                    {provider.is_active ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                  <CardDescription>
                    {getServiceTypeBadge(provider.service_type)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    {provider.contact_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span className="truncate">{provider.contact_email}</span>
                      </div>
                    )}
                    {provider.contact_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{provider.contact_phone}</span>
                      </div>
                    )}
                    {provider.has_portal && (
                      <Badge variant="outline" className="text-xs">
                        Portal aktiviert
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(provider)}
                      className="flex-1"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Bearbeiten
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(provider.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog
          open={isCreateDialogOpen || !!editingProvider}
          onOpenChange={(open) => {
            if (!open) {
              setIsCreateDialogOpen(false);
              setEditingProvider(null);
              resetForm();
            }
          }}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingProvider ? 'Provider bearbeiten' : 'Neuer Provider'}
              </DialogTitle>
              <DialogDescription>
                Geben Sie die Informationen für den Service Provider ein.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. Reinigungsservice Müller"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="service_type">Service-Typ *</Label>
                <Select
                  value={formData.service_type}
                  onValueChange={(value: any) => setFormData({ ...formData, service_type: value })}
                >
                  <SelectTrigger id="service_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cleaning">Reinigung</SelectItem>
                    <SelectItem value="laundry">Wäscherei</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-Mail *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  placeholder="kontakt@provider.de"
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  placeholder="+43 123 456789"
                  maxLength={50}
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Aktiv</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.has_portal}
                    onChange={(e) => setFormData({ ...formData, has_portal: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Portal-Zugang</span>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setEditingProvider(null);
                  resetForm();
                }}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Wird gespeichert...'
                  : editingProvider
                  ? 'Speichern'
                  : 'Erstellen'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default Providers;
