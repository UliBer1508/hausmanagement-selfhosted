/**
 * Normalisiert deutsche Namen für Duplikat-Erkennung.
 * Wandelt Umlaute in ihre Zwei-Buchstaben-Äquivalente um.
 */
export const normalizeGermanName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/ü/g, 'ue')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/é|è|ë/g, 'e')
    .replace(/á|à|â/g, 'a')
    .replace(/ó|ò|ô/g, 'o')
    .replace(/í|ì|î/g, 'i')
    .replace(/ú|ù|û/g, 'u');
};

/**
 * Generiert Suchvarianten für einen Namen.
 * Z.B. "Mueller" -> ["Mueller", "Müller"]
 * Z.B. "Schlüter" -> ["Schlüter", "Schlueter"]
 */
export const generateNameVariants = (name: string): string[] => {
  const variants = [name];
  
  // Umgekehrte Umwandlung: ue -> ü (case-insensitive)
  let withUmlauts = name;
  withUmlauts = withUmlauts.replace(/ue/gi, (match) => match[0] === 'U' ? 'Ü' : 'ü');
  withUmlauts = withUmlauts.replace(/ae/gi, (match) => match[0] === 'A' ? 'Ä' : 'ä');
  withUmlauts = withUmlauts.replace(/oe/gi, (match) => match[0] === 'O' ? 'Ö' : 'ö');
  withUmlauts = withUmlauts.replace(/ss/g, 'ß');
  
  if (withUmlauts !== name) {
    variants.push(withUmlauts);
  }
  
  // Umwandlung: ü -> ue
  let withoutUmlauts = name;
  withoutUmlauts = withoutUmlauts.replace(/Ü/g, 'Ue').replace(/ü/g, 'ue');
  withoutUmlauts = withoutUmlauts.replace(/Ä/g, 'Ae').replace(/ä/g, 'ae');
  withoutUmlauts = withoutUmlauts.replace(/Ö/g, 'Oe').replace(/ö/g, 'oe');
  withoutUmlauts = withoutUmlauts.replace(/ß/g, 'ss');
  
  if (withoutUmlauts !== name) {
    variants.push(withoutUmlauts);
  }
  
  return [...new Set(variants)];
};
