export interface LinenItemConfig {
  label: string;
  icon: string;
  category: string;
  quantity: number;
  calculation_type: 'per_guest' | 'per_booking';
  availability: 'year_round' | 'seasonal';
  season: 'winter' | 'summer' | null;
  active: boolean;
}

/**
 * Zentrale Berechnung für Wäschebedarf aus custom_categories JSONB
 */
export const calculateLinenForBooking = (
  numberOfGuests: number,
  checkInDate: string,
  linenConfig: Record<string, LinenItemConfig>
): Record<string, number> => {
  const items: Record<string, number> = {};
  const checkInMonth = new Date(checkInDate).getMonth() + 1;
  
  Object.entries(linenConfig).forEach(([key, config]) => {
    if (!config.active) return;
    
    // Saisonale Prüfung
    if (config.availability === 'seasonal') {
      const isWinter = [11, 12, 1, 2, 3].includes(checkInMonth);
      const isSummer = [5, 6, 7, 8, 9].includes(checkInMonth);
      
      if (config.season === 'winter' && !isWinter) return;
      if (config.season === 'summer' && !isSummer) return;
    }
    
    // Mengenberechnung
    if (config.calculation_type === 'per_guest') {
      items[key] = config.quantity * numberOfGuests;
    } else {
      items[key] = config.quantity;
    }
  });
  
  return items;
};

/**
 * Fallback für alte Spalten-basierte Struktur (backward compatibility)
 */
export const calculateLinenFromOldColumns = (
  numberOfGuests: number,
  linenDef: any
): Record<string, number> => {
  const items: Record<string, number> = {};
  
  if (linenDef.bedding_per_guest) items.bedding = numberOfGuests * linenDef.bedding_per_guest;
  if (linenDef.large_towels_per_guest) items.large_towels = numberOfGuests * linenDef.large_towels_per_guest;
  if (linenDef.small_towels_per_guest) items.small_towels = numberOfGuests * linenDef.small_towels_per_guest;
  if (linenDef.sauna_towels_per_guest) items.sauna_towels = numberOfGuests * linenDef.sauna_towels_per_guest;
  if (linenDef.blankets_per_guest) items.blankets = numberOfGuests * linenDef.blankets_per_guest;
  if (linenDef.pillow_cases_per_guest) items.pillow_cases = numberOfGuests * linenDef.pillow_cases_per_guest;
  
  if (linenDef.bath_mats_per_booking) items.bath_mats = linenDef.bath_mats_per_booking;
  if (linenDef.sink_towels_per_booking) items.sink_towels = linenDef.sink_towels_per_booking;
  if (linenDef.kitchen_towels_per_booking) items.kitchen_towels = linenDef.kitchen_towels_per_booking;
  if (linenDef.table_linens_per_booking) items.table_linens = linenDef.table_linens_per_booking;
  
  return items;
};

/**
 * Übersetzt Item-Keys zu deutschen Labels (Fallback)
 */
export const translateItemType = (key: string): string => {
  const translations: Record<string, string> = {
    bedding: 'Bettwäsche',
    large_towels: 'Handtücher groß',
    small_towels: 'Handtücher klein',
    sauna_towels: 'Saunatücher',
    bath_mats: 'Badematten',
    sink_towels: 'WB-Handtücher',
    kitchen_towels: 'Küchentücher',
    table_linens: 'Tischwäsche',
    blankets: 'Decken',
    pillow_cases: 'Kissenbezüge',
  };
  
  return translations[key] || key;
};
