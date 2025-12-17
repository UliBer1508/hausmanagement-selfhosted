import { Booking, Guest } from '@/types';

/**
 * Helper-Funktionen für Gast-Daten mit Fallback-Logik.
 * Nutzt die guests-Relation falls verfügbar, sonst Legacy-Felder aus bookings.
 * Dies gewährleistet Abwärtskompatibilität während der Migration.
 */

interface BookingWithGuest {
  guests?: Guest | null;
  guest_name?: string;
  guest_email?: string | null;
  guest_phone?: string | null;
  nationality?: string | null;
  guest_street?: string | null;
  guest_city?: string | null;
  guest_postal_code?: string | null;
  guest_birth_date?: string | null;
  guest_travel_document?: string | null;
  guest_notes?: string | null;
}

/**
 * Gibt den Gastnamen zurück - zuerst aus guests-Relation, dann Legacy-Feld.
 */
export const getGuestName = (booking: BookingWithGuest | null | undefined): string => {
  if (!booking) return 'Unbekannt';
  return booking.guests?.name || booking.guest_name || 'Unbekannt';
};

/**
 * Gibt die Gast-Email zurück - zuerst aus guests-Relation, dann Legacy-Feld.
 */
export const getGuestEmail = (booking: BookingWithGuest | null | undefined): string | null => {
  if (!booking) return null;
  return booking.guests?.email || booking.guest_email || null;
};

/**
 * Gibt die Gast-Telefonnummer zurück - zuerst aus guests-Relation, dann Legacy-Feld.
 */
export const getGuestPhone = (booking: BookingWithGuest | null | undefined): string | null => {
  if (!booking) return null;
  return booking.guests?.phone || booking.guest_phone || null;
};

/**
 * Gibt die Gast-Nationalität zurück - zuerst aus guests-Relation, dann Legacy-Feld.
 */
export const getGuestNationality = (booking: BookingWithGuest | null | undefined): string | null => {
  if (!booking) return null;
  return booking.guests?.nationality || booking.nationality || null;
};

/**
 * Gibt die Gast-Straße zurück - zuerst aus guests-Relation, dann Legacy-Feld.
 */
export const getGuestStreet = (booking: BookingWithGuest | null | undefined): string | null => {
  if (!booking) return null;
  return booking.guests?.street || booking.guest_street || null;
};

/**
 * Gibt die Gast-Stadt zurück - zuerst aus guests-Relation, dann Legacy-Feld.
 */
export const getGuestCity = (booking: BookingWithGuest | null | undefined): string | null => {
  if (!booking) return null;
  return booking.guests?.city || booking.guest_city || null;
};

/**
 * Gibt die Gast-PLZ zurück - zuerst aus guests-Relation, dann Legacy-Feld.
 */
export const getGuestPostalCode = (booking: BookingWithGuest | null | undefined): string | null => {
  if (!booking) return null;
  return booking.guests?.postal_code || booking.guest_postal_code || null;
};

/**
 * Gibt das Gast-Geburtsdatum zurück - zuerst aus guests-Relation, dann Legacy-Feld.
 */
export const getGuestBirthDate = (booking: BookingWithGuest | null | undefined): string | null => {
  if (!booking) return null;
  return booking.guests?.birth_date || booking.guest_birth_date || null;
};

/**
 * Gibt das Reisedokument zurück - zuerst aus guests-Relation, dann Legacy-Feld.
 */
export const getGuestTravelDocument = (booking: BookingWithGuest | null | undefined): string | null => {
  if (!booking) return null;
  return booking.guests?.travel_document || booking.guest_travel_document || null;
};

/**
 * Gibt die Gast-Notizen zurück - zuerst aus guests-Relation, dann Legacy-Feld.
 */
export const getGuestNotes = (booking: BookingWithGuest | null | undefined): string | null => {
  if (!booking) return null;
  return booking.guests?.notes || booking.guest_notes || null;
};

/**
 * Prüft ob die Buchung eine guests-Relation hat (normalisierte Daten).
 */
export const hasGuestRelation = (booking: BookingWithGuest | null | undefined): boolean => {
  return !!booking?.guests?.id;
};

/**
 * Gibt das komplette Guest-Objekt zurück (falls vorhanden).
 */
export const getGuest = (booking: BookingWithGuest | null | undefined): Guest | null => {
  return booking?.guests || null;
};
