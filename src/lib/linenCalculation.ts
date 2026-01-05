/**
 * ============================================================
 * ZENTRALE WÄSCHE-BERECHNUNGSFUNKTION
 * ============================================================
 * 
 * Single Source of Truth für alle Wäsche-Mengen-Berechnungen.
 * Wird von LinenOrderDialog, BookingLinenOverview, Edge Functions verwendet.
 */

export interface LinenCalculationResult {
  orderItems: Record<string, number>;
  itemVariants: Record<string, string>;
  linenColor: string | null;
  totalItems: number;
}

interface CustomCategoryConfig {
  active?: boolean;
  label?: string;
  category?: string;
  color?: string;
  quantity?: number;
  calculation_type?: 'per_guest' | 'per_booking';
  availability?: 'always' | 'seasonal';
  season?: 'winter' | 'summer';
}

/**
 * Prüft ob ein Datum in der Wintersaison liegt (November - März)
 */
const isWinterSeason = (date: Date): boolean => {
  const month = date.getMonth() + 1;
  return month >= 11 || month <= 3;
};

/**
 * Berechnet Wäschebestellung basierend auf linen_set_definitions
 * 
 * @param linenDefinition - Die Linen Set Definition des Hauses
 * @param numberOfGuests - Anzahl der Gäste
 * @param checkInDate - Optional: Check-in Datum für saisonale Verfügbarkeit
 * @returns LinenCalculationResult mit orderItems, itemVariants und linenColor
 */
export const calculateLinenOrderFromDefinition = (
  linenDefinition: any,
  numberOfGuests: number,
  checkInDate?: Date
): LinenCalculationResult => {
  const orderItems: Record<string, number> = {};
  const itemVariants: Record<string, string> = {};
  
  if (!linenDefinition?.custom_categories) {
    console.warn('⚠️ Keine custom_categories in linen_set_definition gefunden');
    return { orderItems, itemVariants, linenColor: null, totalItems: 0 };
  }
  
  Object.entries(linenDefinition.custom_categories).forEach(([key, config]) => {
    const categoryConfig = config as CustomCategoryConfig;
    
    // Inaktive Kategorien überspringen
    if (!categoryConfig?.active) return;
    
    // Saisonale Verfügbarkeit prüfen
    if (categoryConfig.availability === 'seasonal' && checkInDate) {
      const isWinter = isWinterSeason(checkInDate);
      if (categoryConfig.season === 'winter' && !isWinter) return;
      if (categoryConfig.season === 'summer' && isWinter) return;
    }
    
    // Menge berechnen
    let qty = 0;
    if (categoryConfig.calculation_type === 'per_guest') {
      qty = numberOfGuests * (categoryConfig.quantity || 0);
    } else if (categoryConfig.calculation_type === 'per_booking') {
      qty = categoryConfig.quantity || 0;
    }
    
    // Nur hinzufügen wenn Menge > 0
    if (qty > 0) {
      orderItems[key] = qty;
      
      // Farbe speichern wenn vorhanden
      if (categoryConfig.color) {
        itemVariants[key] = categoryConfig.color;
      }
    }
  });
  
  // Hauptfarbe aus bedding oder pillow_cases ableiten
  const linenColor = itemVariants.bedding || itemVariants.pillow_cases || null;
  
  // Gesamtmenge berechnen
  const totalItems = Object.values(orderItems).reduce((sum, qty) => sum + qty, 0);
  
  return { orderItems, itemVariants, linenColor, totalItems };
};

/**
 * Legacy-Funktion für Rückwärtskompatibilität mit alten Spalten
 * 
 * @deprecated Verwende calculateLinenOrderFromDefinition stattdessen
 */
export const calculateLinenOrderLegacy = (
  linenDefinition: any,
  numberOfGuests: number
): Record<string, number> => {
  const items: Record<string, number> = {};
  const guests = numberOfGuests || 0;
  
  // Per-Guest Items (alte Spalten)
  if (linenDefinition?.bedding_per_guest) {
    items.bedding = guests * linenDefinition.bedding_per_guest;
  }
  if (linenDefinition?.large_towels_per_guest) {
    items.large_towels = guests * linenDefinition.large_towels_per_guest;
  }
  if (linenDefinition?.small_towels_per_guest) {
    items.small_towels = guests * linenDefinition.small_towels_per_guest;
  }
  if (linenDefinition?.sauna_towels_per_guest) {
    items.sauna_towels = guests * linenDefinition.sauna_towels_per_guest;
  }
  
  // Per-Booking Items (alte Spalten)
  if (linenDefinition?.bath_mats_per_booking) {
    items.bath_mats = linenDefinition.bath_mats_per_booking;
  }
  if (linenDefinition?.sink_towels_per_booking) {
    items.sink_towels = linenDefinition.sink_towels_per_booking;
  }
  if (linenDefinition?.kitchen_towels_per_booking) {
    items.kitchen_towels = linenDefinition.kitchen_towels_per_booking;
  }
  
  return Object.fromEntries(
    Object.entries(items).filter(([_, qty]) => qty > 0)
  );
};
