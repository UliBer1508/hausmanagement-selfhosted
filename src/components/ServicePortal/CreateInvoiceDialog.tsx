import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useCreateLaundryInvoice } from '@/hooks/useLaundryInvoices';
import { Separator } from '@/components/ui/separator';

const positionSchema = z.object({
  artikelnummer: z.string().optional(),
  bezeichnung: z.string().min(1, 'Bezeichnung erforderlich'),
  menge: z.coerce.number().min(1, 'Mindestens 1'),
  einzelpreis: z.coerce.number().min(0, 'Preis erforderlich'),
});

const invoiceSchema = z.object({
  rechnungsnummer: z.string().min(1, 'Rechnungsnummer erforderlich'),
  rechnungsdatum: z.date({ required_error: 'Rechnungsdatum erforderlich' }),
  faelligkeitsdatum: z.date().optional(),
  nettobetrag: z.coerce.number().min(0, 'Nettobetrag erforderlich'),
  mwst_satz: z.coerce.number().optional(),
  bruttobetrag: z.coerce.number().min(0, 'Bruttobetrag erforderlich'),
  notes: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;
type PositionFormData = z.infer<typeof positionSchema>;

interface Position extends PositionFormData {
  id: string;
  gesamtpreis: number;
}

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInvoiceDialog({ open, onOpenChange }: CreateInvoiceDialogProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const createInvoice = useCreateLaundryInvoice();

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      rechnungsnummer: '',
      nettobetrag: 0,
      mwst_satz: 19,
      bruttobetrag: 0,
      notes: '',
    },
  });

  const nettobetrag = form.watch('nettobetrag');
  const mwstSatz = form.watch('mwst_satz') || 0;

  // Auto-calculate gross amount
  const calculateBrutto = () => {
    const mwstBetrag = nettobetrag * (mwstSatz / 100);
    const brutto = nettobetrag + mwstBetrag;
    form.setValue('bruttobetrag', Math.round(brutto * 100) / 100);
  };

  const addPosition = () => {
    setPositions([
      ...positions,
      {
        id: crypto.randomUUID(),
        artikelnummer: '',
        bezeichnung: '',
        menge: 1,
        einzelpreis: 0,
        gesamtpreis: 0,
      },
    ]);
  };

  const updatePosition = (id: string, field: keyof PositionFormData, value: string | number) => {
    setPositions(positions.map(pos => {
      if (pos.id !== id) return pos;
      const updated = { ...pos, [field]: value };
      updated.gesamtpreis = updated.menge * updated.einzelpreis;
      return updated;
    }));
  };

  const removePosition = (id: string) => {
    setPositions(positions.filter(pos => pos.id !== id));
  };

  const onSubmit = async (data: InvoiceFormData) => {
    const mwstBetrag = data.nettobetrag * ((data.mwst_satz || 0) / 100);
    
    await createInvoice.mutateAsync({
      rechnungsnummer: data.rechnungsnummer,
      rechnungsdatum: format(data.rechnungsdatum, 'yyyy-MM-dd'),
      faelligkeitsdatum: data.faelligkeitsdatum 
        ? format(data.faelligkeitsdatum, 'yyyy-MM-dd') 
        : undefined,
      nettobetrag: data.nettobetrag,
      mwst_satz: data.mwst_satz,
      mwst_betrag: Math.round(mwstBetrag * 100) / 100,
      bruttobetrag: data.bruttobetrag,
      positionen: positions.length > 0 ? positions.map(p => ({
        id: p.id,
        rechnung_id: '',
        artikelnummer: p.artikelnummer || '',
        bezeichnung: p.bezeichnung,
        menge: p.menge,
        einzelpreis: p.einzelpreis,
        gesamtpreis: p.gesamtpreis,
      })) : undefined,
      notes: data.notes,
    });

    form.reset();
    setPositions([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📄 Rechnung manuell erfassen</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="rechnungsnummer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rechnungsnummer *</FormLabel>
                  <FormControl>
                    <Input placeholder="z.B. RE-2026-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="rechnungsdatum"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Rechnungsdatum *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'dd.MM.yyyy', { locale: de })
                            ) : (
                              <span>Datum wählen</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="faelligkeitsdatum"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fälligkeitsdatum</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'dd.MM.yyyy', { locale: de })
                            ) : (
                              <span>Datum wählen</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />
            <h4 className="font-medium">Beträge</h4>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="nettobetrag"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nettobetrag *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            setTimeout(calculateBrutto, 0);
                          }}
                        />
                        <span className="absolute right-3 top-2.5 text-muted-foreground text-sm">
                          EUR
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mwst_satz"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MwSt-Satz</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(value) => {
                        field.onChange(Number(value));
                        setTimeout(calculateBrutto, 0);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="MwSt wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="7">7%</SelectItem>
                        <SelectItem value="19">19%</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bruttobetrag"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bruttobetrag *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type="number" step="0.01" {...field} />
                        <span className="absolute right-3 top-2.5 text-muted-foreground text-sm">
                          EUR
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Positionen (optional)</h4>
              <Button type="button" variant="outline" size="sm" onClick={addPosition}>
                <Plus className="h-4 w-4 mr-1" />
                Position
              </Button>
            </div>

            {positions.map((position) => (
              <div key={position.id} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-2">
                  <Input
                    placeholder="Art.Nr."
                    value={position.artikelnummer}
                    onChange={(e) => updatePosition(position.id, 'artikelnummer', e.target.value)}
                  />
                </div>
                <div className="col-span-4">
                  <Input
                    placeholder="Bezeichnung"
                    value={position.bezeichnung}
                    onChange={(e) => updatePosition(position.id, 'bezeichnung', e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    placeholder="Menge"
                    value={position.menge}
                    onChange={(e) => updatePosition(position.id, 'menge', Number(e.target.value))}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Preis"
                    value={position.einzelpreis}
                    onChange={(e) => updatePosition(position.id, 'einzelpreis', Number(e.target.value))}
                  />
                </div>
                <div className="col-span-1 text-right text-sm text-muted-foreground pt-2">
                  {position.gesamtpreis.toFixed(2)}€
                </div>
                <div className="col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePosition(position.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}

            <Separator />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notizen</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Zusätzliche Notizen zur Rechnung..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={createInvoice.isPending}>
                {createInvoice.isPending ? 'Speichern...' : '💾 Speichern'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
