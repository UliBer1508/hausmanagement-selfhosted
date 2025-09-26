import { z } from 'zod';

// Schema für normale Wäschebestellungen (mit Buchungsverknüpfung)
export const standardLinenOrderSchema = z.object({
  orderItems: z.record(z.number().min(0)),
  notes: z.string().optional(),
  deliveryDate: z.string().min(1, 'Lieferdatum ist erforderlich'),
  deliveryType: z.enum(['delivery', 'pickup']).default('delivery'),
  booking_id: z.string().min(1, 'Buchungsverknüpfung ist erforderlich'),
  house_id: z.string().min(1, 'Haus ist erforderlich'),
});

// Schema für Ausnahme-Bestellungen (Generalreinigung, Inventar-Auffüllung)
export const exceptionalLinenOrderSchema = z.object({
  orderItems: z.record(z.number().min(0)),
  notes: z.string().min(1, 'Begründung für Ausnahme-Bestellung erforderlich'),
  deliveryDate: z.string().min(1, 'Lieferdatum ist erforderlich'),
  deliveryType: z.enum(['delivery', 'pickup']).default('delivery'),
  house_id: z.string().min(1, 'Haus ist erforderlich'),
  orderType: z.literal('exceptional'),
  exceptionReason: z.enum([
    'general_cleaning', 
    'inventory_restock', 
    'emergency_order', 
    'maintenance'
  ]),
});

// Union Schema für alle Bestellungstypen
export const linenOrderSchema = z.union([
  standardLinenOrderSchema,
  exceptionalLinenOrderSchema
]);

export type StandardLinenOrder = z.infer<typeof standardLinenOrderSchema>;
export type ExceptionalLinenOrder = z.infer<typeof exceptionalLinenOrderSchema>;
export type LinenOrderData = z.infer<typeof linenOrderSchema>;