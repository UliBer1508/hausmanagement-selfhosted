import { LinenItemConfig, LinenSetDefinition, OLD_COLUMN_MAPPING, ItemColor, LinenColor } from '@/types/linen';

/**
 * Migrates old fixed columns to new custom_categories JSONB structure
 */
export const migrateOldToNewStructure = (linenDef: any): Record<string, LinenItemConfig> => {
  const customCategories: Record<string, LinenItemConfig> = {};

  // Check if custom_categories already exists and has data
  if (linenDef.custom_categories && Object.keys(linenDef.custom_categories).length > 0) {
    // Bestehende custom_categories zurückgeben - keine automatischen Modifikationen
    return linenDef.custom_categories;
  }

  // Migrate from old columns
  Object.entries(OLD_COLUMN_MAPPING).forEach(([oldKey, meta]) => {
    const quantity = linenDef[oldKey] || 0;
    const calculationType = oldKey.includes('_per_guest') ? 'per_guest' : 'per_booking';
    const cleanKey = oldKey.replace('_per_guest', '').replace('_per_booking', '');

    customCategories[cleanKey] = {
      key: cleanKey,
      label: meta.label,
      icon: meta.icon,
      category: meta.category,
      quantity: quantity,
      calculation_type: calculationType,
      availability: 'year_round',
      season: null,
      active: true,
      // Keine hardcodierten Default-Farben - müssen in DB definiert werden
    };
  });

  return customCategories;
};

/**
 * Validates a linen item key (lowercase, numbers, underscores only)
 */
export const validateLinenKey = (key: string): boolean => {
  return /^[a-z0-9_]+$/.test(key);
};

/**
 * Generates a unique key from a label
 */
export const generateKeyFromLabel = (label: string, existingKeys: string[]): string => {
  let baseKey = label
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  let key = baseKey;
  let counter = 1;

  while (existingKeys.includes(key)) {
    key = `${baseKey}_${counter}`;
    counter++;
  }

  return key;
};

/**
 * Groups linen items by category
 */
export const groupByCategory = (items: Record<string, LinenItemConfig>) => {
  const grouped: Record<string, LinenItemConfig[]> = {
    'Schlafbereich': [],
    'Badbereich': [],
    'Wellness': [],
    'Küchenbereich': []
  };

  Object.values(items).forEach(item => {
    if (grouped[item.category]) {
      grouped[item.category].push(item);
    }
  });

  return grouped;
};
