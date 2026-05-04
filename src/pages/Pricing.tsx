import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PricingDashboard from '@/components/Pricing/PricingDashboard';

interface HouseOption {
  id: string;
  name: string;
  address: string | null;
}

export default function PricingPage() {
  const [houses, setHouses] = useState<HouseOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('houses')
        .select('id, name, address, rental_type')
        .eq('rental_type', 'tourist')
        .order('name');
      const list = (data ?? []).map((h: any) => ({ id: h.id, name: h.name, address: h.address }));
      setHouses(list);
      if (list.length > 0) setSelected(list[0].id);
    })();
  }, []);

  const current = houses.find((h) => h.id === selected);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Dynamische Preise</h1>
        {houses.length > 0 && (
          <Select value={selected ?? undefined} onValueChange={setSelected}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Unterkunft wählen" /></SelectTrigger>
            <SelectContent>
              {houses.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      {selected && current && (
        <PricingDashboard houseId={selected} propertyName={current.name} location={current.address ?? ''} />
      )}
    </div>
  );
}