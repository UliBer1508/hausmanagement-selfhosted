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

/**
 * Haus-Symbol anhand des Namens.
 *
 * ACHTUNG (27.07.2026): Die Prüfung auf 'siedlung' traf das Venediger Chalet
 * NIE — das Haus heißt "Venediger Chalet", nicht "Venedigersiedlung Chalet".
 * Es bekam still das allgemeine 🏠. 'venediger' ist deshalb ergänzt;
 * 'siedlung' bleibt als Rückfallebene stehen, falls der Name irgendwo doch
 * so geschrieben ist.
 */
export const getHouseIcon = (houseName: string) => {
  const name = (houseName || '').toLowerCase();
  if (name.includes('wald')) return '🏔️';
  if (name.includes('berg')) return '⛰️';
  if (name.includes('venediger') || name.includes('siedlung')) return '🏘️';
  return '🏠';
};

export interface HouseColors {
  /** Vollton (Hex) — für Kästchen und Farbverläufe in der Monatsansicht */
  base: string;
  /** Randfarbe (Hex) */
  border: string;
  /** Schriftfarbe auf dem Vollton (Hex) */
  text: string;
  /** Tailwind-Klassen — für die Balken in der Timeline */
  barBg: string;
  barBorder: string;
  barText: string;
}

/**
 * Haus-Farben — EINE Quelle für Timeline und Monatsansicht.
 *
 * WARUM ZENTRAL (Lehre vom 27.07.2026): Vorher hielt jede Kalender-Komponente
 * eine eigene Zuordnung `{ 'Venedigersiedlung Chalet': … }` mit dem EXAKTEN
 * Hausnamen als Schlüssel. Das Haus heißt aber "Venediger Chalet" — der
 * Schlüssel griff nie, und die Komponenten fielen still auf Grau zurück.
 * Kein Fehler, keine Warnung, monatelang unbemerkt.
 *
 * Deshalb: Abgleich über NAMENSBESTANDTEILE statt exakter Gleichheit, und nur
 * an dieser einen Stelle. Weicht ein Hausname künftig ab ("Chalet Venediger",
 * "Venediger II"), greift die Farbe weiterhin.
 */
export const getHouseColors = (houseName: string): HouseColors => {
  const name = (houseName || '').toLowerCase();
  if (name.includes('wald')) {
    return {
      base: '#22d3ee',
      border: '#0891b2',
      text: '#164e63',
      barBg: 'bg-cyan-400',
      barBorder: 'border-cyan-600',
      barText: 'text-cyan-950',
    };
  }
  if (name.includes('venediger') || name.includes('siedlung')) {
    return {
      base: '#fbbf24',
      border: '#d97706',
      text: '#78350f',
      barBg: 'bg-amber-400',
      barBorder: 'border-amber-600',
      barText: 'text-amber-950',
    };
  }
  return {
    base: '#9ca3af',
    border: '#6b7280',
    text: '#111827',
    barBg: 'bg-gray-400',
    barBorder: 'border-gray-600',
    barText: 'text-gray-950',
  };
};

export const translateLinenItem = (item: string): string => {
  const labels: Record<string, string> = {
    bedding: 'Bettwäsche',
    large_towels: 'Badetücher',
    small_towels: 'Handtücher',
    sauna_towels: 'Saunatücher',
    bath_mats: 'Badematten',
    sink_towels: 'WB-Handtücher',
    kitchen_towels: 'Geschirrtücher',
    blankets: 'Decken',
    pillow_cases: 'Kopfkissen',
    table_linens: 'Tischwäsche',
  };
  return labels[item] || item;
};
