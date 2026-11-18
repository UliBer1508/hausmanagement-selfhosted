import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { addMonths, format, parseISO, subDays } from 'date-fns';
import { AlertTriangle, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useHouses, useUpdateHouse } from '@/hooks/useHouses';
import type { TenantInfo } from '@/types';
import type { RentalOffer } from '@/hooks/useRentalInquiries';

interface RentalTenantTakeoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: RentalOffer | null;
  guestPhone?: string | null;
  onDone?: () => void;
}

/**
 * „Als Mieter übernehmen“ (SQL 73): trägt aus einem ANGENOMMENEN Angebot den Mieter beim Haus
 * ein (houses.rental_type = 'long_term', houses.tenant_info). Ab dann übernimmt der Tab Mieter:
 * generate-tenant-payments bucht am Zahltag die Warmmiete (monthly_rent + additional_costs),
 * Betriebskosten/Mieterhöhung wie bei den übrigen Festvermietungen.
 * Danach: Angebot converted_at, Anfrage → „erledigt“.
 * Schreibt über useUpdateHouse (Hook-Regel AGENTS.md), nicht direkt.
 */
const RentalTenantTakeoverDialog = ({ open, onOpenChange, offer, guestPhone, onDone }: RentalTenantTakeoverDialogProps) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: houses = [] } = useHouses();
  const updateHouse = useUpdateHouse();
  const haus = houses.find(h => h.id === offer?.house_id);
  const bisher = haus?.tenant_info as TenantInfo | undefined;
  const belegt = !!bisher?.tenant_name?.trim();

  const [w, setW] = useState({
    tenant_name: '', tenant_email: '', tenant_phone: '', contract_start: '', contract_end: '',
    monthly_rent: '', additional_costs: '', deposit_amount: '', payment_day: '1', notes: '',
  });
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (!open || !offer) return;
    const ende = offer.duration_months
      ? format(subDays(addMonths(parseISO(offer.move_in), offer.duration_months), 1), 'yyyy-MM-dd')
      : '';
    setW({
      tenant_name: offer.guest_name,
      tenant_email: offer.guest_email ?? '',
      tenant_phone: guestPhone ?? '',
      contract_start: offer.move_in,
      contract_end: ende,
      monthly_rent: String(offer.rent_month),
      additional_costs: String(offer.utilities_month),
      deposit_amount: String(offer.deposit),
      payment_day: '1',
      notes: `Wohnen auf Zeit, Angebot vom ${format(parseISO(offer.created_at), 'dd.MM.yyyy')} angenommen` +
        (offer.utilities_mode === 'flat' ? ' · Nebenkosten als Pauschale' : ' · Nebenkosten als Vorauszahlung'),
    });
  }, [open, offer, guestPhone]);

  if (!offer) return null;
  const setze = (k: keyof typeof w, v: string) => setW(a => ({ ...a, [k]: v }));

  const uebernehmen = async () => {
    const tag = parseInt(w.payment_day);
    if (!w.tenant_name.trim() || !w.contract_start || !(Number(w.monthly_rent) > 0) || !(tag >= 1 && tag <= 28)) {
      toast({ title: 'Angaben prüfen', description: 'Name, Vertragsbeginn, Miete und Zahltag (1–28) sind Pflicht.', variant: 'destructive' });
      return;
    }
    setSpeichert(true);
    try {
      const tenant_info: TenantInfo = {
        ...(bisher ?? {}),
        tenant_name: w.tenant_name.trim(),
        tenant_email: w.tenant_email.trim(),
        tenant_phone: w.tenant_phone.trim(),
        contract_start: w.contract_start,
        contract_end: w.contract_end || null as any,
        monthly_rent: Number(w.monthly_rent),
        additional_costs: Number(w.additional_costs) || 0,
        deposit_amount: Number(w.deposit_amount) || 0,
        payment_day: tag,
        payment_method: bisher?.payment_method ?? 'bank_transfer',
        notes: w.notes.trim(),
      };
      await updateHouse.mutateAsync({ id: offer.house_id, rental_type: 'long_term', tenant_info });

      const { data: o, error: e1 } = await (supabase as any).from('rental_offers')
        .update({ converted_at: new Date().toISOString() }).eq('id', offer.id).select('id');
      if (e1) throw e1;
      if (!o || o.length === 0) throw new Error('Angebot nicht aktualisiert (Rechte?)');
      if (offer.inquiry_id) {
        const { error: e2 } = await (supabase as any).from('rental_inquiries')
          .update({ status: 'closed', seen_at: new Date().toISOString() }).eq('id', offer.inquiry_id).select('id');
        if (e2) console.error('[Als Mieter übernehmen] Anfrage-Status', e2);
      }
      ['rental-offers', 'rental-inquiries', 'houses'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast({ title: 'Mieter eingetragen', description: `${w.tenant_name} ist jetzt Mieter von ${haus?.name ?? 'dem Haus'}.` });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      console.error('[Als Mieter übernehmen]', e);
      toast({ title: 'Konnte nicht übernommen werden', description: e?.message, variant: 'destructive' });
    } finally {
      setSpeichert(false);
    }
  };

  const feld = (k: keyof typeof w, label: string, typ = 'text') => (
    <div className="space-y-1">
      <Label htmlFor={`uebernahme-${k}`} className="text-xs">{label}</Label>
      <Input id={`uebernahme-${k}`} type={typ} value={w[k]} onChange={e => setze(k, e.target.value)}
        step={typ === 'number' ? 'any' : undefined} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Als Mieter übernehmen — {haus?.name ?? ''}</DialogTitle>
          <DialogDescription>
            Trägt den Mieter beim Haus ein. Danach laufen Mietzahlungen, Betriebskosten und Mieterhöhungen über den Tab Mieter.
            Erst übernehmen, wenn der Mietvertrag unterschrieben ist.
          </DialogDescription>
        </DialogHeader>

        {belegt && (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <span>
              Bei diesem Haus ist bereits <strong>{bisher?.tenant_name}</strong> als Mieter eingetragen.
              Die Übernahme ersetzt diese Angaben.
            </span>
          </div>
        )}
        {haus?.rental_type !== 'long_term' && (
          <p className="text-xs text-muted-foreground">
            Das Haus steht derzeit auf Vermietungsart „{haus?.rental_type ?? '—'}“ und wird auf Festvermietung (long_term) umgestellt.
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          {feld('tenant_name', 'Mieter')}
          {feld('tenant_email', 'E-Mail')}
          {feld('tenant_phone', 'Telefon')}
          {feld('payment_day', 'Zahltag (Tag im Monat)', 'number')}
          {feld('contract_start', 'Vertragsbeginn', 'date')}
          {feld('contract_end', 'Vertragsende (leer = unbefristet)', 'date')}
          {feld('monthly_rent', 'Kaltmiete / Monat (€)', 'number')}
          {feld('additional_costs', 'Nebenkosten / Monat (€)', 'number')}
          {feld('deposit_amount', 'Kaution (€)', 'number')}
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="uebernahme-notes" className="text-xs">Notiz</Label>
            <Textarea id="uebernahme-notes" rows={2} value={w.notes} onChange={e => setze('notes', e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={uebernehmen} disabled={speichert}>
            <UserCheck className="h-4 w-4 mr-1" />{speichert ? 'Speichert…' : 'Als Mieter übernehmen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RentalTenantTakeoverDialog;
