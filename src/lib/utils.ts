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
