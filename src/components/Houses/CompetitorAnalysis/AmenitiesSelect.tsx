import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface AmenitiesSelectProps {
  value: string[];
  onChange: (amenities: string[]) => void;
}

const COMMON_AMENITIES = [
  { id: 'pool', label: '🏊 Pool', value: 'Pool' },
  { id: 'sauna', label: '🧖 Sauna', value: 'Sauna' },
  { id: 'wifi', label: '📶 WLAN', value: 'WLAN' },
  { id: 'parking', label: '🅿️ Parkplatz', value: 'Parkplatz' },
  { id: 'pets', label: '🐕 Haustiere erlaubt', value: 'Haustiere' },
  { id: 'fireplace', label: '🔥 Kamin', value: 'Kamin' },
  { id: 'view', label: '🏔️ Bergblick', value: 'Bergblick' },
  { id: 'kitchen', label: '🍳 Küche', value: 'Küche' },
  { id: 'bathtub', label: '🛁 Badewanne', value: 'Badewanne' },
  { id: 'ski', label: '🎿 Ski-in/out', value: 'Ski-in/out' },
];

const AmenitiesSelect = ({ value = [], onChange }: AmenitiesSelectProps) => {
  const [customInput, setCustomInput] = useState('');

  const handleToggle = (amenity: string) => {
    const newValue = value.includes(amenity)
      ? value.filter(a => a !== amenity)
      : [...value, amenity];
    onChange(newValue);
  };

  const handleAddCustom = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && customInput.trim()) {
      e.preventDefault();
      const trimmed = customInput.trim();
      if (!value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
      setCustomInput('');
    }
  };

  const handleRemoveCustom = (amenity: string) => {
    onChange(value.filter(a => a !== amenity));
  };

  const isCommonAmenity = (amenity: string) => 
    COMMON_AMENITIES.some(a => a.value === amenity);

  const customAmenities = value.filter(a => !isCommonAmenity(a));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {COMMON_AMENITIES.map((amenity) => (
          <div key={amenity.id} className="flex items-center space-x-2">
            <Checkbox
              id={amenity.id}
              checked={value.includes(amenity.value)}
              onCheckedChange={() => handleToggle(amenity.value)}
            />
            <Label 
              htmlFor={amenity.id} 
              className="text-sm cursor-pointer"
            >
              {amenity.label}
            </Label>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="custom-amenity" className="text-sm">
          Weitere Ausstattung (Enter zum Hinzufügen)
        </Label>
        <Input
          id="custom-amenity"
          placeholder="z.B. Grill, Terrasse, Whirlpool..."
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={handleAddCustom}
        />
      </div>

      {customAmenities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customAmenities.map((amenity) => (
            <Badge key={amenity} variant="secondary" className="gap-1">
              {amenity}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleRemoveCustom(amenity)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

export default AmenitiesSelect;
