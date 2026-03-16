/**
 * AssignOrdersToInvoiceDialog - 2-Step Dialog:
 * Step 1: Fill invoice data (number, dates, amounts)
 * Step 2: Assign linen orders to this invoice
 */
import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarIcon, ArrowRight, ArrowLeft, Check, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useCreateInvoiceWithOrders } from '@/hooks/useLaundryInvoices';

const TEUNI_PROVIDER_ID = 'd8110105-8ac9-45e3-ad32-aaf42393744c';

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

interface AssignOrdersToInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedOrderIds?: string[];
  onSuccess?: () => void;
}

export function AssignOrdersToInvoiceDialog({
  open,
  onOpenChange,
  preselectedOrderIds = [],
  onSuccess,
}: AssignOrdersToInvoiceDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set(preselectedOrderIds)
  );
  const [houseFilter, setHouseFilter] = useState<string>('all');

  const createInvoiceWithOrders = useCreateInvoiceWithOrders();

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

  // Load assignable orders (no final invoice or only draft invoice)
  const { data: assignableOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['assignable-linen-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          id,
          delivery_date,
          status,
          total_items,
          laundry_invoice_id,
          houses:house_id (name),
          bookings:booking_id (guest_name, check_in, number_of_guests)
        `)
        .eq('provider_id', TEUNI_PROVIDER_ID)
        .order('delivery_date', { ascending: false });
      if (error) throw error;

      // Filter: only orders without invoice or with draft invoice
      const orderData = data || [];
      
      // Get draft invoice IDs
      const invoiceIds = orderData
        .map((o: any) => o.laundry_invoice_id)
        .filter(Boolean);
      
      let draftInvoiceIds = new Set<string>();
      if (invoiceIds.length > 0) {
        const { data: invoices } = await supabase
          .from('laundry_invoices')
          .select('id, rechnungsnummer, bruttobetrag')
          .in('id', invoiceIds);
        
        draftInvoiceIds = new Set(
          (invoices || [])
            .filter((inv: any) => inv.rechnungsnummer?.startsWith('ENTWURF') && inv.bruttobetrag === 0)
            .map((inv: any) => inv.id)
        );
      }

      return orderData.filter((o: any) => 
        !o.laundry_invoice_id || draftInvoiceIds.has(o.laundry_invoice_id)
      );
    },
    enabled: open,
  });

  const houseNames = useMemo(() => {
    if (!assignableOrders) return [];
    const names = new Set(assignableOrders.map((o: any) => o.houses?.name).filter(Boolean));
    return Array.from(names).sort() as string[];
  }, [assignableOrders]);

  const filteredOrders = useMemo(() => {
    if (!assignableOrders) return [];
    return assignableOrders.filter((o: any) => {
      if (houseFilter !== 'all' && o.houses?.name !== houseFilter) return false;
      return true;
    });
  }, [assignableOrders, houseFilter]);

  const nettobetrag = form.watch('nettobetrag');
  const mwstSatz = form.watch('mwst_satz') || 0;

  const calculateBrutto = () => {
    const mwstBetrag = nettobetrag * (mwstSatz / 100);
    const brutto = nettobetrag + mwstBetrag;
    form.setValue('bruttobetrag', Math.round(brutto * 100) / 100);
  };

  const toggleOrder = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map((o: any) => o.id)));
    }
  };

  const handleNext = async () => {
    const valid = await form.trigger();
    if (valid) setStep(2);
  };

  const handleSubmit = async () => {
    const data = form.getValues();
    const mwstBetrag = data.nettobetrag * ((data.mwst_satz || 0) / 100);

    await createInvoiceWithOrders.mutateAsync({
      invoiceData: {
        rechnungsnummer: data.rechnungsnummer,
        rechnungsdatum: format(data.rechnungsdatum, 'yyyy-MM-dd'),
        faelligkeitsdatum: data.faelligkeitsdatum
          ? format(data.faelligkeitsdatum, 'yyyy-MM-dd')
          : undefined,
        nettobetrag: data.nettobetrag,
        mwst_satz: data.mwst_satz,
        mwst_betrag: Math.round(mwstBetrag * 100) / 100,
        bruttobetrag: data.bruttobetrag,
        notes: data.notes,
      },
      orderIds: Array.from(selectedOrderIds),
    });

    // Reset
    form.reset();
    setStep(1);
    setSelectedOrderIds(new Set());
    setHouseFilter('all');
    onOpenChange(false);
    onSuccess?.();
  };

  // Reset when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setStep(1);
      setSelectedOrderIds(new Set(preselectedOrderIds));
      form.reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 1 ? '📄 Schritt 1: Rechnungsdaten' : '📦 Schritt 2: Bestellungen zuordnen'}
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={step === 1 ? 'default' : 'secondary'}>1. Rechnung</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant={step === 2 ? 'default' : 'secondary'}>2. Bestellungen</Badge>
          </div>
        </DialogHeader>

        {step === 1 ? (
          <Form {...form}>
            <div className="space-y-4">
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
                              {field.value
                                ? format(field.value, 'dd.MM.yyyy', { locale: de })
                                : 'Datum wählen'}
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
                              {field.value
                                ? format(field.value, 'dd.MM.yyyy', { locale: de })
                                : 'Datum wählen'}
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
                          <span className="absolute right-3 top-2.5 text-muted-foreground text-sm">EUR</span>
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
                          <span className="absolute right-3 top-2.5 text-muted-foreground text-sm">EUR</span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notizen</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Zusätzliche Notizen..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Form>
        ) : (
          <div className="space-y-4">
            {/* Invoice summary */}
            <div className="p-3 bg-muted rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{form.getValues('rechnungsnummer')}</span>
                <span className="font-medium">
                  {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
                    form.getValues('bruttobetrag')
                  )}
                </span>
              </div>
              <div className="text-muted-foreground">
                {form.getValues('rechnungsdatum') && format(form.getValues('rechnungsdatum'), 'dd.MM.yyyy', { locale: de })}
              </div>
            </div>

            {/* House filter */}
            <div className="flex items-center gap-3">
              <Select value={houseFilter} onValueChange={setHouseFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Alle Häuser" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Häuser</SelectItem>
                  {houseNames.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">
                {selectedOrderIds.size} von {filteredOrders.length} ausgewählt
              </span>
            </div>

            {/* Orders table */}
            <ScrollArea className="border rounded-lg h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Lieferdatum</TableHead>
                    <TableHead>Haus</TableHead>
                    <TableHead>Gast</TableHead>
                    <TableHead>Artikel</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordersLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Lade Bestellungen...
                      </TableCell>
                    </TableRow>
                  ) : filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Keine zuordenbaren Bestellungen gefunden
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order: any) => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer"
                        onClick={() => toggleOrder(order.id)}
                        data-state={selectedOrderIds.has(order.id) ? 'selected' : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedOrderIds.has(order.id)}
                            onCheckedChange={() => toggleOrder(order.id)}
                          />
                        </TableCell>
                        <TableCell>
                          {order.delivery_date
                            ? format(new Date(order.delivery_date), 'dd.MM.yyyy', { locale: de })
                            : '-'}
                        </TableCell>
                        <TableCell>{order.houses?.name || '-'}</TableCell>
                        <TableCell>{order.bookings?.guest_name || '-'}</TableCell>
                        <TableCell>{order.total_items || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{order.status || '-'}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="flex justify-between sm:justify-between">
          {step === 2 ? (
            <>
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Zurück
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createInvoiceWithOrders.isPending}
              >
                {createInvoiceWithOrders.isPending ? 'Speichern...' : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Rechnung erstellen {selectedOrderIds.size > 0 && `(${selectedOrderIds.size} Bestellungen)`}
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleNext}>
                Weiter: Bestellungen zuordnen
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
