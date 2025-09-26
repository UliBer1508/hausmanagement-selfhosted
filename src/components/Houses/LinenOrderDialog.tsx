import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarIcon, ShoppingCart, Mail, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LinenOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItems: Record<string, number>;
  houseName: string;
  selectedBooking?: any; // Booking information
  onCreateOrder: (orderData: {
    orderItems: Record<string, number>;
    notes?: string;
    deliveryDate?: string;
  }) => void;
  onSendEmail?: (orderId: string) => void;
  isCreating?: boolean;
}

const LinenOrderDialog = ({
  open,
  onOpenChange,
  orderItems,
  houseName,
  selectedBooking,
  onCreateOrder,
  onSendEmail,
  isCreating = false
}: LinenOrderDialogProps) => {
  const [deliveryDate, setDeliveryDate] = useState<Date>(addDays(new Date(), 2));
  const [notes, setNotes] = useState('');
  const [sendToTeuni, setSendToTeuni] = useState(false);
  const [editableItems, setEditableItems] = useState(orderItems);

  const linenLabels: Record<string, string> = {
    bedding: 'Bettwäsche',
    large_towels: 'Handtücher groß',
    small_towels: 'Handtücher klein',
    sauna_towels: 'Saunatücher',
    bath_mats: 'Badematten',
    sink_towels: 'Waschbecken Handtücher',
    kitchen_towels: 'Küchentücher',
    blankets: 'Decken',
    pillow_cases: 'Kissenbezüge',
  };

  const totalItems = useMemo(() => 
    Object.values(editableItems).reduce((sum, count) => sum + count, 0),
    [editableItems]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const filteredItems = Object.fromEntries(
      Object.entries(editableItems).filter(([_, count]) => count > 0)
    );

    if (Object.keys(filteredItems).length === 0) {
      return;
    }

    onCreateOrder({
      orderItems: filteredItems,
      notes: notes.trim() || undefined,
      deliveryDate: format(deliveryDate, 'yyyy-MM-dd'),
    });

    // Reset form
    setNotes('');
    setDeliveryDate(addDays(new Date(), 2));
    setEditableItems(orderItems);
    onOpenChange(false);
  };

  const updateItemQuantity = (itemType: string, quantity: number) => {
    setEditableItems(prev => ({
      ...prev,
      [itemType]: Math.max(0, quantity)
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Wäschebestellung für {houseName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Booking Information */}
          {selectedBooking && (
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-blue-600" />
                  Verknüpfte Buchung
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-700 font-medium">Gast:</span>
                    <span className="ml-2">{selectedBooking.guest_name}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Gäste:</span>
                    <span className="ml-2">{selectedBooking.number_of_guests}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Check-in:</span>
                    <span className="ml-2">{format(new Date(selectedBooking.check_in), 'dd.MM.yyyy', { locale: de })}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Check-out:</span>
                    <span className="ml-2">{format(new Date(selectedBooking.check_out), 'dd.MM.yyyy', { locale: de })}</span>
                  </div>
                  {selectedBooking.external_booking_id && (
                    <div className="col-span-2">
                      <span className="text-blue-700 font-medium">Buchungs-ID:</span>
                      <span className="ml-2">{selectedBooking.external_booking_id}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Bestellpositionen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(editableItems).map(([itemType, quantity]) => (
                <div key={itemType} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{linenLabels[itemType] || itemType}</div>
                    {quantity > 0 && (
                      <Badge variant="outline" className="mt-1">
                        {quantity} Stück
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      value={quantity}
                      onChange={(e) => updateItemQuantity(itemType, parseInt(e.target.value) || 0)}
                      className="w-20"
                    />
                  </div>
                </div>
              ))}
              
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>Gesamt:</span>
                  <Badge variant="secondary">{totalItems} Teile</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Delivery Date */}
          <div className="space-y-2">
            <Label>Lieferdatum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !deliveryDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {deliveryDate ? (
                    format(deliveryDate, "PPP", { locale: de })
                  ) : (
                    <span>Datum auswählen</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={deliveryDate}
                  onSelect={(date) => date && setDeliveryDate(date)}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Bemerkungen (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Zusätzliche Anweisungen oder Bemerkungen..."
              className="min-h-[80px]"
            />
          </div>

          {/* Teuni Portal Option */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="sendToTeuni"
                  checked={sendToTeuni}
                  onChange={(e) => setSendToTeuni(e.target.checked)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <Label htmlFor="sendToTeuni" className="flex items-center gap-2 cursor-pointer">
                    <Mail className="w-4 h-4" />
                    An Teuni Portal senden
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Bestellung automatisch per E-Mail an den Wäscheservice senden
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Critical Items Warning */}
          {totalItems > 50 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <strong>Große Bestellung:</strong> Diese Bestellung enthält {totalItems} Teile. 
                Bitte prüfen Sie die Lieferzeiten mit dem Anbieter.
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={isCreating || totalItems === 0}
            >
              {isCreating ? 'Erstelle Bestellung...' : 'Bestellung erstellen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LinenOrderDialog;