import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useHousePricingConfig, useSaveHousePricingConfig } from '@/hooks/usePriceLabs';
import { toast } from 'sonner';

interface Props {
  houseId: string;
}

export function PricingConfigCard({ houseId }: Props) {
  const { data: config, isLoading } = useHousePricingConfig(houseId);
  const save = useSaveHousePricingConfig();

  const [base, setBase] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  useEffect(() => {
    if (config) {
      setBase(config.base_price != null ? String(config.base_price) : '');
      setMin(config.min_price != null ? String(config.min_price) : '');
      setMax(config.max_price != null ? String(config.max_price) : '');
    }
  }, [config]);

  function handleSave() {
    const b = Number(base), mn = Number(min), mx = Number(max);
    if (!b || !mn || !mx) return toast.error('Alle Preise erforderlich');
    if (!(mn < b && b < mx)) return toast.error('Mindestpreis < Basispreis < Höchstpreis');
    save.mutate({ house_id: houseId, config: { base_price: b, min_price: mn, max_price: mx } } as any);
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">Preiskonfiguration</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <Label>Basispreis (€)</Label>
          <Input type="number" value={base} onChange={(e) => setBase(e.target.value)} disabled={isLoading} />
        </div>
        <div>
          <Label>Mindestpreis (€)</Label>
          <Input type="number" value={min} onChange={(e) => setMin(e.target.value)} disabled={isLoading} />
        </div>
        <div>
          <Label>Höchstpreis (€)</Label>
          <Input type="number" value={max} onChange={(e) => setMax(e.target.value)} disabled={isLoading} />
        </div>
      </div>
      <Button onClick={handleSave} disabled={save.isPending}>Speichern</Button>
    </Card>
  );
}

export default PricingConfigCard;
