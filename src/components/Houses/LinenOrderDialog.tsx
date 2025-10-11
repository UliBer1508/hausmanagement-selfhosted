import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format, addDays, subDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarIcon, ShoppingCart, Mail, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { standardLinenOrderSchema, exceptionalLinenOrderSchema } from './schemas/LinenOrderSchema';

interface LinenOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItems: Record<string, number>;
  houseName: string;
  houseId: string;
  selectedBooking?: any;
  availableBookings?: any[];
  linenSetDefinition?: any;
  onCreateOrder: (orderData: {
    orderItems: Record<string, number>;
    notes?: string;
    deliveryDate?: string;
    deliveryType?: 'delivery' | 'pickup';
    booking_id?: string;
    orderType?: 'standard' | 'exceptional';
    exceptionReason?: string;
  }) => void;
  onSendEmail?: (orderId: string) => void;
  isCreating?: boolean;
  allowExceptionalOrder?: boolean;
  initialData?: {
    deliveryDate?: string;
    deliveryType?: 'delivery' | 'pickup';
    notes?: string;
  };
}

// Helper function to calculate linen order for a specific booking
const calculateBookingLinenOrder = (
  booking: any,
  linenDef: any
): Record<string, number> => {
  const guests = booking.number_of_guests || 0;
  const items: Record<string, number> = {};
  
  // Per-Guest Items
  if (linenDef?.bedding_per_guest) {
    items.bedding = guests * linenDef.bedding_per_guest;
  }
  if (linenDef?.large_towels_per_guest) {
    items.large_towels = guests * linenDef.large_towels_per_guest;
  }
  if (linenDef?.small_towels_per_guest) {
    items.small_towels = guests * linenDef.small_towels_per_guest;
  }
  if (linenDef?.sauna_towels_per_guest) {
    items.sauna_towels = guests * linenDef.sauna_towels_per_guest;
  }
  if (linenDef?.pillow_cases_per_guest) {
    items.pillow_cases = guests * linenDef.pillow_cases_per_guest;
  }
  if (linenDef?.blankets_per_guest) {
    items.blankets = guests * linenDef.blankets_per_guest;
  }
  
  // Per-Booking Items
  if (linenDef?.bath_mats_per_booking) {
    items.bath_mats = linenDef.bath_mats_per_booking;
  }
  if (linenDef?.sink_towels_per_booking) {
    items.sink_towels = linenDef.sink_towels_per_booking;
  }
  if (linenDef?.kitchen_towels_per_booking) {
    items.kitchen_towels = linenDef.kitchen_towels_per_booking;
  }
  
  // Remove items with 0 quantity
  return Object.fromEntries(
    Object.entries(items).filter(([_, qty]) => qty > 0)
  );
};

const LinenOrderDialog = ({
  open,
  onOpenChange,
  orderItems,
  houseName,
  houseId,
  selectedBooking,
  availableBookings = [],
  linenSetDefinition,
  onCreateOrder,
  onSendEmail,
  isCreating = false,
  allowExceptionalOrder = false,
  initialData
}: LinenOrderDialogProps) => {
  const [internalSelectedBooking, setInternalSelectedBooking] = useState<any>(selectedBooking);
  const [deliveryDate, setDeliveryDate] = useState<Date>(() => {
    if (initialData?.deliveryDate) {
      return new Date(initialData.deliveryDate);
    }
    // If booking is selected, set delivery date to 1 day before check-in
    if (selectedBooking?.check_in) {
      return subDays(new Date(selectedBooking.check_in), 1);
    }
    // Fallback: 2 days from today
    return addDays(new Date(), 2);
  });
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>(
    initialData?.deliveryType || 'delivery'
  );
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [sendToTeuni, setSendToTeuni] = useState(false);
  const [editableItems, setEditableItems] = useState(orderItems);
  const [orderType, setOrderType] = useState<'standard' | 'exceptional'>(
    selectedBooking ? 'standard' : 'exceptional'
  );
  const [exceptionReason, setExceptionReason] = useState<string>('general_cleaning');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Update state when props change (e.g., when opening with AI-generated data)
  useEffect(() => {
    if (open) {
      // If a booking is selected and linen definitions are available, calculate booking-specific order
      if (selectedBooking && linenSetDefinition) {
        const bookingSpecificItems = calculateBookingLinenOrder(selectedBooking, linenSetDefinition);
        setEditableItems(bookingSpecificItems);
        
        // Set delivery date to 1 day before check-in if not overridden by initialData
        if (selectedBooking.check_in && !initialData?.deliveryDate) {
          setDeliveryDate(subDays(new Date(selectedBooking.check_in), 1));
        }
      } else {
        // Otherwise, use the passed orderItems
        setEditableItems(orderItems);
      }
      
      setInternalSelectedBooking(selectedBooking);
      if (initialData?.deliveryDate) {
        setDeliveryDate(new Date(initialData.deliveryDate));
      }
      if (initialData?.deliveryType) {
        setDeliveryType(initialData.deliveryType);
      }
      if (initialData?.notes) {
        setNotes(initialData.notes);
      }
    }
  }, [open, selectedBooking, linenSetDefinition, initialData]);

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
    setValidationErrors([]);
    
    const filteredItems = Object.fromEntries(
      Object.entries(editableItems).filter(([_, count]) => count > 0)
    );

    if (Object.keys(filteredItems).length === 0) {
      setValidationErrors(['Mindestens ein Artikel muss bestellt werden']);
      return;
    }

    const baseOrderData = {
      orderItems: filteredItems,
      notes: notes.trim() || undefined,
      deliveryDate: format(deliveryDate, 'yyyy-MM-dd'),
      deliveryType: deliveryType,
      house_id: houseId,
    };

    try {
      if (orderType === 'standard') {
        if (!internalSelectedBooking) {
          setValidationErrors(['Für Standardbestellungen ist eine Buchungsverknüpfung erforderlich']);
          return;
        }
        
        const validatedData = standardLinenOrderSchema.parse({
          ...baseOrderData,
          booking_id: internalSelectedBooking.id,
        });
        
        onCreateOrder({
          ...baseOrderData,
          booking_id: internalSelectedBooking.id,
          orderType: 'standard',
        });
      } else {
        const validatedData = exceptionalLinenOrderSchema.parse({
          ...baseOrderData,
          orderType: 'exceptional',
          exceptionReason,
          notes: notes.trim() || `Ausnahmebestellung: ${getExceptionReasonLabel(exceptionReason)}`,
        });
        
        onCreateOrder({
          ...baseOrderData,
          orderType: 'exceptional',
          exceptionReason,
          notes: notes.trim() || `Ausnahmebestellung: ${getExceptionReasonLabel(exceptionReason)}`,
        });
      }

      // Reset form
      setNotes('');
      setDeliveryDate(addDays(new Date(), 2));
      setDeliveryType('delivery');
      setEditableItems(orderItems);
      setOrderType(selectedBooking ? 'standard' : 'exceptional');
      setExceptionReason('general_cleaning');
      onOpenChange(false);
    } catch (error: any) {
      if (error.errors) {
        setValidationErrors(error.errors.map((e: any) => e.message));
      } else {
        setValidationErrors(['Validierungsfehler beim Erstellen der Bestellung']);
      }
    }
  };

  const updateItemQuantity = (itemType: string, quantity: number) => {
    setEditableItems(prev => ({
      ...prev,
      [itemType]: Math.max(0, quantity)
    }));
  };

  const getExceptionReasonLabel = (reason: string) => {
    const labels = {
      general_cleaning: 'Generalreinigung',
      inventory_restock: 'Inventar-Auffüllung',
      emergency_order: 'Notbestellung',
      maintenance: 'Wartung/Instandhaltung'
    };
    return labels[reason as keyof typeof labels] || reason;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Wäschebestellung für {houseName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Erstellen Sie eine neue Wäschebestellung für dieses Haus mit optionaler Buchungsverknüpfung.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Order Type Selection */}
          {allowExceptionalOrder && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  Bestellungstyp
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup 
                  value={orderType} 
                  onValueChange={(value: 'standard' | 'exceptional') => setOrderType(value)}
                  className="space-y-3"
                >
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="standard" id="standard" disabled={availableBookings.length === 0} />
                    <div className="flex-1">
                      <Label htmlFor="standard" className={cn("cursor-pointer", availableBookings.length === 0 && "text-muted-foreground")}>
                        📋 Standardbestellung (mit Buchung)
                      </Label>
                      {availableBookings.length === 0 && (
                        <p className="text-xs text-orange-600 mt-1">
                          Keine Buchung verfügbar - nur Ausnahmebestellungen möglich
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="exceptional" id="exceptional" />
                    <div className="flex-1">
                      <Label htmlFor="exceptional" className="cursor-pointer">
                        ⚠️ Ausnahmebestellung (ohne Buchung)
                      </Label>
                      <p className="text-xs text-orange-600 mt-1">
                        Für Generalreinigung, Notfälle oder Inventar-Auffüllung
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>
          )}

          {/* Exception Reason Selection */}
          {orderType === 'exceptional' && (
            <div className="space-y-2">
              <Label>Grund für Ausnahmebestellung</Label>
              <Select value={exceptionReason} onValueChange={setExceptionReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Grund auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general_cleaning">🧹 Generalreinigung</SelectItem>
                  <SelectItem value="inventory_restock">📦 Inventar-Auffüllung</SelectItem>
                  <SelectItem value="emergency_order">🚨 Notbestellung</SelectItem>
                  <SelectItem value="maintenance">🔧 Wartung/Instandhaltung</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Booking Selection */}
          {availableBookings.length > 0 && orderType === 'standard' && (
            <div className="space-y-2">
              <Label>Buchung auswählen</Label>
               <Select 
                value={internalSelectedBooking?.id || 'none'} 
                onValueChange={(value) => {
                  if (value === 'none') {
                    setInternalSelectedBooking(null);
                    setEditableItems(orderItems);
                    setDeliveryDate(addDays(new Date(), 2)); // Reset to default
                  } else {
                    const booking = availableBookings.find(b => b.id === value);
                    setInternalSelectedBooking(booking);
                    
                    // Calculate booking-specific linen order
                    if (booking && linenSetDefinition) {
                      const bookingSpecificItems = calculateBookingLinenOrder(booking, linenSetDefinition);
                      setEditableItems(bookingSpecificItems);
                    }
                    
                    // Set delivery date to 1 day before check-in
                    if (booking?.check_in) {
                      setDeliveryDate(subDays(new Date(booking.check_in), 1));
                    }
                  }
                }}
               >
                <SelectTrigger>
                  <SelectValue placeholder="Buchung auswählen (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keine Buchung zuordnen</SelectItem>
                  {availableBookings.map((booking) => (
                    <SelectItem key={booking.id} value={booking.id}>
                      {booking.guest_name} ({booking.number_of_guests} Gäste) - {
                        format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de })
                      }
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Booking Information */}
          {internalSelectedBooking && orderType === 'standard' && (
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
                    <span className="ml-2">{internalSelectedBooking.guest_name || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Gäste:</span>
                    <span className="ml-2">{internalSelectedBooking.number_of_guests || 'N/A'}</span>
                  </div>
                  {internalSelectedBooking.check_in && (
                    <div>
                      <span className="text-blue-700 font-medium">Check-in:</span>
                      <span className="ml-2">
                        {(() => {
                          try {
                            const date = new Date(internalSelectedBooking.check_in);
                            return isNaN(date.getTime()) ? 'Ungültiges Datum' : format(date, 'dd.MM.yyyy', { locale: de });
                          } catch {
                            return 'Ungültiges Datum';
                          }
                        })()}
                      </span>
                    </div>
                  )}
                  {internalSelectedBooking.check_out && (
                    <div>
                      <span className="text-blue-700 font-medium">Check-out:</span>
                      <span className="ml-2">
                        {(() => {
                          try {
                            const date = new Date(internalSelectedBooking.check_out);
                            return isNaN(date.getTime()) ? 'Ungültiges Datum' : format(date, 'dd.MM.yyyy', { locale: de });
                          } catch {
                            return 'Ungültiges Datum';
                          }
                        })()}
                      </span>
                    </div>
                  )}
                  {internalSelectedBooking.external_booking_id && (
                    <div className="col-span-2">
                      <span className="text-blue-700 font-medium">Buchungs-ID:</span>
                      <span className="ml-2">{internalSelectedBooking.external_booking_id}</span>
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

          {/* Delivery Type */}
          <div className="space-y-3">
            <Label>Art der Zustellung</Label>
            <RadioGroup 
              value={deliveryType} 
              onValueChange={(value: 'delivery' | 'pickup') => setDeliveryType(value)}
              className="flex flex-col space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="delivery" id="delivery" />
                <Label htmlFor="delivery" className="cursor-pointer">
                  🚚 Lieferung (Standard)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pickup" id="pickup" />
                <Label htmlFor="pickup" className="cursor-pointer">
                  📦 Abholung beim Anbieter
                </Label>
              </div>
            </RadioGroup>
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