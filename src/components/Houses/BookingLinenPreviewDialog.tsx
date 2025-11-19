import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { calculateDeliveryDate, translateItemType, formatCurrency } from "@/lib/linenOrderHelpers";
import { useEffect, useState } from "react";

interface BookingLinenPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (orderData: any) => void;
  booking: any;
  generatedOrderData?: any;
  isGenerating?: boolean;
}

export function BookingLinenPreviewDialog({
  open,
  onOpenChange,
  onConfirm,
  booking,
  generatedOrderData,
  isGenerating = false,
}: BookingLinenPreviewDialogProps) {
  const [deliveryDate, setDeliveryDate] = useState<Date>();
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (booking && open) {
      const deliveryDateStr = calculateDeliveryDate(booking.check_in);
      setDeliveryDate(new Date(deliveryDateStr));
    }
  }, [booking, open]);

  useEffect(() => {
    if (generatedOrderData?.note) {
      setNotes(generatedOrderData.note);
    }
  }, [generatedOrderData]);

  const handleConfirm = () => {
    onConfirm({
      deliveryDate: deliveryDate?.toISOString().split('T')[0],
      deliveryType,
      notes,
    });
  };

  const estimatedCost = generatedOrderData?.estimated_cost || 0;
  const itemDetails = generatedOrderData?.item_details || [];

  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wäschebestellung erstellen</DialogTitle>
          <DialogDescription>
            Bestellung für {booking.guest_name} · Check-in: {format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de })}
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground">Berechne Wäschebedarf...</p>
            </div>
          </div>
        ) : (
          <>
            {generatedOrderData && (
              <>
                <Card className="border-primary/50 bg-primary/5">
                  <CardContent className="pt-6">
                    <div className="text-center space-y-1">
                      <p className="text-sm text-muted-foreground">Geschätzte Kosten</p>
                      <p className="text-4xl font-bold text-primary">
                        {formatCurrency(estimatedCost)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {generatedOrderData.total_items} Artikel gesamt
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {estimatedCost > 500 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Diese Bestellung ist ungewöhnlich hoch. Bitte prüfen Sie die Mengen sorgfältig.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label className="text-base font-semibold">Bestellübersicht</Label>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Artikel</TableHead>
                          <TableHead className="text-right">Menge</TableHead>
                          <TableHead className="text-right">Einzelpreis</TableHead>
                          <TableHead className="text-right">Gesamt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemDetails.map((item: any) => (
                          <TableRow key={item.item}>
                            <TableCell className="font-medium">{translateItemType(item.item)}</TableCell>
                            <TableCell className="text-right">{item.quantity}x</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatCurrency(item.unit_price)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(item.total_price)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="deliveryDate">Lieferdatum</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="deliveryDate"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !deliveryDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {deliveryDate ? format(deliveryDate, 'PPP', { locale: de }) : "Datum wählen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={deliveryDate}
                      onSelect={setDeliveryDate}
                      initialFocus
                      locale={de}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Lieferart</Label>
                <RadioGroup value={deliveryType} onValueChange={(value: any) => setDeliveryType(value)}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="delivery" id="delivery" />
                    <Label htmlFor="delivery" className="font-normal cursor-pointer">
                      Lieferung
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pickup" id="pickup" />
                    <Label htmlFor="pickup" className="font-normal cursor-pointer">
                      Abholung
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notizen (optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Besondere Hinweise für die Wäscherei..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleConfirm} disabled={isGenerating || !generatedOrderData}>
            Bestellung bestätigen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
