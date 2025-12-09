/**
 * Helper functions for linen order management
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
  return deliveryDate.toISOString().split('T')[0];
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
 * Translates linen order status to German
 */
export const translateLinenOrderStatus = (status: string): string => {
  const translations: Record<string, string> = {
    offen: 'Offen',
    pending: 'Ausstehend',
    assigned: 'Zugewiesen',
    confirmed: 'Bestätigt',
    delivered: 'Geliefert',
    cancelled: 'Storniert',
  };
  return translations[status] || status;
};
