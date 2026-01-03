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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, addDays, subDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { CalendarIcon, ShoppingCart, Mail, AlertTriangle, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { standardLinenOrderSchema, exceptionalLinenOrderSchema } from './schemas/LinenOrderSchema';
import { translateItemType, formatCurrency } from '@/lib/linenOrderHelpers';
import { LinenColor, LINEN_COLORS, getLinenColorLabel, ItemColor, ITEM_COLORS } from '@/types/linen';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Dynamisch prüfen ob Artikel Farbauswahl braucht basierend auf Kategorie
const getItemCategory = (itemType: string, linenDef: any): string | null => {
  const customCat = linenDef?.custom_categories?.[itemType];
  return customCat?.category || null;
};

// Schlafbereich-Artikel: LINEN_COLORS (grau gestreift, weiß gestreift, bunt)
const hasLinenColorByCategory = (itemType: string, linenDef: any): boolean => {
  const category = getItemCategory(itemType, linenDef);
  return category === 'Schlafbereich';
};

// Badbereich/Wellness-Artikel: ITEM_COLORS (weiß, grau)
const hasItemColorByCategory = (itemType: string, linenDef: any): boolean => {
  const category = getItemCategory(itemType, linenDef);
  return category === 'Badbereich' || category === 'Wellness';
};

// Fallback Kategorien-Definition (wenn keine custom_categories vorhanden)
const DEFAULT_LINEN_CATEGORIES = {
  sleeping: {
    label: '🛏️ Schlafbereich',
    items: ['bedding', 'pillow_cases', 'blankets']
  },
  bathroom: {
    label: '🛁 Badbereich',
    items: ['large_towels', 'small_towels', 'bath_mats', 'sink_towels']
  },
  wellness: {
    label: '🧖 Wellness',
    items: ['sauna_towels']
  },
  kitchen: {
    label: '🍴 Küche',
    items: ['kitchen_towels']
  }
};

// Fallback Labels
const DEFAULT_LINEN_LABELS: Record<string, string> = {
  bedding: 'Bettwäsche',
  large_towels: 'Badetücher',
  small_towels: 'Handtücher',
  sauna_towels: 'Saunatücher',
  bath_mats: 'Badematten',
  sink_towels: 'WB-Handtücher',
  kitchen_towels: 'Geschirrtücher',
  blankets: 'Decken',
  pillow_cases: 'Kissenbezüge',
};

// Dynamisch Kategorien aus custom_categories laden
const buildCategoriesFromDefinition = (linenDef: any) => {
  const categories: Record<string, { label: string; items: string[] }> = {
    sleeping: { label: '🛏️ Schlafbereich', items: [] },
    bathroom: { label: '🛁 Badbereich', items: [] },
    wellness: { label: '🧖 Wellness', items: [] },
    kitchen: { label: '🍴 Küche', items: [] },
  };
  
  if (linenDef?.custom_categories) {
    Object.entries(linenDef.custom_categories).forEach(([key, config]: [string, any]) => {
      if (config?.active !== false) {
        const category = config.category || 'Schlafbereich';
        if (category === 'Schlafbereich') categories.sleeping.items.push(key);
        else if (category === 'Badbereich') categories.bathroom.items.push(key);
        else if (category === 'Wellness') categories.wellness.items.push(key);
        else if (category === 'Küchenbereich') categories.kitchen.items.push(key);
      }
    });
  }
  
  // Fallback wenn keine custom_categories: Standard-Items verwenden
  if (Object.values(categories).every(cat => cat.items.length === 0)) {
    return DEFAULT_LINEN_CATEGORIES;
  }
  
  return categories;
};

// Dynamisch Labels aus custom_categories laden
const buildLabelsFromDefinition = (linenDef: any): Record<string, string> => {
  const labels: Record<string, string> = { ...DEFAULT_LINEN_LABELS };
  
  if (linenDef?.custom_categories) {
    Object.entries(linenDef.custom_categories).forEach(([key, config]: [string, any]) => {
      if (config?.label) {
        labels[key] = config.label;
      }
    });
  }
  
  return labels;
};

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
    status?: 'offen' | 'ausstehend' | 'delivered' | 'cancelled';
    sendEmail?: boolean;
    linenColor?: LinenColor;
    itemColors?: Record<string, ItemColor | LinenColor>;
  }) => void;
  onSendEmail?: (orderId: string) => void;
  isCreating?: boolean;
  allowExceptionalOrder?: boolean;
  initialData?: {
    deliveryDate?: string;
    deliveryType?: 'delivery' | 'pickup';
    notes?: string;
    status?: 'offen' | 'ausstehend' | 'delivered' | 'cancelled';
    linenColor?: LinenColor;
    item_variants?: Record<string, ItemColor | LinenColor>;
  };
  mode?: 'create' | 'edit';
  generatedOrderData?: any;
  defaultLinenColor?: LinenColor;
}

// Helper: Lädt alle aktiven Wäsche-Artikel aus der Definition für Ausnahmebestellungen
const getLinenSetFromDefinition = (linenDef: any): Record<string, number> => {
  const items: Record<string, number> = {};
  
  // Neue JSONB-Struktur: custom_categories
  if (linenDef?.custom_categories) {
    Object.entries(linenDef.custom_categories).forEach(([key, config]: [string, any]) => {
      if (config?.active !== false && config?.quantity > 0) {
        items[key] = 1; // Basismenge 1 für jeden aktiven Artikel
      }
    });
  }
  
  // Fallback: Alte Spalten (für Abwärtskompatibilität)
  if (Object.keys(items).length === 0) {
    if (linenDef?.bedding_per_guest > 0) items.bedding = 1;
    if (linenDef?.large_towels_per_guest > 0) items.large_towels = 1;
    if (linenDef?.small_towels_per_guest > 0) items.small_towels = 1;
    if (linenDef?.sauna_towels_per_guest > 0) items.sauna_towels = 1;
    if (linenDef?.pillow_cases_per_guest > 0) items.pillow_cases = 1;
    if (linenDef?.blankets_per_guest > 0) items.blankets = 1;
    if (linenDef?.bath_mats_per_booking > 0) items.bath_mats = 1;
    if (linenDef?.sink_towels_per_booking > 0) items.sink_towels = 1;
    if (linenDef?.kitchen_towels_per_booking > 0) items.kitchen_towels = 1;
  }
  
  return items;
};

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
  initialData,
  mode = 'create',
  generatedOrderData,
  defaultLinenColor
}: LinenOrderDialogProps) => {
  // Lade linenSetDefinition aus DB falls nicht als Prop übergeben
  const { data: fetchedLinenDefinition } = useQuery({
    queryKey: ['linen-set-definition', houseId],
    queryFn: async () => {
      if (!houseId) return null;
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', houseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!houseId && !linenSetDefinition,
  });

  // Verwende entweder den Prop oder die geladenen Daten
  const effectiveLinenDefinition = linenSetDefinition || fetchedLinenDefinition;
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
  const [status, setStatus] = useState<'offen' | 'ausstehend' | 'delivered' | 'cancelled'>(
    initialData?.status || 'offen'
  );
  const [sendToTeuni, setSendToTeuni] = useState(false);

  // Query to check if there are any 'offen' orders in the system
  const { data: openOrdersCount } = useQuery({
    queryKey: ['linen-orders-open-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('linen_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'offen');
      return count || 0;
    },
    enabled: open && mode === 'create' && !initialData?.status,
  });

  // Dynamic default status: always default to 'offen' for new orders
  useEffect(() => {
    if (open && mode === 'create' && !initialData?.status) {
      setStatus('offen');
    }
  }, [open, mode, initialData?.status]);
  const [editableItems, setEditableItems] = useState(orderItems);
  const [orderType, setOrderType] = useState<'standard' | 'exceptional'>(
    selectedBooking ? 'standard' : 'exceptional'
  );
  
  const [itemColors, setItemColors] = useState<Record<string, ItemColor | LinenColor>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Debug logging for generatedOrderData
  useEffect(() => {
    if (open) {
      console.log('📋 LinenOrderDialog opened with:', {
        generatedOrderData,
        orderItems,
        estimatedCost: generatedOrderData?.estimated_cost,
        itemDetails: generatedOrderData?.item_details,
        order_items: generatedOrderData?.order_items,
      });
    }
  }, [open, generatedOrderData, orderItems]);

  // Update state when props change (e.g., when opening with AI-generated data)
  useEffect(() => {
    if (open && mode === 'create') {
      // PRIO 1: Use generatedOrderData if available (Edge Function result)
      if (generatedOrderData?.order_items) {
        console.log('✅ Using generatedOrderData.order_items:', generatedOrderData.order_items);
        setEditableItems(generatedOrderData.order_items);
        
        // Set delivery date if available in generatedOrderData
        if (generatedOrderData.booking?.check_in && !initialData?.deliveryDate) {
          setDeliveryDate(subDays(new Date(generatedOrderData.booking.check_in), 1));
        }
      }
      // PRIO 2: Calculate locally if booking + definition available
      else if (selectedBooking && linenSetDefinition) {
        console.log('⚙️ Calculating locally from booking + definition');
        const bookingSpecificItems = calculateBookingLinenOrder(selectedBooking, linenSetDefinition);
        setEditableItems(bookingSpecificItems);
        
        // Set delivery date to 1 day before check-in if not overridden by initialData
        if (selectedBooking.check_in && !initialData?.deliveryDate) {
          setDeliveryDate(subDays(new Date(selectedBooking.check_in), 1));
        }
      } 
      // PRIO 2.5: Für Ausnahmebestellungen - Wäsche-Set aus Definition laden
      else if (!selectedBooking && linenSetDefinition && orderType === 'exceptional') {
        console.log('📦 Loading linen set for exceptional order from definition');
        const linenSetItems = getLinenSetFromDefinition(linenSetDefinition);
        setEditableItems(linenSetItems);
      }
      // PRIO 3: Fallback to orderItems
      else {
        console.log('🔄 Using fallback orderItems:', orderItems);
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
      if (initialData?.status) {
        setStatus(initialData.status);
      }
    }
  }, [open, mode, selectedBooking, linenSetDefinition, initialData, orderItems, generatedOrderData, orderType]);

  // Initialisiere Artikelfarben - PRIO 1: aus initialData (Edit-Mode), PRIO 2: aus linenSetDefinition
  useEffect(() => {
    if (open) {
      const colors: Record<string, ItemColor | LinenColor> = {};
      
      // PRIO 1: Im Edit-Mode gespeicherte Farben aus initialData.item_variants laden
      if (mode === 'edit' && initialData?.item_variants) {
        Object.entries(initialData.item_variants).forEach(([key, color]) => {
          colors[key] = color as ItemColor | LinenColor;
        });
      }
      // PRIO 2: Nur im Create-Mode aus effectiveLinenDefinition laden
      else if (effectiveLinenDefinition?.custom_categories) {
        Object.entries(effectiveLinenDefinition.custom_categories).forEach(([key, config]: [string, any]) => {
          if (config?.color) {
            colors[key] = config.color;
          }
        });
      }
      
      // Keine hardcodierten Fallbacks - Farben kommen NUR aus config.color in der Datenbank
      setItemColors(colors);
    }
  }, [open, mode, effectiveLinenDefinition, initialData]);

  // Dynamische Kategorien und Labels aus Definition aufbauen
  const dynamicCategories = useMemo(() => {
    return buildCategoriesFromDefinition(effectiveLinenDefinition);
  }, [effectiveLinenDefinition]);
  
  const dynamicLabels = useMemo(() => {
    return buildLabelsFromDefinition(effectiveLinenDefinition);
  }, [effectiveLinenDefinition]);

  // Separater useEffect für Edit-Mode: Lade tatsächliche Order-Items und Buchung
  useEffect(() => {
    if (open && mode === 'edit') {
      // Setze die Buchung aus den Props
      setInternalSelectedBooking(selectedBooking);
      
      // Setze orderType basierend auf Buchung
      setOrderType(selectedBooking ? 'standard' : 'exceptional');
      
      if (orderItems) {
        // Alle verfügbaren Artikel aus der Definition mit Wert 0 initialisieren
        const allAvailableItems: Record<string, number> = {};
        if (effectiveLinenDefinition?.custom_categories) {
          Object.entries(effectiveLinenDefinition.custom_categories).forEach(([key, config]: [string, any]) => {
            if (config?.active !== false) {
              allAvailableItems[key] = 0;
            }
          });
        } else {
          // Fallback: Standard-Artikel
          Object.values(DEFAULT_LINEN_CATEGORIES).forEach(cat => {
            cat.items.forEach(item => {
              allAvailableItems[item] = 0;
            });
          });
        }
        
        // Bestehende Werte überschreiben
        // Nur Werte aus orderItems übernehmen, die auch in allAvailableItems existieren
        const mergedItems = { ...allAvailableItems };
        Object.entries(orderItems).forEach(([key, value]) => {
          if (key in allAvailableItems) {
            mergedItems[key] = value as number;
          }
        });
        setEditableItems(mergedItems);
      }
    }
  }, [open, mode, orderItems, selectedBooking, effectiveLinenDefinition]);

  const totalItems = useMemo(() => 
    Object.values(editableItems).reduce((sum, count) => sum + count, 0),
    [editableItems]
  );

  const estimatedCost = generatedOrderData?.estimated_cost || 0;
  const itemDetails = generatedOrderData?.item_details || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors([]);
    
    // Im Edit-Mode: ALLE Artikel behalten (auch mit Menge 0)
    // Im Create-Mode: Nur Artikel mit Menge > 0
    const filteredItems = mode === 'edit' 
      ? editableItems
      : Object.fromEntries(
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
          status: status,
          sendEmail: sendToTeuni,
          linenColor: null,
          itemColors: itemColors,
        });
      } else {
        const validatedData = exceptionalLinenOrderSchema.parse({
          ...baseOrderData,
          orderType: 'exceptional',
        });
        
        onCreateOrder({
          ...baseOrderData,
          orderType: 'exceptional',
          notes: notes.trim(),
          status: status,
          sendEmail: sendToTeuni,
          linenColor: null,
          itemColors: itemColors,
        });
      }

      // Reset form
      setNotes('');
      setDeliveryDate(addDays(new Date(), 2));
      setDeliveryType('delivery');
      setStatus('offen');
      setEditableItems(orderItems);
      setOrderType(selectedBooking ? 'standard' : 'exceptional');
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            {mode === 'edit' ? 'Wäschebestellung bearbeiten' : `Wäschebestellung für ${houseName}`}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {mode === 'edit' 
              ? 'Bearbeiten Sie die Wäschebestellung und passen Sie die Details an.'
              : 'Erstellen Sie eine neue Wäschebestellung für dieses Haus mit optionaler Buchungsverknüpfung.'
            }
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




          {mode === 'create' && availableBookings.length > 0 && orderType === 'standard' && (
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
          {internalSelectedBooking && (mode === 'edit' || orderType === 'standard') && (
            <Card className="bg-laundry-bg border-laundry-border">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-blue-600" />
                  Verknüpfte Buchung
                  {mode === 'edit' && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      Festgelegt
                    </Badge>
                  )}
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

          {/* Kosten-Preview wenn verfügbar */}
          {generatedOrderData && estimatedCost > 0 && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="pt-6">
                <div className="text-center space-y-1">
                  <p className="text-sm text-muted-foreground">Geschätzte Kosten</p>
                  <p className="text-4xl font-bold text-primary">
                    {formatCurrency(estimatedCost)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {totalItems} Artikel gesamt
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {estimatedCost > 500 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Diese Bestellung ist ungewöhnlich hoch. Bitte prüfen Sie die Mengen sorgfältig.
              </AlertDescription>
            </Alert>
          )}

          {/* Detaillierte Bestellübersicht mit Preisen */}
          {generatedOrderData && itemDetails.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Bestellübersicht mit Preisen</CardTitle>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          )}

          {/* Order Items - Kategorisiert */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Bestellpositionen</span>
                <Badge variant="secondary">{totalItems} Teile</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(dynamicCategories).map(([catKey, category]) => {
                // Kategorien ohne Artikel überspringen
                if (category.items.length === 0) return null;
                
                // Im Create-Mode: nur Kategorien mit Artikeln > 0 anzeigen
                // Im Edit-Mode: alle Kategorien anzeigen
                const categoryItems = category.items.filter(itemType => 
                  mode === 'edit' || (editableItems[itemType] && editableItems[itemType] > 0)
                );
                
                if (categoryItems.length === 0 && mode === 'create') return null;
                
                const itemsToShow = mode === 'edit' ? category.items : categoryItems;
                
                return (
                  <div key={catKey} className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">{category.label}</div>
                    <div className="space-y-2">
                      {itemsToShow.map(itemType => {
                        const quantity = editableItems[itemType] || 0;
                        const isActive = quantity > 0;
                        
                        return (
                          <div 
                            key={itemType} 
                            className={cn(
                              "flex items-center justify-between p-2 border rounded-lg transition-colors",
                              isActive ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/30"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className={cn("font-medium text-sm", !isActive && "text-muted-foreground")}>
                                {dynamicLabels[itemType] || itemType}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                            {/* Farbauswahl für Schlafbereich: LINEN_COLORS */}
                              {hasLinenColorByCategory(itemType, effectiveLinenDefinition) && isActive && (
                                <Select
                                  value={itemColors[itemType] || effectiveLinenDefinition?.custom_categories?.[itemType]?.color || ''}
                                  onValueChange={(v) => setItemColors(prev => ({ ...prev, [itemType]: v as LinenColor }))}
                                >
                                  <SelectTrigger className="w-32 h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {LINEN_COLORS.map((color) => (
                                      <SelectItem key={color.key} value={color.key}>
                                        {color.icon} {color.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {/* Farbauswahl für Badbereich/Wellness: ITEM_COLORS */}
                              {hasItemColorByCategory(itemType, effectiveLinenDefinition) && isActive && (
                                <Select
                                  value={itemColors[itemType] || effectiveLinenDefinition?.custom_categories?.[itemType]?.color || ''}
                                  onValueChange={(v) => setItemColors(prev => ({ ...prev, [itemType]: v as ItemColor }))}
                                >
                                  <SelectTrigger className="w-24 h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ITEM_COLORS.map((color) => (
                                      <SelectItem key={color.key} value={color.key}>
                                        {color.icon} {color.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              
                              {/* Increment/Decrement Buttons */}
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => updateItemQuantity(itemType, quantity - 1)}
                                  disabled={quantity <= 0}
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number"
                                  min="0"
                                  value={quantity}
                                  onChange={(e) => updateItemQuantity(itemType, parseInt(e.target.value) || 0)}
                                  className="w-14 h-8 text-center text-sm"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => updateItemQuantity(itemType, quantity + 1)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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

          {/* Status Selection - nur im Edit Mode */}
          {mode === 'edit' && (
            <div className="space-y-2">
              <Label htmlFor="status">Bestellstatus</Label>
              <Select value={status} onValueChange={(value: any) => setStatus(value)}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Status wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="offen">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Offen</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ausstehend">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                      <span>Ausstehend</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="delivered">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span>Geliefert</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="cancelled">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span>Storniert</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

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
                    Zusätzlich per E-Mail an Wäscherei senden
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Nach dem Speichern automatisch den E-Mail-Dialog öffnen
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
              {isCreating ? (
                mode === 'edit' ? 'Wird aktualisiert...' : 'Erstelle Bestellung...'
              ) : (
                mode === 'edit' ? 'Bestellung aktualisieren' : 'Bestellung erstellen'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LinenOrderDialog;