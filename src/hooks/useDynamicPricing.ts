// useDynamicPricing.ts
// PriceLabs-inspirierter Algorithmus für Ferienhaus Manager
// Einbinden in dein Lovable-Projekt unter /src/hooks/useDynamicPricing.ts

export interface PricingInput {
  basePrice: number;          // Dein Standardpreis pro Nacht
  checkInDate: Date;          // Gewünschtes Einchecken
  marketOccupancy: number;    // Aktuelle Marktauslastung 0–1 (z.B. 0.72)
  hasLocalEvent?: boolean;    // Lokales Event an diesem Tag?
  eventSize?: 'small' | 'large' | 'festival';
  isGapDay?: boolean;         // Lücke zwischen Buchungen (Orphan Day)?
  gapLength?: number;         // Wie viele Lücken-Tage?
  minPrice?: number;          // Absolutes Minimum (default: base * 0.55)
  maxPrice?: number;          // Absolutes Maximum (default: base * 2.8)
}

export interface PricingOutput {
  recommendedPrice: number;
  minPrice: number;
  maxPrice: number;
  factors: {
    seasonality: number;
    dayOfWeek: number;
    leadTime: number;
    occupancy: number;
    event: number;
    gapDiscount: number;
  };
  bookingProbability: number;   // 0–1
  strategy: 'last-minute' | 'standard' | 'far-out';
  tags: string[];
}

// ─── Faktoren ────────────────────────────────────────────────────────────────

/** Saisonalität anhand Monat (anpassbar an deinen Markt) */
function getSeasonFactor(date: Date): number {
  const month = date.getMonth(); // 0=Jan, 11=Dez
  const factors: Record<number, number> = {
    0: 0.75,  // Januar – Nebensaison
    1: 0.78,
    2: 0.90,  // März – Frühling
    3: 1.00,
    4: 1.10,
    5: 1.25,  // Juni – Hochsaison Start
    6: 1.50,  // Juli – Hochsaison
    7: 1.55,  // August – Peak
    8: 1.20,  // September – Nachsaison
    9: 0.95,
    10: 0.80,
    11: 1.10, // Dezember – Weihnachten/Silvester
  };
  return factors[month] ?? 1.0;
}

/** Wochentag-Faktor: Wochenenden teurer */
function getDayOfWeekFactor(date: Date): number {
  const dow = date.getDay(); // 0=So, 6=Sa
  const factors: Record<number, number> = {
    0: 1.10,  // Sonntag
    1: 0.80,  // Montag
    2: 0.82,  // Dienstag
    3: 0.88,  // Mittwoch
    4: 1.00,  // Donnerstag
    5: 1.28,  // Freitag
    6: 1.32,  // Samstag
  };
  return factors[dow] ?? 1.0;
}

/**
 * Lead-Time-Faktor:
 * - Kurzfristig (0–7 Tage): Rabatt, um leere Nächte zu füllen
 * - Weit voraus (>90 Tage): Aufschlag als Puffer (Far-Out Premium)
 */
function getLeadTimeFactor(daysUntilCheckIn: number): number {
  if (daysUntilCheckIn <= 1)   return 0.75;  // Sofort-Rabatt
  if (daysUntilCheckIn <= 3)   return 0.82;
  if (daysUntilCheckIn <= 7)   return 0.90;  // Last-Minute
  if (daysUntilCheckIn <= 14)  return 0.96;
  if (daysUntilCheckIn <= 30)  return 1.00;  // Referenz
  if (daysUntilCheckIn <= 60)  return 1.05;
  if (daysUntilCheckIn <= 120) return 1.12;  // Far-Out Premium
  if (daysUntilCheckIn <= 180) return 1.18;
  return 1.22;                               // Sehr früh buchen
}

/** Marktauslastungs-Faktor: Bei hoher Nachfrage Preis erhöhen */
function getOccupancyFactor(occupancy: number): number {
  // occupancy: 0.0 = 0%, 1.0 = 100%
  if (occupancy < 0.20) return 0.82;
  if (occupancy < 0.40) return 0.92;
  if (occupancy < 0.60) return 1.00;
  if (occupancy < 0.75) return 1.12;
  if (occupancy < 0.88) return 1.28;
  return 1.45;
}

/** Event-Multiplikator */
function getEventFactor(hasEvent: boolean, size?: string): number {
  if (!hasEvent) return 1.0;
  if (size === 'festival') return 1.60;
  if (size === 'large')    return 1.35;
  return 1.15; // small
}

/** Orphan-Day / Lücken-Rabatt: Lieber weniger verdienen als leer bleiben */
function getGapFactor(isGap: boolean, gapLength: number): number {
  if (!isGap) return 1.0;
  if (gapLength === 1) return 0.82; // Einzelne Lücke – sehr aggressiver Rabatt
  if (gapLength === 2) return 0.88;
  return 0.94;
}

// ─── Buchungswahrscheinlichkeit (vereinfachte Elastizitätskurve) ──────────────

function calcBookingProbability(priceRatio: number, occupancy: number): number {
  // priceRatio = finalPrice / basePrice
  // Basis-Wahrscheinlichkeit aus Marktauslastung
  const baseProb = 0.3 + occupancy * 0.55;
  // Elastizität: höherer Preis = geringere WS
  const elasticity = Math.max(0.05, baseProb * Math.pow(0.70, priceRatio - 1));
  return Math.min(0.95, Math.max(0.03, elasticity));
}

// ─── Hauptfunktion ────────────────────────────────────────────────────────────

export function calculateDynamicPrice(input: PricingInput): PricingOutput {
  const {
    basePrice,
    checkInDate,
    marketOccupancy,
    hasLocalEvent = false,
    eventSize,
    isGapDay = false,
    gapLength = 1,
    minPrice: customMin,
    maxPrice: customMax,
  } = input;

  const today = new Date();
  const daysUntilCheckIn = Math.max(
    0,
    Math.round((checkInDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  );

  // Alle Faktoren berechnen
  const seasonality  = getSeasonFactor(checkInDate);
  const dayOfWeek    = getDayOfWeekFactor(checkInDate);
  const leadTime     = getLeadTimeFactor(daysUntilCheckIn);
  const occupancy    = getOccupancyFactor(marketOccupancy);
  const event        = getEventFactor(hasLocalEvent, eventSize);
  const gapDiscount  = getGapFactor(isGapDay, gapLength);

  // Preis berechnen
  const rawPrice = basePrice * seasonality * dayOfWeek * leadTime * occupancy * event * gapDiscount;

  // Min/Max-Grenzen anwenden (PriceLabs nennt das "Price Floors & Ceilings")
  const minPrice = customMin ?? Math.round(basePrice * 0.55);
  const maxPrice = customMax ?? Math.round(basePrice * 2.80);
  const recommendedPrice = Math.min(maxPrice, Math.max(minPrice, Math.round(rawPrice)));

  // Buchungswahrscheinlichkeit
  const priceRatio = recommendedPrice / basePrice;
  const bookingProbability = calcBookingProbability(priceRatio, marketOccupancy);

  // Strategie-Label
  let strategy: PricingOutput['strategy'] = 'standard';
  if (daysUntilCheckIn <= 7)  strategy = 'last-minute';
  if (daysUntilCheckIn > 90)  strategy = 'far-out';

  // Tags für UI
  const tags: string[] = [];
  if (daysUntilCheckIn <= 7)    tags.push('Kurzfristig');
  if (daysUntilCheckIn > 90)    tags.push('Frühbucher-Premium');
  if (marketOccupancy > 0.75)   tags.push('Hohe Nachfrage');
  if (hasLocalEvent)            tags.push('Event');
  if (isGapDay)                 tags.push('Lückenoptimierung');
  if (seasonality > 1.3)        tags.push('Hochsaison');

  return {
    recommendedPrice,
    minPrice,
    maxPrice,
    factors: { seasonality, dayOfWeek, leadTime, occupancy, event, gapDiscount },
    bookingProbability,
    strategy,
    tags,
  };
}

// ─── React Hook ───────────────────────────────────────────────────────────────

import { useMemo } from 'react';

export function useDynamicPricing(input: PricingInput): PricingOutput {
  return useMemo(() => calculateDynamicPrice(input), [
    input.basePrice,
    input.checkInDate,
    input.marketOccupancy,
    input.hasLocalEvent,
    input.eventSize,
    input.isGapDay,
    input.gapLength,
    input.minPrice,
    input.maxPrice,
  ]);
}