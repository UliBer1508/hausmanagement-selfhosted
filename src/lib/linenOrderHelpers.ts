import { toISODate } from '@/lib/dateHelpers';
/**
 * ============================================================
 * LINEN ORDER STATUS STANDARD - VERBINDLICH FÜR GESAMTES SYSTEM
 * ============================================================
 * 
 * Diese Datei definiert den einzigen Wahrheitspunkt für 
 * Wäschebestellungs-Status im gesamten System.
 * 
 * WORKFLOW:
 * 1. Bestellung erstellt → Status: OFFEN
 * 2. Benutzer bestätigt → Status: AUSSTEHEND  
 * 3. Lieferung erfolgt → Status: DELIVERED
 * 4. (Optional) Stornierung → Status: CANCELLED
 * 
 * NIEMALS VERWENDEN (Legacy-Werte):
 * - 'pending' (ersetzt durch 'ausstehend')
 * - 'bestellt' (ersetzt durch 'ausstehend')
 * - 'assigned' (nicht mehr verwendet)
 * 
 * @module linenOrderHelpers
 */

/**
 * Extracts dynamic labels from linen_set_definitions.custom_categories
 */
export const getLabelsFromLinenDef = (linenDef: any): Record<string, string> => {
  const labels: Record<string, string> = {};
  if (linenDef?.custom_categories) {
    Object.entries(linenDef.custom_categories).forEach(([key, config]: [string, any]) => {
      if (config?.label) {
        labels[key] = config.label;
      }
    });
  }
  return labels;
};

/**
 * Extracts dynamic categories from linen_set_definitions.custom_categories
 */
export const getCategoriesFromLinenDef = (linenDef: any): Record<string, string> => {
  const categories: Record<string, string> = {};
  if (linenDef?.custom_categories) {
    Object.entries(linenDef.custom_categories).forEach(([key, config]: [string, any]) => {
      if (config?.category) {
        categories[key] = config.category;
      }
    });
  }
  return categories;
};

/**
 * Calculates delivery date (3 days before check-in)
 */
export const calculateDeliveryDate = (checkInDate: string): string => {
  const checkIn = new Date(checkInDate);
  const deliveryDate = new Date(checkIn);
  deliveryDate.setDate(deliveryDate.getDate() - 3);
  return toISODate(deliveryDate);
};

/**
 * Translates linen item type keys to German
 * Optionally accepts dynamic labels from custom_categories
 */
export const translateItemType = (
  key: string, 
  customLabels?: Record<string, string>
): string => {
  // If dynamic labels provided, use them first
  if (customLabels && customLabels[key]) {
    return customLabels[key];
  }
  
  // Fallback to hard-coded translations
  const translations: Record<string, string> = {
    bedding: 'Bettwäsche',
    large_towels: 'Badetücher',
    small_towels: 'Handtücher',
    sauna_towels: 'Saunatücher',
    sink_towels: 'WB-Handtücher',
    bath_mats: 'Badvorleger',
    kitchen_towels: 'Geschirrtücher',
    pillow_cases: 'Kopfkissen',
    spannbetttuch: 'Spannbetttücher',
  };
  return translations[key] || key;
};

/**
 * Gets badge variant based on urgency/days until check-in
 */
export const getUrgencyVariant = (days: number): 'destructive' | 'default' | 'secondary' => {
  if (days <= 7) return 'destructive';
  if (days <= 14) return 'default';
  return 'secondary';
};

/**
 * Gets urgency label
 */
export const getUrgencyLabel = (days: number): string => {
  if (days <= 7) return 'DRINGEND';
  if (days <= 14) return 'Bald fällig';
  return 'Normal';
};

/**
 * Formats currency
 */
export const formatCurrency = (amount: number, currency: string = 'EUR'): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
  }).format(amount);
};

/**
 * ============================================================
 * STANDARDISIERTE LINEN ORDER STATUS - VERBINDLICH
 * ============================================================
 * 
 * WICHTIG: Immer diese Konstanten verwenden, niemals Strings hardcoden!
 * 
 * @example
 * import { LINEN_ORDER_STATUSES } from '@/lib/linenOrderHelpers';
 * 
 * // Richtig:
 * if (order.status === LINEN_ORDER_STATUSES.OFFEN) { ... }
 * 
 * // Falsch:
 * if (order.status === 'offen') { ... }
 */
export const LINEN_ORDER_STATUSES = {
  /** Muss vom Benutzer bestätigt werden (Farbe: Amber/Orange) */
  OFFEN: 'offen',
  /** Bestätigt, wartet auf Lieferung (Farbe: Gelb) */
  AUSSTEHEND: 'ausstehend',
  /** Wurde geliefert (Farbe: Grün) */
  DELIVERED: 'delivered',
  /** Bestellung wurde storniert (Farbe: Rot) */
  CANCELLED: 'cancelled'
} as const;

/** Type für gültige Linen Order Status */
export type LinenOrderStatus = typeof LINEN_ORDER_STATUSES[keyof typeof LINEN_ORDER_STATUSES];

/** Array aller gültigen Status (für .in() Queries) */
export const ALL_LINEN_ORDER_STATUSES: LinenOrderStatus[] = Object.values(LINEN_ORDER_STATUSES);

/** Aktive (nicht abgeschlossene) Status */
export const ACTIVE_LINEN_ORDER_STATUSES: LinenOrderStatus[] = [
  LINEN_ORDER_STATUSES.OFFEN,
  LINEN_ORDER_STATUSES.AUSSTEHEND
];

/** 
 * Prüft ob ein Status ein gültiger LinenOrderStatus ist
 * @param status - Der zu prüfende Status-String
 * @returns true wenn gültiger Status
 */
export const isValidLinenOrderStatus = (status: string): status is LinenOrderStatus => {
  return ALL_LINEN_ORDER_STATUSES.includes(status as LinenOrderStatus);
};

/**
 * Translates linen order status to German
 */
export const translateLinenOrderStatus = (status: string): string => {
  const translations: Record<string, string> = {
    offen: 'Offen',
    ausstehend: 'Ausstehend',
    delivered: 'Geliefert',
    cancelled: 'Storniert',
  };
  return translations[status] || status;
};

/**
 * Gets badge variant for linen order status
 */
export const getLinenStatusBadge = (status: string): { className: string; icon: string; label: string } => {
  switch (status) {
    case 'offen':
      return { className: 'bg-amber-100 text-amber-800 border-amber-300', icon: '📝', label: 'Offen' };
    case 'ausstehend':
      return { className: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: '⏳', label: 'Ausstehend' };
    case 'delivered':
      return { className: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: '📦', label: 'Geliefert' };
    case 'cancelled':
      return { className: 'bg-red-100 text-red-800 border-red-300', icon: '❌', label: 'Storniert' };
    default:
      return { className: 'bg-gray-100 text-gray-800 border-gray-300', icon: '❓', label: status };
  }
};

/**
 * ============================================================
 * VALIDIERUNGSFUNKTION FÜR WÄSCHEBESTELLUNGEN
 * ============================================================
 * 
 * Prüft ob alle erforderlichen Felder vorhanden sind bevor
 * eine Bestellung gespeichert wird.
 */
export interface LinenOrderValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const validateLinenOrderData = (orderData: {
  items: Record<string, number>;
  item_variants?: Record<string, string> | null;
  linen_color?: string | null;
  house_id: string;
}): LinenOrderValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Pflichtfelder prüfen
  if (!orderData.items || Object.keys(orderData.items).length === 0) {
    errors.push('Keine Bestellartikel angegeben');
  }
  
  if (!orderData.house_id) {
    errors.push('Keine Haus-ID angegeben');
  }
  
  // Warnung wenn item_variants fehlen (nicht kritisch, wird aus DB geladen)
  if (!orderData.item_variants || Object.keys(orderData.item_variants).length === 0) {
    warnings.push('Keine Artikelfarben angegeben - werden aus Haus-Definition geladen');
    console.warn('⚠️ Wäsche-Bestellung ohne item_variants - wird aus Definition geladen');
  }
  
  // Prüfen ob alle Items auch Farben haben
  if (orderData.items && orderData.item_variants) {
    const itemsWithoutColor = Object.keys(orderData.items).filter(
      key => !orderData.item_variants?.[key]
    );
    if (itemsWithoutColor.length > 0) {
      warnings.push(`Fehlende Farben für: ${itemsWithoutColor.join(', ')}`);
    }
  }
  
  return { 
    valid: errors.length === 0, 
    errors,
    warnings
  };
};
