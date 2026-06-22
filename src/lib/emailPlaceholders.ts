export interface PlaceholderData {
  guestName?: string;
  checkIn?: string;
  checkOut?: string;
  houseName?: string;
}

export function replacePlaceholders(text: string, data: PlaceholderData): string {
  return text
    .replace(/\{guestName\}/gi, data.guestName ?? 'Gast')
    .replace(/\{guest_name\}/gi, data.guestName ?? 'Gast')
    .replace(/\{checkIn\}/gi, data.checkIn ?? '')
    .replace(/\{check_in\}/gi, data.checkIn ?? '')
    .replace(/\{checkOut\}/gi, data.checkOut ?? '')
    .replace(/\{check_out\}/gi, data.checkOut ?? '')
    .replace(/\{houseName\}/gi, data.houseName ?? '')
    .replace(/\{house_name\}/gi, data.houseName ?? '');
}