import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LinenItemConfig, LINEN_CATEGORIES, ItemColor, ITEM_COLORS, LinenColor, LINEN_COLORS } from '@/types/linen';
import { generateKeyFromLabel, validateLinenKey } from '@/lib/linenMigration';

interface LinenItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (item: LinenItemConfig) => void;
  existingKeys: string[];
  /*
   * Zu bearbeitende Zeile (05.09.2026). Fehlt sie, wird eine neue angelegt.
   *
   * WICHTIG: Beim Bearbeiten bleibt der `key` UNVERAENDERT. Er ist die
   * Kennung, unter der die Position in linen_orders.items und in den
   * `alte_schluessel` anderer Zeilen steht. Wuerde er sich mit dem Namen
   * aendern, verloeren alle bisherigen Bestellungen ihre Zuordnung — genau
   * das ist frueher mit `bedding` passiert und hat elf Codestellen ins
   * Leere laufen lassen. Der Name ist eine Beschriftung, der Schluessel
   * eine Kennung; nur das eine ist aenderbar.
   */
  bearbeiten?: LinenItemConfig | null;
}

const CATEGORY_ICONS: Record<string, string[]> = {
  'Schlafbereich': ['🛏️', '🛌', '💤', '🏠'],
  'Badbereich': ['🛁', '🚿', '🧺', '🚽'],
  'Wellness': ['🧖', '💆', '🧘', '💆‍♀️'],
  'Küchenbereich': ['🍴', '🍽️', '🥄', '🍳']
};

export const LinenItemDialog = ({ open, onOpenChange, onSave, existingKeys, bearbeiten }: LinenItemDialogProps) => {
  const istBearbeitung = !!bearbeiten;
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState<LinenItemConfig['category']>('Schlafbereich');
  const [quantity, setQuantity] = useState(1);
  const [calculationType, setCalculationType] = useState<'per_guest' | 'per_booking'>('per_guest');
  const [availability, setAvailability] = useState<'year_round' | 'seasonal'>('year_round');
  const [season, setSeason] = useState<'winter' | 'summer' | null>(null);
  const [itemColor, setItemColor] = useState<ItemColor>('white');
  const [linenColor, setLinenColor] = useState<LinenColor>('white_striped');

  /*
   * Felder fuellen, wenn der Dialog aufgeht.
   *
   * Beim Bearbeiten aus der uebergebenen Zeile, beim Anlegen leer. Ohne
   * diesen Effekt wuerde der Dialog beim zweiten Oeffnen noch die Werte
   * des vorigen Aufrufs zeigen.
   */
  useEffect(() => {
    if (!open) return;
    if (bearbeiten) {
      setLabel(bearbeiten.label ?? '');
      setIcon(bearbeiten.icon ?? '');
      setCategory(bearbeiten.category ?? 'Schlafbereich');
      setQuantity(bearbeiten.quantity ?? 1);
      setCalculationType(bearbeiten.calculation_type ?? 'per_guest');
      setAvailability(bearbeiten.availability ?? 'year_round');
      setSeason(bearbeiten.season ?? null);
      if (bearbeiten.category === 'Schlafbereich') {
        setLinenColor((bearbeiten.color as LinenColor) ?? 'white_striped');
      } else {
        setItemColor((bearbeiten.color as ItemColor) ?? 'white');
      }
    } else {
      handleReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bearbeiten]);

  const handleSave = () => {
    if (!label.trim()) return;

    // Beim Bearbeiten bleibt der Schluessel, wie er ist.
    const key = bearbeiten ? bearbeiten.key : generateKeyFromLabel(label, existingKeys);

    // Bestimme Farbe basierend auf Kategorie
    const selectedColor = category === 'Schlafbereich' 
      ? linenColor 
      : (category === 'Badbereich' || category === 'Wellness') 
        ? itemColor 
        : undefined;

    /*
     * Beim Bearbeiten wird die bestehende Zeile ERWEITERT, nicht ersetzt.
     *
     * Der Dialog kennt nur einen Teil der Felder. Ein frisch gebautes
     * Objekt wuerde alles Uebrige stillschweigend loeschen: die
     * Teuni-Artikelnummer (external_artikelnummer.default), die
     * Abrechnungsmarke preis_zaehlt und die frueheren Namen
     * alte_schluessel. Damit waeren Preis und Auswertung der Position weg,
     * ohne dass jemand etwas davon merkt.
     */
    const newItem: LinenItemConfig = {
      ...(bearbeiten ?? {}),
      key,
      label: label.trim(),
      icon: icon || CATEGORY_ICONS[category][0],
      category,
      quantity,
      calculation_type: calculationType,
      availability,
      season: availability === 'seasonal' ? season : null,
      active: bearbeiten ? bearbeiten.active !== false : true,
      color: selectedColor,
      // Nur beim Anlegen setzen — beim Bearbeiten bleibt die vorhandene
      // Artikelzuordnung unangetastet.
      external_artikelnummer: bearbeiten
        ? bearbeiten.external_artikelnummer
        : (selectedColor ? { [selectedColor]: '' } : undefined),
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
    setLinenColor('white_striped');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {istBearbeitung ? `„${bearbeiten?.label}" bearbeiten` : 'Neues Wäsche-Item'}
          </DialogTitle>
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
            {istBearbeitung && (
              <p className="text-xs text-muted-foreground">
                Interne Kennung: <span className="font-mono">{bearbeiten?.key}</span> — bleibt
                unverändert, damit bisherige Bestellungen zugeordnet bleiben.
              </p>
            )}
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

          {category === 'Schlafbereich' && (
            <div className="grid gap-2">
              <Label>Wäschefarbe</Label>
              <Select value={linenColor} onValueChange={(v) => setLinenColor(v as LinenColor)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINEN_COLORS.map(c => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.icon} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {(category === 'Badbereich' || category === 'Wellness') && (
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
            {istBearbeitung ? 'Speichern' : 'Hinzufügen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
