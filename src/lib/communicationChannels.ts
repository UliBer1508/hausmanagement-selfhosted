// Kanäle für guest_communications.channel (NEU 26.09.2026).
//
// Die Spalte ist freier Text (kein CHECK in der DB). Diese Liste ist die EINE
// Stelle für Auswahl (LogCommunicationDialog) und Anzeige
// (GuestCommunicationHistory). Ältere Einträge haben immer 'email'.
//
// Die Werte für Portale entsprechen bookings.platform ('airbnb',
// 'booking.com', 'belvilla', 'vrbo'), damit der Kanal aus der Buchung
// vorbelegt werden kann (channelForPlatform).

export const COMMUNICATION_CHANNELS = [
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking.com', label: 'Booking.com' },
  { value: 'belvilla', label: 'Belvilla' },
  { value: 'vrbo', label: 'VRBO' },
  { value: 'email', label: 'E-Mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telefon', label: 'Telefon' },
  { value: 'sonstiges', label: 'Sonstiges' },
] as const;

export const channelLabel = (value: string | null | undefined): string =>
  COMMUNICATION_CHANNELS.find((k) => k.value === value)?.label ?? value ?? '—';

/** Kanal aus bookings.platform ableiten; ohne Portal -> E-Mail. */
export const channelForPlatform = (platform: string | null | undefined): string =>
  COMMUNICATION_CHANNELS.some((k) => k.value === platform) ? (platform as string) : 'email';
