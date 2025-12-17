/**
 * Rating normalization helpers for cross-platform rating comparison
 * 
 * Different booking platforms use different rating scales:
 * - Booking.com: 0-10 scale
 * - Airbnb, VRBO, FeWo, Belvilla: 0-5 star scale
 * 
 * This module normalizes all ratings to a consistent 0-10 scale.
 */

/**
 * Get the maximum rating value for a given platform
 */
export function getMaxRatingForPlatform(platform: string | null): number {
  if (!platform) return 5;
  
  const p = platform.toLowerCase();
  
  // Booking.com uses 0-10 scale
  if (p.includes('booking')) return 10;
  
  // All others use 5-star scale
  return 5;
}

/**
 * Normalize a rating to a 0-10 scale based on the platform
 */
export function normalizeRating(rating: number | null, platform: string | null): number | null {
  if (rating === null || rating === undefined) return null;
  
  const p = (platform || '').toLowerCase();
  
  // Booking.com: 0-10 → no change
  if (p.includes('booking')) return rating;
  
  // Airbnb, VRBO, FeWo, Belvilla: 0-5 → ×2
  if (p.includes('airbnb') || p.includes('vrbo') || p.includes('fewo') || p.includes('belvilla')) {
    return rating * 2;
  }
  
  // Default: if ≤5 assume 5-star scale → ×2, otherwise assume 10-point scale
  return rating <= 5 ? rating * 2 : rating;
}

/**
 * Format a rating for display, showing both normalized and original values
 * @returns Object with display text and detailed breakdown
 */
export function formatRatingDisplay(
  normalizedRating: number | null, 
  originalRating: number | null, 
  platform: string | null
): { display: string; detail: string | null } {
  if (normalizedRating === null || originalRating === null) {
    return { display: '-', detail: null };
  }
  
  const maxRating = getMaxRatingForPlatform(platform);
  const isBookingCom = platform?.toLowerCase().includes('booking');
  
  // For Booking.com, show as X.X/10
  if (isBookingCom) {
    return { 
      display: `${normalizedRating.toFixed(1)}/10`,
      detail: null
    };
  }
  
  // For 5-star platforms, show both: 9.4/10 (4.7★ Airbnb)
  const platformName = getPlatformDisplayName(platform);
  return {
    display: `${normalizedRating.toFixed(1)}/10`,
    detail: `${originalRating.toFixed(1)}★ ${platformName}`
  };
}

/**
 * Get display-friendly platform name
 */
function getPlatformDisplayName(platform: string | null): string {
  if (!platform) return '';
  
  const p = platform.toLowerCase();
  if (p.includes('booking')) return 'Booking.com';
  if (p.includes('airbnb')) return 'Airbnb';
  if (p.includes('vrbo')) return 'VRBO';
  if (p.includes('fewo')) return 'FeWo';
  if (p.includes('belvilla')) return 'Belvilla';
  if (p.includes('direct')) return 'Direkt';
  return platform;
}

/**
 * Validate rating input based on platform scale
 */
export function validateRating(rating: number, platform: string | null): boolean {
  const maxRating = getMaxRatingForPlatform(platform);
  return rating >= 0 && rating <= maxRating;
}
