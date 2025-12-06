import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LinenItemConfig, LINEN_CATEGORIES, ItemColor, ITEM_COLORS } from '@/types/linen';
import { generateKeyFromLabel, validateLinenKey } from '@/lib/linenMigration';

interface LinenItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (item: LinenItemConfig) => void;
  existingKeys: string[];
}

const CATEGORY_ICONS: Record<string, string[]> = {
  'Schlafbereich': ['🛏️', '🛌', '💤', '🏠'],
  'Badbereich': ['🛁', '🚿', '🧺', '🚽'],
  'Wellness': ['🧖', '💆', '🧘', '💆‍♀️'],
  'Küchenbereich': ['🍴', '🍽️', '🥄', '🍳']
};

export const LinenItemDialog = ({ open, onOpenChange, onSave, existingKeys }: LinenItemDialogProps) => {
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState<LinenItemConfig['category']>('Schlafbereich');
  const [quantity, setQuantity] = useState(1);
  const [calculationType, setCalculationType] = useState<'per_guest' | 'per_booking'>('per_guest');
  const [availability, setAvailability] = useState<'year_round' | 'seasonal'>('year_round');
  const [season, setSeason] = useState<'winter' | 'summer' | null>(null);
  const [itemColor, setItemColor] = useState<ItemColor>('white');

  const handleSave = () => {
    if (!label.trim()) return;

    const key = generateKeyFromLabel(label, existingKeys);

    const newItem: LinenItemConfig = {
      key,
      label: label.trim(),
      icon: icon || CATEGORY_ICONS[category][0],
      category,
      quantity,
      calculation_type: calculationType,
      availability,
      season: availability === 'seasonal' ? season : null,
      active: true,
      color: category === 'Badbereich' ? itemColor : undefined
    };

    onSave(newItem);
    handleReset();
    onOpenChange(false);
  };

  const handleReset = () => {
    setLabel('');
    setIcon('');
    setCategory('Schlafbereich');
    setQuantity(1);
    setCalculationType('per_guest');
    setAvailability('year_round');
    setSeason(null);
    setItemColor('white');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Neues Wäsche-Item</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="label">Name *</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="z.B. Yogamatten"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">Kategorie *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINEN_CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="icon">Icon (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="Emoji"
                maxLength={2}
                className="w-20"
              />
              <div className="flex gap-1 items-center">
                {CATEGORY_ICONS[category].map(emoji => (
                  <Button
                    key={emoji}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIcon(emoji)}
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="quantity">Anzahl</Label>
            <Input
              id="quantity"
              type="number"
              min={0}
              max={99}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Berechnung</Label>
            <Select value={calculationType} onValueChange={(v) => setCalculationType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="per_guest">pro Gast</SelectItem>
                <SelectItem value="per_booking">pro Buchung</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Verfügbarkeit</Label>
            <Select 
              value={availability} 
              onValueChange={(v) => {
                setAvailability(v as any);
                if (v === 'year_round') setSeason(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year_round">ganzes Jahr</SelectItem>
                <SelectItem value="seasonal">saisonal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {availability === 'seasonal' && (
            <div className="grid gap-2">
              <Label>Saison</Label>
              <Select value={season || ''} onValueChange={(v) => setSeason(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Saison wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="winter">Winter (Okt-Apr)</SelectItem>
                  <SelectItem value="summer">Sommer (Mai-Sep)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {category === 'Badbereich' && (
            <div className="grid gap-2">
              <Label>Artikelfarbe</Label>
              <Select value={itemColor} onValueChange={(v) => setItemColor(v as ItemColor)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_COLORS.map(c => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.icon} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={!label.trim() || (availability === 'seasonal' && !season)}>
            Hinzufügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
