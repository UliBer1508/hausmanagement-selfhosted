import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PricingDashboard from '@/components/Pricing/PricingDashboard';

export default function PricingTab() {
  const [houses, setHouses] = useState<Array<{ id: string; name: string; address: string | null }>>([]);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Dynamische Preise</h1>
          <p className="text-muted-foreground mt-2">Preisstrategie für Ferienhäuser und Mietobjekte</p>
        </div>
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
