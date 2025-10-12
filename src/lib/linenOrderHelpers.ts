/**
 * Helper functions for linen order management
 */

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
 */
export const translateItemType = (key: string): string => {
  const translations: Record<string, string> = {
    bedding: 'Bettwäsche',
    large_towels: 'Große Handtücher',
    small_towels: 'Kleine Handtücher',
    sauna_towels: 'Saunahandtücher',
    sink_towels: 'Waschbeckenhandtücher',
    bath_mats: 'Badvorleger',
    kitchen_towels: 'Küchenhandtücher',
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
