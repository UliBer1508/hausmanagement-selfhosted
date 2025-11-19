import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Plus, Save, Trash2, Settings, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface LinenSetRulesTableProps {
  house: any;
}

interface LinenItemConfig {
  label: string;
  icon: string;
  category: string;
  quantity: number;
  calculation_type: 'per_guest' | 'per_booking';
  availability: 'year_round' | 'seasonal';
  season: 'winter' | 'summer' | null;
  active: boolean;
}

const LinenSetRulesTable = ({ house }: LinenSetRulesTableProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedRules, setEditedRules] = useState<Record<string, LinenItemConfig>>({});
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    key: '',
    label: '',
    icon: '📦',
    category: 'Sonstiges',
    quantity: 1,
    calculation_type: 'per_guest' as const,
    availability: 'year_round' as const,
    season: null as null | 'winter' | 'summer',
  });

  // Fetch linen set definitions
  const { data: linenDef, isLoading } = useQuery({
    queryKey: ['linen-definitions', house?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', house.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      // Migrate old columns to custom_categories if needed
      if (data && !data.custom_categories) {
        const customCategories: Record<string, LinenItemConfig> = {};
        
        if (data.bedding_per_guest) customCategories.bedding = { label: 'Bettwäsche', icon: '🛏️', category: 'Schlafbereich', quantity: data.bedding_per_guest, calculation_type: 'per_guest', availability: 'year_round', season: null, active: true };
        if (data.large_towels_per_guest) customCategories.large_towels = { label: 'Handtücher groß', icon: '🧖', category: 'Badbereich', quantity: data.large_towels_per_guest, calculation_type: 'per_guest', availability: 'year_round', season: null, active: true };
        if (data.small_towels_per_guest) customCategories.small_towels = { label: 'Handtücher klein', icon: '🧴', category: 'Badbereich', quantity: data.small_towels_per_guest, calculation_type: 'per_guest', availability: 'year_round', season: null, active: true };
        if (data.sauna_towels_per_guest) customCategories.sauna_towels = { label: 'Saunatücher', icon: '🧖‍♂️', category: 'Wellness', quantity: data.sauna_towels_per_guest, calculation_type: 'per_guest', availability: 'year_round', season: null, active: true };
        if (data.bath_mats_per_booking) customCategories.bath_mats = { label: 'Badematten', icon: '🚿', category: 'Badbereich', quantity: data.bath_mats_per_booking, calculation_type: 'per_booking', availability: 'year_round', season: null, active: true };
        if (data.sink_towels_per_booking) customCategories.sink_towels = { label: 'WB-Handtücher', icon: '🚰', category: 'Badbereich', quantity: data.sink_towels_per_booking, calculation_type: 'per_booking', availability: 'year_round', season: null, active: true };
        if (data.kitchen_towels_per_booking) customCategories.kitchen_towels = { label: 'Küchentücher', icon: '🍽️', category: 'Küchenbereich', quantity: data.kitchen_towels_per_booking, calculation_type: 'per_booking', availability: 'year_round', season: null, active: true };
        
        return { ...data, custom_categories: customCategories };
      }
      
      return data || { custom_categories: {} };
    },
    enabled: !!house?.id,
  });

  // Update mutation
  const updateRulesMutation = useMutation({
    mutationFn: async (newRules: Record<string, LinenItemConfig>) => {
      const updateData = {
        house_id: house.id,
        custom_categories: newRules as any, // Cast to any for Json type
        // Set old columns to 0 (migration)
        bedding_per_guest: 0,
        large_towels_per_guest: 0,
        small_towels_per_guest: 0,
        sauna_towels_per_guest: 0,
        blankets_per_guest: 0,
        pillow_cases_per_guest: 0,
        bath_mats_per_booking: 0,
        sink_towels_per_booking: 0,
        kitchen_towels_per_booking: 0,
        table_linens_per_booking: 0,
      };

      const { data: existing } = await supabase
        .from('linen_set_definitions')
        .select('id')
        .eq('house_id', house.id)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('linen_set_definitions')
          .update(updateData)
          .eq('house_id', house.id)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('linen_set_definitions')
          .insert(updateData)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linen-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['ai-linen-settings'] });
      
      toast({ 
        title: '✅ Wäscheset-Regeln gespeichert',
        description: 'Bitte prüfen Sie im Tab "Preise" ob alle Artikel korrekt bepreist sind.',
      });
      
      setIsEditing(false);
    },
    onError: (error) => {
      console.error('Error saving rules:', error);
      toast({
        title: '❌ Fehler beim Speichern',
        description: 'Die Regeln konnten nicht gespeichert werden.',
        variant: 'destructive',
      });
    },
  });

  const handleStartEditing = () => {
    setEditedRules(linenDef?.custom_categories || {});
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setEditedRules({});
  };

  const handleSaveRules = () => {
    updateRulesMutation.mutate(editedRules);
  };

  const handleRuleChange = (key: string, field: string, value: any) => {
    setEditedRules(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  const handleDeleteRule = (key: string) => {
    setEditedRules(prev => {
      const newRules = { ...prev };
      delete newRules[key];
      return newRules;
    });
    
    toast({
      title: 'Wäschestück entfernt',
      description: 'Das Wäschestück wurde aus der Liste entfernt. Bitte speichern Sie die Änderungen.',
    });
  };

  const handleAddNewItem = () => {
    if (!newItem.key || !newItem.label) {
      toast({
        title: 'Fehlende Angaben',
        description: 'Bitte Key und Label eingeben.',
        variant: 'destructive',
      });
      return;
    }

    if (editedRules[newItem.key]) {
      toast({
        title: 'Key bereits vorhanden',
        description: 'Ein Wäschestück mit diesem Key existiert bereits.',
        variant: 'destructive',
      });
      return;
    }

    const config: LinenItemConfig = {
      label: newItem.label,
      icon: newItem.icon,
      category: newItem.category,
      quantity: newItem.quantity,
      calculation_type: newItem.calculation_type,
      availability: newItem.availability,
      season: newItem.season,
      active: true,
    };

    setEditedRules(prev => ({
      ...prev,
      [newItem.key]: config
    }));

    setNewItem({
      key: '',
      label: '',
      icon: '📦',
      category: 'Sonstiges',
      quantity: 1,
      calculation_type: 'per_guest',
      availability: 'year_round',
      season: null,
    });

    setIsAddDialogOpen(false);

    toast({
      title: 'Wäschestück hinzugefügt',
      description: 'Das neue Wäschestück wurde zur Liste hinzugefügt. Bitte speichern Sie die Änderungen.',
    });
  };

  const currentRules = isEditing ? editedRules : (linenDef?.custom_categories || {});
  const categories = ['Schlafbereich', 'Badbereich', 'Wellness', 'Küchenbereich', 'Sonstiges'];

  if (isLoading) {
    return <div className="text-center p-8">Lädt Wäscheset-Regeln...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Wäscheset-Regeln
            </CardTitle>
            <CardDescription>
              Definieren Sie welche Wäschestücke pro Gast oder pro Buchung benötigt werden
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {!isEditing ? (
              <Button onClick={handleStartEditing} variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Bearbeiten
              </Button>
            ) : (
              <>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Neues Wäschestück
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Neues Wäschestück hinzufügen</DialogTitle>
                      <DialogDescription>
                        Erstellen Sie ein neues benutzerdefiniertes Wäschestück
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Key (einzigartig, z.B. yoga_mats) *</Label>
                        <Input
                          value={newItem.key}
                          onChange={(e) => setNewItem({ ...newItem, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                          placeholder="z.B. yoga_mats"
                        />
                      </div>
                      <div>
                        <Label>Label (Anzeigename) *</Label>
                        <Input
                          value={newItem.label}
                          onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                          placeholder="z.B. Yoga-Matten"
                        />
                      </div>
                      <div>
                        <Label>Icon (Emoji)</Label>
                        <Input
                          value={newItem.icon}
                          onChange={(e) => setNewItem({ ...newItem, icon: e.target.value })}
                          placeholder="🧘"
                        />
                      </div>
                      <div>
                        <Label>Kategorie</Label>
                        <Select value={newItem.category} onValueChange={(value) => setNewItem({ ...newItem, category: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Menge</Label>
                        <Input
                          type="number"
                          min="0"
                          value={newItem.quantity}
                          onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                      <div>
                        <Label>Berechnung</Label>
                        <Select value={newItem.calculation_type} onValueChange={(value: any) => setNewItem({ ...newItem, calculation_type: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="per_guest">Pro Gast</SelectItem>
                            <SelectItem value="per_booking">Pro Buchung</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Verfügbarkeit</Label>
                        <Select value={newItem.availability} onValueChange={(value: any) => setNewItem({ ...newItem, availability: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="year_round">Ganzjährig</SelectItem>
                            <SelectItem value="seasonal">Saisonal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {newItem.availability === 'seasonal' && newItem.season && (
                        <div>
                          <Label>Saison</Label>
                          <Select value={newItem.season} onValueChange={(value: 'winter' | 'summer') => setNewItem({ ...newItem, season: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="winter">❄️ Winter (Nov-März)</SelectItem>
                              <SelectItem value="summer">☀️ Sommer (Mai-Sept)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                        Abbrechen
                      </Button>
                      <Button onClick={handleAddNewItem}>
                        Hinzufügen
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button onClick={handleSaveRules} disabled={updateRulesMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  {updateRulesMutation.isPending ? 'Speichern...' : 'Speichern'}
                </Button>
                <Button onClick={handleCancelEditing} variant="outline">
                  Abbrechen
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.keys(currentRules).length === 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Noch keine Wäschestücke definiert. Klicken Sie auf "Bearbeiten" und "Neues Wäschestück" um zu beginnen.
            </AlertDescription>
          </Alert>
        )}

        {categories.map(category => {
          const items = Object.entries(currentRules).filter(([_, config]) => (config as LinenItemConfig).category === category);
          if (items.length === 0) return null;

          return (
            <div key={category} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">{category}</h3>
              <div className="space-y-2">
                {items.map(([key, config]) => {
                  const linenConfig = config as LinenItemConfig;
                  return (
                    <div key={key} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                      <span className="text-2xl">{linenConfig.icon}</span>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{linenConfig.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {linenConfig.calculation_type === 'per_guest' ? '👤 Pro Gast' : '📅 Pro Buchung'}
                          </Badge>
                          {linenConfig.availability === 'seasonal' && (
                            <Badge variant="secondary" className="text-xs">
                              {linenConfig.season === 'winter' ? '❄️ Winter' : '☀️ Sommer'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            value={linenConfig.quantity}
                            onChange={(e) => handleRuleChange(key, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteRule(key)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="font-medium text-lg">{linenConfig.quantity}×</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Beispiel:</strong> Bei "Bettwäsche: 1× Pro Gast" bekommt eine Buchung mit 5 Gästen automatisch 5× Bettwäsche.
            Bei "Badematten: 3× Pro Buchung" bekommt jede Buchung genau 3 Badematten, unabhängig von der Gästezahl.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default LinenSetRulesTable;
