import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Settings, Users, Calendar, Save, RotateCcw } from 'lucide-react';

interface LinenSetRulesTabProps {
  house: any;
}

interface LinenRule {
  key: string;
  label: string;
  type: 'per_guest' | 'per_booking';
  category: string;
  defaultValue: number;
}

const LinenSetRulesTab = ({ house }: LinenSetRulesTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedRules, setEditedRules] = useState<Record<string, number>>({});

  // Fetch current linen set definitions
  const { data: linenDef, isLoading } = useQuery({
    queryKey: ['linen-definitions', house?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', house.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data || {
        bedding_per_guest: 1,
        large_towels_per_guest: 1,
        small_towels_per_guest: 1,
        sauna_towels_per_guest: 1,
        blankets_per_guest: 1,
        pillow_cases_per_guest: 1,
        bath_mats_per_booking: 3,
        sink_towels_per_booking: 3,
        kitchen_towels_per_booking: 2,
        table_linens_per_booking: 0
      };
    },
    enabled: !!house?.id,
  });

  // Define linen rules structure
  const linenRules: LinenRule[] = [
    // Per Guest Rules
    { key: 'bedding_per_guest', label: 'Bettwäsche', type: 'per_guest', category: 'Schlafbereich', defaultValue: 1 },
    { key: 'blankets_per_guest', label: 'Decken', type: 'per_guest', category: 'Schlafbereich', defaultValue: 1 },
    { key: 'pillow_cases_per_guest', label: 'Kissenbezüge', type: 'per_guest', category: 'Schlafbereich', defaultValue: 1 },
    { key: 'large_towels_per_guest', label: 'Handtücher groß', type: 'per_guest', category: 'Badbereich', defaultValue: 1 },
    { key: 'small_towels_per_guest', label: 'Handtücher klein', type: 'per_guest', category: 'Badbereich', defaultValue: 1 },
    { key: 'sauna_towels_per_guest', label: 'Saunatücher', type: 'per_guest', category: 'Wellness', defaultValue: 1 },
    // Per Booking Rules
    { key: 'bath_mats_per_booking', label: 'Badematten', type: 'per_booking', category: 'Badbereich', defaultValue: 3 },
    { key: 'sink_towels_per_booking', label: 'Waschbecken-Handtücher', type: 'per_booking', category: 'Badbereich', defaultValue: 3 },
    { key: 'kitchen_towels_per_booking', label: 'Küchentücher', type: 'per_booking', category: 'Küchenbereich', defaultValue: 2 },
    { key: 'table_linens_per_booking', label: 'Tischwäsche', type: 'per_booking', category: 'Küchenbereich', defaultValue: 0 },
  ];

  // Update linen definitions mutation
  const updateRulesMutation = useMutation({
    mutationFn: async (newRules: Record<string, number>) => {
      const updateData = {
        house_id: house.id,
        ...newRules,
        custom_categories: (linenDef && 'custom_categories' in linenDef) ? linenDef.custom_categories : {}
      };

      // Check if record exists
      const { data: existing } = await supabase
        .from('linen_set_definitions')
        .select('id')
        .eq('house_id', house.id)
        .maybeSingle();

      let data, error;

      if (existing) {
        // Update existing record
        ({ data, error } = await supabase
          .from('linen_set_definitions')
          .update(updateData)
          .eq('house_id', house.id)
          .select()
          .single());
      } else {
        // Insert new record
        ({ data, error } = await supabase
          .from('linen_set_definitions')
          .insert(updateData)
          .select()
          .single());
      }

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linen-definitions', house.id] });
      toast({
        title: "Wäscheset-Regeln aktualisiert",
        description: "Die Regeln wurden erfolgreich gespeichert.",
      });
      setIsEditing(false);
      setEditedRules({});
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: "Die Regeln konnten nicht gespeichert werden.",
        variant: "destructive",
      });
      console.error('Error updating linen rules:', error);
    },
  });

  const handleStartEditing = () => {
    setIsEditing(true);
    setEditedRules(linenDef || {});
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setEditedRules({});
  };

  const handleSaveRules = () => {
    updateRulesMutation.mutate(editedRules);
  };

  const handleRuleChange = (ruleKey: string, value: number) => {
    setEditedRules(prev => ({
      ...prev,
      [ruleKey]: Math.max(0, value)
    }));
  };

  const getCurrentValue = (ruleKey: string) => {
    if (isEditing) {
      return editedRules[ruleKey] ?? linenDef?.[ruleKey] ?? 0;
    }
    return linenDef?.[ruleKey] ?? 0;
  };

  const categorizeRules = () => {
    const categories = linenRules.reduce((acc, rule) => {
      if (!acc[rule.category]) {
        acc[rule.category] = [];
      }
      acc[rule.category].push(rule);
      return acc;
    }, {} as Record<string, LinenRule[]>);

    return categories;
  };

  const categorizedRules = categorizeRules();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Wäscheset-Regeln werden geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6 text-primary" />
              <div>
                <CardTitle>Wäscheset-Regeln für {house.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Definieren Sie, wie viel Wäsche pro Gast und pro Buchung benötigt wird
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {!isEditing ? (
                <Button onClick={handleStartEditing}>
                  <Settings className="w-4 h-4 mr-2" />
                  Bearbeiten
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={handleCancelEditing}
                    disabled={updateRulesMutation.isPending}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Abbrechen
                  </Button>
                  <Button 
                    onClick={handleSaveRules}
                    disabled={updateRulesMutation.isPending}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updateRulesMutation.isPending ? 'Speichern...' : 'Speichern'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Rule Categories */}
      {Object.entries(categorizedRules).map(([category, rules]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-lg">{category}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rules.map((rule) => (
                <div key={rule.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      {rule.type === 'per_guest' ? (
                        <Users className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Calendar className="w-4 h-4 text-green-500" />
                      )}
                      {rule.label}
                    </Label>
                    <Badge variant="outline" className="text-xs">
                      {rule.type === 'per_guest' ? 'Pro Gast' : 'Pro Buchung'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      value={getCurrentValue(rule.key)}
                      onChange={(e) => handleRuleChange(rule.key, parseInt(e.target.value) || 0)}
                      disabled={!isEditing}
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">
                      {rule.type === 'per_guest' ? 'Stück pro Gast' : 'Stück pro Buchung'}
                    </span>
                  </div>
                  
                  {/* Example calculation */}
                  <div className="text-xs text-muted-foreground">
                    <span>Beispiel: </span>
                    {rule.type === 'per_guest' ? (
                      <span>5 Gäste = {getCurrentValue(rule.key) * 5} {rule.label}</span>
                    ) : (
                      <span>1 Buchung = {getCurrentValue(rule.key)} {rule.label}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Info Box */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="space-y-2">
            <h4 className="font-medium text-blue-900">Wie funktionieren die Regeln?</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 mt-0.5 text-blue-600" />
                <span><strong>Pro Gast:</strong> Wird mit der Anzahl Gäste multipliziert</span>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 mt-0.5 text-green-600" />
                <span><strong>Pro Buchung:</strong> Feste Menge pro Buchung, unabhängig von Gästezahl</span>
              </div>
            </div>
            <p className="text-xs text-blue-700 mt-3">
              <strong>Beispiel:</strong> 5 Gäste brauchen: 5x Bettwäsche + 5x Handtücher + 3x Badematten (fix pro Buchung)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LinenSetRulesTab;