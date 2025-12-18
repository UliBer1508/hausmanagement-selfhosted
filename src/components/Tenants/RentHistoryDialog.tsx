import { useState } from 'react';
import { format, parseISO, isFuture } from 'date-fns';
import { de } from 'date-fns/locale';
import { TrendingUp, Plus, Trash2, X, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { House } from '@/types';
import {
  useTenantRentChanges,
  useCreateRentChange,
  useDeleteRentChange,
  TenantRentChange,
  getActiveRent,
  getActiveAdditionalCosts,
} from '@/hooks/useTenantRentChanges';

interface RentHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  house: House;
}

const REASON_OPTIONS = [
  { value: 'index', label: 'Indexanpassung' },
  { value: 'staffel', label: 'Staffelmiete' },
  { value: 'contract', label: 'Vertragsänderung' },
  { value: 'other', label: 'Sonstige' },
];

export function RentHistoryDialog({ open, onOpenChange, house }: RentHistoryDialogProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    effective_date: '',
    new_rent: '',
    new_additional_costs: '',
    reason: '',
    notes: '',
  });

  const { data: rentChanges = [], isLoading } = useTenantRentChanges(house.id);
  const createMutation = useCreateRentChange();
  const deleteMutation = useDeleteRentChange();

  const baseMonthlyRent = house.tenant_info?.monthly_rent || 0;
  const baseAdditionalCosts = house.tenant_info?.additional_costs || 0;
  const currentRent = getActiveRent(rentChanges, baseMonthlyRent);
  const currentAdditionalCosts = getActiveAdditionalCosts(rentChanges, baseAdditionalCosts);
  const currentWarmmiete = currentRent + currentAdditionalCosts;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.effective_date || !formData.new_rent) {
      return;
    }

    // Finde die vorherige Miete
    const prevRent = getActiveRent(
      rentChanges,
      baseMonthlyRent,
      parseISO(formData.effective_date)
    );
    const prevAdditionalCosts = getActiveAdditionalCosts(
      rentChanges,
      baseAdditionalCosts,
      parseISO(formData.effective_date)
    );

    await createMutation.mutateAsync({
      house_id: house.id,
      effective_date: formData.effective_date,
      new_rent: parseFloat(formData.new_rent),
      old_rent: prevRent,
      new_additional_costs: formData.new_additional_costs ? parseFloat(formData.new_additional_costs) : undefined,
      old_additional_costs: formData.new_additional_costs ? prevAdditionalCosts : undefined,
      reason: formData.reason || undefined,
      notes: formData.notes || undefined,
    });

    setFormData({ effective_date: '', new_rent: '', new_additional_costs: '', reason: '', notes: '' });
    setShowAddForm(false);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteMutation.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Miethistorie - {house.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Aktuelle Miete */}
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Kaltmiete</div>
                  <div className="font-semibold">{formatCurrency(currentRent)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Nebenkosten</div>
                  <div className="font-semibold">{formatCurrency(currentAdditionalCosts)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Warmmiete</div>
                  <div className="text-xl font-bold">{formatCurrency(currentWarmmiete)}</div>
                </div>
              </div>
              {(baseMonthlyRent !== currentRent || baseAdditionalCosts !== currentAdditionalCosts) && (
                <div className="text-xs text-muted-foreground">
                  (Ursprünglich: Kaltmiete {formatCurrency(baseMonthlyRent)}, NK {formatCurrency(baseAdditionalCosts)})
                </div>
              )}
            </div>

            {/* Mietänderungen Liste */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Änderungen</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddForm(!showAddForm)}
                >
                  {showAddForm ? (
                    <>
                      <X className="h-4 w-4 mr-1" /> Abbrechen
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-1" /> Neue Änderung
                    </>
                  )}
                </Button>
              </div>

              {/* Add Form */}
              {showAddForm && (
                <form onSubmit={handleSubmit} className="p-4 border rounded-lg space-y-3 bg-background">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="effective_date">Gültig ab</Label>
                      <Input
                        id="effective_date"
                        type="date"
                        value={formData.effective_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, effective_date: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new_rent">Neue Kaltmiete (€)</Label>
                      <Input
                        id="new_rent"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="1500.00"
                        value={formData.new_rent}
                        onChange={(e) => setFormData(prev => ({ ...prev, new_rent: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new_additional_costs">Neue Nebenkosten (€, optional)</Label>
                    <Input
                      id="new_additional_costs"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="220.00"
                      value={formData.new_additional_costs}
                      onChange={(e) => setFormData(prev => ({ ...prev, new_additional_costs: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="reason">Grund</Label>
                    <Select
                      value={formData.reason}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, reason: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Grund auswählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {REASON_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="notes">Notizen (optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Zusätzliche Informationen..."
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      rows={2}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    <Check className="h-4 w-4 mr-1" />
                    Speichern
                  </Button>
                </form>
              )}

              {/* Liste */}
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Lade Miethistorie...
                </div>
              ) : rentChanges.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                  Keine Änderungen vorhanden
                </div>
              ) : (
                <div className="space-y-2">
                  {rentChanges.map((change) => {
                    const isFutureChange = isFuture(parseISO(change.effective_date));
                    const rentDiff = change.old_rent ? change.new_rent - change.old_rent : 0;
                    const additionalCostsDiff = (change.old_additional_costs && change.new_additional_costs) 
                      ? change.new_additional_costs - change.old_additional_costs 
                      : 0;
                    const reasonLabel = REASON_OPTIONS.find(r => r.value === change.reason)?.label;

                    return (
                      <div
                        key={change.id}
                        className={`p-3 border rounded-lg ${isFutureChange ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800' : ''}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {format(parseISO(change.effective_date), 'dd.MM.yyyy', { locale: de })}
                              </span>
                              {isFutureChange && (
                                <Badge variant="outline" className="text-amber-600 border-amber-400">
                                  ⏰ Geplant
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm space-y-0.5">
                              <div>
                                <span className="text-muted-foreground">Kaltmiete:</span>{' '}
                                <span className="font-semibold">{formatCurrency(change.new_rent)}</span>
                                {rentDiff !== 0 && (
                                  <span className={`text-xs ml-1 ${rentDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    ({rentDiff > 0 ? '+' : ''}{formatCurrency(rentDiff)})
                                  </span>
                                )}
                              </div>
                              {change.new_additional_costs !== null && change.new_additional_costs !== undefined && (
                                <div>
                                  <span className="text-muted-foreground">Nebenkosten:</span>{' '}
                                  <span className="font-semibold">{formatCurrency(change.new_additional_costs)}</span>
                                  {additionalCostsDiff !== 0 && (
                                    <span className={`text-xs ml-1 ${additionalCostsDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                      ({additionalCostsDiff > 0 ? '+' : ''}{formatCurrency(additionalCostsDiff)})
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {reasonLabel && (
                              <div className="text-xs text-muted-foreground">{reasonLabel}</div>
                            )}
                            {change.notes && (
                              <div className="text-xs text-muted-foreground italic">{change.notes}</div>
                            )}
                          </div>
                          {isFutureChange && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(change.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Änderung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese geplante Änderung wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}