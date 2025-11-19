import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getLinenStatusEmoji = (status: string) => {
  switch (status.toLowerCase()) {
    case 'critical':
    case 'kritisch':
      return '🔴';
    case 'warning':
    case 'niedrig':
      return '🟡';
    case 'good':
    case 'gut':
      return '🟢';
    default:
      return '❌';
  }
};

export const getHouseIcon = (houseName: string) => {
  if (houseName.toLowerCase().includes('wald')) return '🏔️';
  if (houseName.toLowerCase().includes('berg')) return '⛰️';
  if (houseName.toLowerCase().includes('siedlung')) return '🏘️';
  return '🏠';
};

export const translateLinenItem = (item: string): string => {
  const labels: Record<string, string> = {
    bedding: 'Bettwäsche',
    large_towels: 'Große Handtücher',
    small_towels: 'Kleine Handtücher',
    sauna_towels: 'Saunatücher',
    bath_mats: 'Badematten',
    sink_towels: 'WB-Handtücher',
    kitchen_towels: 'Küchenhandtücher',
    blankets: 'Decken',
    pillow_cases: 'Kopfkissen',
    table_linens: 'Tischwäsche',
  };
  return labels[item] || item;
};
