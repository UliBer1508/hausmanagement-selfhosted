/**
 * Zentrale Länderliste — eine Quelle der Wahrheit.
 *
 * Wird referenziert von:
 *   - src/components/Bookings/CreateBookingForm.tsx   (Buchungsanlage, Dropdown)
 *   - src/components/Bookings/BookingOverviewFixed.tsx (Code → Name in der Übersicht)
 *   - src/components/Settings/GuestImportCard.tsx      (Nationalität beim Import)
 *   - src/components/Guests/MLSettingsDialog.tsx       (ML-relevante Länder)
 *
 * Hinweis Code "UK": Für Großbritannien wird bewusst der Code 'UK'
 * (nicht ISO 'GB') verwendet, weil bestehende Buchungen in der Datenbank
 * diesen Wert nutzen. Das Flag zeigt korrekt die GB-Flagge.
 *
 * Sortierung: alphabetisch nach deutschem Namen (Umlaute eingeordnet).
 */

export interface Country {
  code: string;
  name: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: 'EG', name: 'Ägypten', flag: '🇪🇬' },
  { code: 'AL', name: 'Albanien', flag: '🇦🇱' },
  { code: 'AR', name: 'Argentinien', flag: '🇦🇷' },
  { code: 'AM', name: 'Armenien', flag: '🇦🇲' },
  { code: 'AZ', name: 'Aserbaidschan', flag: '🇦🇿' },
  { code: 'AU', name: 'Australien', flag: '🇦🇺' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
  { code: 'BY', name: 'Belarus', flag: '🇧🇾' },
  { code: 'BE', name: 'Belgien', flag: '🇧🇪' },
  { code: 'BA', name: 'Bosnien-Herzegowina', flag: '🇧🇦' },
  { code: 'BR', name: 'Brasilien', flag: '🇧🇷' },
  { code: 'BG', name: 'Bulgarien', flag: '🇧🇬' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'DK', name: 'Dänemark', flag: '🇩🇰' },
  { code: 'DE', name: 'Deutschland', flag: '🇩🇪' },
  { code: 'EE', name: 'Estland', flag: '🇪🇪' },
  { code: 'FI', name: 'Finnland', flag: '🇫🇮' },
  { code: 'FR', name: 'Frankreich', flag: '🇫🇷' },
  { code: 'GE', name: 'Georgien', flag: '🇬🇪' },
  { code: 'GR', name: 'Griechenland', flag: '🇬🇷' },
  { code: 'HK', name: 'Hongkong', flag: '🇭🇰' },
  { code: 'IN', name: 'Indien', flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesien', flag: '🇮🇩' },
  { code: 'IE', name: 'Irland', flag: '🇮🇪' },
  { code: 'IS', name: 'Island', flag: '🇮🇸' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱' },
  { code: 'IT', name: 'Italien', flag: '🇮🇹' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'JO', name: 'Jordanien', flag: '🇯🇴' },
  { code: 'CA', name: 'Kanada', flag: '🇨🇦' },
  { code: 'QA', name: 'Katar', flag: '🇶🇦' },
  { code: 'CO', name: 'Kolumbien', flag: '🇨🇴' },
  { code: 'XK', name: 'Kosovo', flag: '🇽🇰' },
  { code: 'HR', name: 'Kroatien', flag: '🇭🇷' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'LV', name: 'Lettland', flag: '🇱🇻' },
  { code: 'LB', name: 'Libanon', flag: '🇱🇧' },
  { code: 'LI', name: 'Liechtenstein', flag: '🇱🇮' },
  { code: 'LT', name: 'Litauen', flag: '🇱🇹' },
  { code: 'LU', name: 'Luxemburg', flag: '🇱🇺' },
  { code: 'MT', name: 'Malta', flag: '🇲🇹' },
  { code: 'MA', name: 'Marokko', flag: '🇲🇦' },
  { code: 'MX', name: 'Mexiko', flag: '🇲🇽' },
  { code: 'MD', name: 'Moldau', flag: '🇲🇩' },
  { code: 'MC', name: 'Monaco', flag: '🇲🇨' },
  { code: 'ME', name: 'Montenegro', flag: '🇲🇪' },
  { code: 'NZ', name: 'Neuseeland', flag: '🇳🇿' },
  { code: 'NL', name: 'Niederlande', flag: '🇳🇱' },
  { code: 'MK', name: 'Nordmazedonien', flag: '🇲🇰' },
  { code: 'NO', name: 'Norwegen', flag: '🇳🇴' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲' },
  { code: 'AT', name: 'Österreich', flag: '🇦🇹' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪' },
  { code: 'PH', name: 'Philippinen', flag: '🇵🇭' },
  { code: 'PL', name: 'Polen', flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'RO', name: 'Rumänien', flag: '🇷🇴' },
  { code: 'RU', name: 'Russland', flag: '🇷🇺' },
  { code: 'SA', name: 'Saudi-Arabien', flag: '🇸🇦' },
  { code: 'SE', name: 'Schweden', flag: '🇸🇪' },
  { code: 'CH', name: 'Schweiz', flag: '🇨🇭' },
  { code: 'RS', name: 'Serbien', flag: '🇷🇸' },
  { code: 'SG', name: 'Singapur', flag: '🇸🇬' },
  { code: 'SK', name: 'Slowakei', flag: '🇸🇰' },
  { code: 'SI', name: 'Slowenien', flag: '🇸🇮' },
  { code: 'ES', name: 'Spanien', flag: '🇪🇸' },
  { code: 'ZA', name: 'Südafrika', flag: '🇿🇦' },
  { code: 'KR', name: 'Südkorea', flag: '🇰🇷' },
  { code: 'TW', name: 'Taiwan', flag: '🇹🇼' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
  { code: 'CZ', name: 'Tschechien', flag: '🇨🇿' },
  { code: 'TN', name: 'Tunesien', flag: '🇹🇳' },
  { code: 'TR', name: 'Türkei', flag: '🇹🇷' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦' },
  { code: 'HU', name: 'Ungarn', flag: '🇭🇺' },
  { code: 'US', name: 'USA', flag: '🇺🇸' },
  { code: 'AE', name: 'Vereinigte Arabische Emirate', flag: '🇦🇪' },
  { code: 'UK', name: 'Vereinigtes Königreich', flag: '🇬🇧' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'CY', name: 'Zypern', flag: '🇨🇾' },
];

/** Schneller Lookup: Ländercode → Name (z. B. 'AT' → 'Österreich'). */
export const getCountryName = (code?: string | null): string => {
  if (!code) return '';
  const match = COUNTRIES.find((c) => c.code === code);
  return match ? match.name : code;
};

/** Schneller Lookup: Ländercode → Flag-Emoji. */
export const getCountryFlag = (code?: string | null): string => {
  if (!code) return '';
  const match = COUNTRIES.find((c) => c.code === code);
  return match ? match.flag : '';
};
