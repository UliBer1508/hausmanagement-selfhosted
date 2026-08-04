import { useState, useRef, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, XCircle, Loader2, Trash2, Search, Edit2, Check, X, Info, Save, Maximize2, Monitor } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useHouses } from '@/hooks/useHouses';
import * as XLSX from 'xlsx';
import { COUNTRIES } from '@/lib/countries';

interface ExcelRow {
  'Blatt-Nr.'?: string;
  'Nachname'?: string;
  'Vorname'?: string;
  'Geburtstag'?: string;
  'Straße'?: string;
  'Stadt/Ort'?: string;
  'PLZ'?: string;
  'Land'?: string;
  'Reisedokument Nr.'?: string;
  'Anreise'?: string;
  'Abreise'?: string;
  'Total'?: string;
  [key: string]: string | undefined;
}

interface ProcessedBooking {
  blattNr: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  numberOfGuests: number;
  numberOfAdults: number;
  numberOfChildren: number;
  nationality: string;
  guestStreet: string;
  guestCity: string;
  guestPostalCode: string;
  guestBirthDate: string;
  guestTravelDocument: string;
  isValid: boolean;
  validationErrors: string[];
  selected: boolean;
}


type AbgleichStatus = 'neu' | 'ergaenzung' | 'konflikt' | 'unklar' | 'fremd';

interface FeldDiff {
  feld: string;          // Spaltenname in bookings
  label: string;
  alt: string;           // Wert im System
  neu: string;           // Wert aus dem Meldeschein
}

interface Abgleich {
  status: AbgleichStatus;
  bookingId?: string;
  bookingLabel?: string; // z. B. "Wagner, 27.12.–03.01." zur Kontrolle
  exakt: boolean;        // Zeitraum stimmt genau überein
  fuellungen: FeldDiff[];// System leer, Meldeschein gefüllt -> unkritisch
  konflikte: FeldDiff[]; // beide gefüllt und verschieden -> Entscheidung nötig
}

interface BestandsBuchung {
  id: string;
  check_in: string;
  check_out: string;
  guest_name: string;
  guest_street: string | null;
  guest_city: string | null;
  guest_postal_code: string | null;
  guest_birth_date: string | null;
  guest_travel_document: string | null;
  nationality: string | null;
  number_of_guests: number;
  status: string | null;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  details: {
    guest: string;
    checkIn: string;
    checkOut: string;
    status: 'imported' | 'skipped' | 'error';
    reason?: string;
  }[];
}

// Helper functions
const parseGermanDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('.');
  if (parts.length !== 3) return dateStr;
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
  return `${year}-${month}-${day}`;
};

const formatDateForDisplay = (isoDate: string): string => {
  if (!isoDate || !isoDate.includes('-')) return isoDate;
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
};

const calculateAge = (birthdate: string, referenceDate: Date): number => {
  if (!birthdate) return 30;
  const parts = birthdate.split('.');
  if (parts.length !== 3) return 30;
  const birthYear = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2], 10);
  const birth = new Date(birthYear, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  const age = referenceDate.getFullYear() - birth.getFullYear();
  const monthDiff = referenceDate.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birth.getDate())) {
    return age - 1;
  }
  return age;
};

const mapCountryToNationality = (country: string): string => {
  if (!country) return '';
  const map: Record<string, string> = {
    'Deutschland': 'DE', 'DE': 'DE',
    'Niederlande': 'NL', 'NL': 'NL',
    'Österreich': 'AT', 'AT': 'AT',
    'Schweiz': 'CH', 'CH': 'CH',
    'Belgien': 'BE', 'BE': 'BE',
    'Frankreich': 'FR', 'FR': 'FR',
    'Italien': 'IT', 'IT': 'IT',
    'Großbritannien': 'GB', 'UK': 'GB', 'GB': 'GB',
    'Spanien': 'ES', 'ES': 'ES',
    'USA': 'US', 'US': 'US',
    'Polen': 'PL', 'PL': 'PL',
    'Tschechien': 'CZ', 'CZ': 'CZ',
    'Dänemark': 'DK', 'DK': 'DK',
  };
  return map[country.trim()] || country.substring(0, 2).toUpperCase();
};


// bookings.check_in/check_out sind Zeitstempel (2026-01-03 14:00:00+00),
// die Excel liefert reine Datumsangaben. Fuer den Vergleich auf den Tag kuerzen.
const tag = (v: unknown): string => String(v ?? '').slice(0, 10);

const norm = (v: unknown): string =>
  String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Namen gelten als ähnlich, wenn alle Wortteile des kürzeren im längeren
// vorkommen. Fängt "Christiaan Horst" vs. "Christiaan van der Horst".
const nameAehnlich = (a: string, b: string): boolean => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const kurz = x.length <= y.length ? x : y;
  const lang = x.length <= y.length ? y : x;
  const teile = kurz.split(' ').filter(t => t.length > 2);
  return teile.length > 0 && teile.every(t => lang.includes(t));
};

const VERGLEICHSFELDER: { feld: keyof BestandsBuchung; quelle: keyof ProcessedBooking; label: string }[] = [
  { feld: 'guest_name',            quelle: 'guestName',           label: 'Name' },
  { feld: 'guest_street',          quelle: 'guestStreet',         label: 'Straße' },
  { feld: 'guest_city',            quelle: 'guestCity',           label: 'Stadt' },
  { feld: 'guest_postal_code',     quelle: 'guestPostalCode',     label: 'PLZ' },
  { feld: 'guest_birth_date',      quelle: 'guestBirthDate',      label: 'Geburtsdatum' },
  { feld: 'guest_travel_document', quelle: 'guestTravelDocument', label: 'Reisedokument' },
  { feld: 'nationality',           quelle: 'nationality',         label: 'Nationalität' },
];

const vergleiche = (b: ProcessedBooking, best: BestandsBuchung[]): Abgleich => {
  // Zuordnung laeuft ueber den NAMEN; der Zeitraum bestaetigt sie.
  // 1. Buchungen desselben Gastes suchen
  const namensTreffer = best.filter(x => nameAehnlich(x.guest_name, b.guestName));

  // 2. davon die mit passendem Zeitraum
  let treffer = namensTreffer.find(
    x => tag(x.check_in) === tag(b.checkIn) && tag(x.check_out) === tag(b.checkOut)
  );
  let exakt = !!treffer;
  let zeitraumAbweichend = false;
  let fremderName = false;

  // 3. gleicher Gast, aber anderer Zeitraum -> anderer Aufenthalt oder Datum falsch
  if (!treffer && namensTreffer.length > 0) {
    treffer = namensTreffer.find(
      x => tag(x.check_in) < tag(b.checkOut) && tag(x.check_out) > tag(b.checkIn)
    );
    zeitraumAbweichend = !!treffer;
  }

  // 4. kein Namenstreffer, aber im Zeitraum liegt eine Buchung auf anderen Namen
  if (!treffer) {
    const imZeitraum = best.filter(
      x => tag(x.check_in) === tag(b.checkIn) && tag(x.check_out) === tag(b.checkOut)
    );
    if (imZeitraum.length > 0) {
      treffer = imZeitraum[0];
      fremderName = true;
    }
  }

  if (!treffer) return { status: 'neu', exakt: false, fuellungen: [], konflikte: [] };

  const fuellungen: FeldDiff[] = [];
  const konflikte: FeldDiff[] = [];

  for (const f of VERGLEICHSFELDER) {
    const alt = String(treffer[f.feld] ?? '').trim();
    const neu = String(b[f.quelle] ?? '').trim();
    if (!neu) continue;                        // Meldeschein hat nichts -> nichts zu tun
    if (!alt) { fuellungen.push({ feld: f.feld, label: f.label, alt: '', neu }); continue; }

    const istDatum = f.feld === 'guest_birth_date';
    const a2 = istDatum ? tag(alt) : alt;
    const n2 = istDatum ? tag(neu) : neu;
    if (norm(a2) === norm(n2)) continue;

    // Name: eine blosse Ergaenzung (2. Vorname, Namenszusatz) ist kein Konflikt,
    // weil die Zuordnung ohnehin ueber die Namensaehnlichkeit lief.
    if (f.feld === 'guest_name' && !fremderName && nameAehnlich(a2, n2)) {
      fuellungen.push({ feld: f.feld, label: 'Name (vollstaendiger)', alt: a2, neu: n2 });
      continue;
    }
    konflikte.push({ feld: f.feld, label: f.label, alt: a2, neu: n2 });
  }

  if (treffer.number_of_guests !== b.numberOfGuests) {
    konflikte.push({
      feld: 'number_of_guests', label: 'Personen',
      alt: String(treffer.number_of_guests), neu: String(b.numberOfGuests),
    });
  }

  const label = `${treffer.guest_name} \u00b7 ${formatDateForDisplay(tag(treffer.check_in))}\u2013${formatDateForDisplay(tag(treffer.check_out))}`;

  let status: AbgleichStatus;
  if (fremderName) status = 'fremd';
  else if (zeitraumAbweichend) status = 'unklar';
  else if (konflikte.length > 0) status = 'konflikt';
  else status = 'ergaenzung';

  return { status, bookingId: treffer.id, bookingLabel: label, exakt, fuellungen, konflikte };
};

const GuestImportCard = () => {
  const { toast } = useToast();
  const { data: houses } = useHouses({ rental_type: 'tourist' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedHouseId, setSelectedHouseId] = useState<string>('');
  const [processedBookings, setProcessedBookings] = useState<ProcessedBooking[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [bestand, setBestand] = useState<BestandsBuchung[]>([]);
  const [bestandLaedt, setBestandLaedt] = useState(false);
  const [ohneMeldeschein, setOhneMeldeschein] = useState<BestandsBuchung[]>([]);
  const isMobile = useIsMobile();
  const [editingBlattNr, setEditingBlattNr] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ProcessedBooking>>({});

  // Robuste Feld-Erkennung
  const getField = (row: ExcelRow, ...keys: string[]): string | undefined => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== '') return row[key];
    }
    return undefined;
  };

  const processExcelToBookings = (rows: ExcelRow[]): ProcessedBooking[] => {
    // Gruppiere nach Blatt-Nr.
    const bookingGroups = new Map<string, ExcelRow[]>();
    
    for (const row of rows) {
      const blattNr = getField(row, 'Blatt-Nr.', 'Blatt-Nr', 'BlattNr');
      // Nur echte Blatt-Nummern (rein numerisch). Filtert Fuß-/Summenzeilen
      // des Exports heraus, z. B. "Gewählter Zeitraum:" in der letzten Zeile.
      if (!blattNr || !/^\d+$/.test(String(blattNr).trim())) continue;
      
      if (!bookingGroups.has(blattNr)) {
        bookingGroups.set(blattNr, []);
      }
      bookingGroups.get(blattNr)!.push(row);
    }

    const bookings: ProcessedBooking[] = [];

    for (const [blattNr, members] of bookingGroups) {
      const mainBooker = members[0];
      
      const vorname = getField(mainBooker, 'Vorname', 'vorname') || '';
      const nachname = getField(mainBooker, 'Nachname', 'nachname') || '';
      const guestName = `${vorname} ${nachname}`.trim();
      
      const anreise = getField(mainBooker, 'Anreise', 'anreise') || '';
      const abreise = getField(mainBooker, 'Abreise', 'abreise') || '';
      const checkIn = parseGermanDate(anreise);
      const checkOut = parseGermanDate(abreise);
      
      const land = getField(mainBooker, 'Land', 'land') || '';
      const nationality = mapCountryToNationality(land);

      // Neue Felder aus Excel extrahieren
      const strasse = getField(mainBooker, 'Straße', 'Strasse', 'Adresse') || '';
      const stadtOrt = getField(mainBooker, 'Stadt/Ort', 'Stadt', 'Ort') || '';
      const plz = getField(mainBooker, 'PLZ', 'Postleitzahl', 'Plz') || '';
      const geburtstag = getField(mainBooker, 'Geburtstag', 'geburtstag') || '';
      const reisedokument = getField(mainBooker, 'Reisedokument Nr.', 'Reisedokument', 'Passnummer') || '';

      // Geburtsdatum parsen (TT.MM.JJJJ → YYYY-MM-DD)
      const guestBirthDate = parseGermanDate(geburtstag);

      // Berechne Erwachsene/Kinder aus Geburtsdaten
      const referenceDate = checkIn ? new Date(checkIn) : new Date();
      let adults = 0;
      let children = 0;
      
      for (const member of members) {
        const birthday = getField(member, 'Geburtstag', 'geburtstag') || '';
        const age = calculateAge(birthday, referenceDate);
        if (age < 18) {
          children++;
        } else {
          adults++;
        }
      }

      // Validierung
      const validationErrors: string[] = [];
      if (!guestName) validationErrors.push('Kein Gastname');
      if (!checkIn) validationErrors.push('Kein Anreisedatum');
      if (!checkOut) validationErrors.push('Kein Abreisedatum');
      if (members.length === 0) validationErrors.push('Keine Gäste');

      bookings.push({
        blattNr,
        guestName,
        checkIn,
        checkOut,
        numberOfGuests: members.length,
        numberOfAdults: adults,
        numberOfChildren: children,
        nationality,
        guestStreet: strasse,
        guestCity: stadtOrt,
        guestPostalCode: plz,
        guestBirthDate,
        guestTravelDocument: reisedokument,
        isValid: validationErrors.length === 0,
        validationErrors,
        selected: true
      });
    }

    // Sortiere nach Anreisedatum
    return bookings.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('=== handleFileSelect START ===');
    
    const file = event.target.files?.[0];
    if (!file) {
      console.log('Keine Datei ausgewählt');
      return;
    }
    
    console.log('Datei erkannt:', file.name, file.size, 'bytes');
    toast({
      title: 'Datei erkannt',
      description: `${file.name} wird verarbeitet...`,
    });

    setIsParsing(true);
    setProcessedBookings([]);
    setImportResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Lese alle Zeilen als Array-of-Arrays um Header-Zeile zu finden
      const allRows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { 
        header: 1,
        defval: ''
      });

      console.log('Alle Zeilen (erste 5):', allRows.slice(0, 5));

      // Finde die Header-Zeile (enthält "Blatt-Nr." oder "Nachname")
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(allRows.length, 10); i++) {
        const row = allRows[i];
        if (row && Array.isArray(row)) {
          const rowStr = row.join(' ').toLowerCase();
          if (rowStr.includes('blatt-nr') || rowStr.includes('nachname')) {
            headerRowIndex = i;
            console.log('Header gefunden in Zeile:', i, row);
            break;
          }
        }
      }

      if (headerRowIndex === -1) {
        throw new Error('Header-Zeile nicht gefunden (suche nach "Blatt-Nr." oder "Nachname")');
      }

      // Jetzt mit korrektem Range parsen
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(firstSheet, { 
        range: headerRowIndex,
        defval: ''
      });

      console.log('Excel Spalten:', Object.keys(rows[0] || {}));
      console.log('Erste Datenzeile:', rows[0]);

      const bookings = processExcelToBookings(rows);
      setProcessedBookings(bookings);

      toast({
        title: 'Datei geladen',
        description: `${bookings.length} Buchungen gefunden`,
      });

    } catch (error) {
      console.error('Parse error:', error);
      toast({
        title: 'Fehler beim Lesen',
        description: error instanceof Error ? error.message : 'Die Datei konnte nicht gelesen werden',
        variant: 'destructive',
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    const selectedBookings = processedBookings.filter(b => b.selected && b.isValid);
    
    if (selectedBookings.length === 0 || !selectedHouseId) {
      toast({
        title: 'Fehler',
        description: 'Bitte wählen Sie ein Haus und mindestens eine gültige Buchung',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setImportResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('import-guest-list', {
        body: {
          processedBookings: selectedBookings,
          houseId: selectedHouseId
        }
      });

      if (error) throw error;

      setImportResult(data as ImportResult);
      
      toast({
        title: 'Import abgeschlossen',
        description: `${data.imported} Buchungen importiert, ${data.skipped} übersprungen`,
      });

    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Import-Fehler',
        description: error instanceof Error ? error.message : 'Unbekannter Fehler',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetImport = () => {
    setProcessedBookings([]);
    setImportResult(null);
    setSearchQuery('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleBookingSelection = (blattNr: string) => {
    setProcessedBookings(prev => prev.map(b => 
      b.blattNr === blattNr ? { ...b, selected: !b.selected } : b
    ));
  };

  const toggleAllSelection = (selected: boolean) => {
    setProcessedBookings(prev => prev.map(b => ({ ...b, selected })));
  };

  const deleteBooking = (blattNr: string) => {
    setProcessedBookings(prev => prev.filter(b => b.blattNr !== blattNr));
  };

  const startEditing = (booking: ProcessedBooking) => {
    setEditingBlattNr(booking.blattNr);
    setEditValues({
      guestName: booking.guestName,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      numberOfAdults: booking.numberOfAdults,
      numberOfChildren: booking.numberOfChildren,
      nationality: booking.nationality,
      guestStreet: booking.guestStreet,
      guestCity: booking.guestCity,
      guestPostalCode: booking.guestPostalCode,
      guestBirthDate: booking.guestBirthDate,
      guestTravelDocument: booking.guestTravelDocument,
    });
  };

  const cancelEditing = () => {
    setEditingBlattNr(null);
    setEditValues({});
  };

  const saveEditing = () => {
    if (!editingBlattNr) return;
    
    setProcessedBookings(prev => prev.map(b => {
      if (b.blattNr !== editingBlattNr) return b;
      
      const updatedBooking = {
        ...b,
        guestName: editValues.guestName || b.guestName,
        checkIn: editValues.checkIn || b.checkIn,
        checkOut: editValues.checkOut || b.checkOut,
        numberOfAdults: editValues.numberOfAdults ?? b.numberOfAdults,
        numberOfChildren: editValues.numberOfChildren ?? b.numberOfChildren,
        numberOfGuests: (editValues.numberOfAdults ?? b.numberOfAdults) + (editValues.numberOfChildren ?? b.numberOfChildren),
        nationality: editValues.nationality || b.nationality,
        guestStreet: editValues.guestStreet ?? b.guestStreet,
        guestCity: editValues.guestCity ?? b.guestCity,
        guestPostalCode: editValues.guestPostalCode ?? b.guestPostalCode,
        guestBirthDate: editValues.guestBirthDate ?? b.guestBirthDate,
        guestTravelDocument: editValues.guestTravelDocument ?? b.guestTravelDocument,
      };
      
      // Neu validieren
      const validationErrors: string[] = [];
      if (!updatedBooking.guestName) validationErrors.push('Kein Gastname');
      if (!updatedBooking.checkIn) validationErrors.push('Kein Anreisedatum');
      if (!updatedBooking.checkOut) validationErrors.push('Kein Abreisedatum');
      if (updatedBooking.numberOfGuests === 0) validationErrors.push('Keine Gäste');
      
      return {
        ...updatedBooking,
        isValid: validationErrors.length === 0,
        validationErrors,
      };
    }));
    
    setEditingBlattNr(null);
    setEditValues({});
  };


  // Bestehende Buchungen des Hauses laden, sobald Haus und Datei da sind.
  // Nur lesend - es wird nichts geschrieben.
  useEffect(() => {
    if (!selectedHouseId || processedBookings.length === 0) {
      setBestand([]); setOhneMeldeschein([]); return;
    }
    let abgebrochen = false;
    (async () => {
      setBestandLaedt(true);
      try {
        const von = processedBookings.map(b => b.checkIn).filter(Boolean).sort()[0];
        const bis = processedBookings.map(b => b.checkOut).filter(Boolean).sort().slice(-1)[0];
        const { data, error } = await supabase
          .from('bookings')
          .select('id, check_in, check_out, guest_name, guest_street, guest_city, guest_postal_code, guest_birth_date, guest_travel_document, nationality, number_of_guests, status')
          .eq('house_id', selectedHouseId)
          .neq('status', 'cancelled')   // stornierte Buchungen nicht abgleichen
          .lte('check_in', bis)
          .gte('check_out', von);
        if (error) throw error;
        if (abgebrochen) return;
        const liste = (data ?? []) as BestandsBuchung[];
        setBestand(liste);

        // Buchungen im Zeitraum, zu denen kein Meldeschein vorliegt
        const getroffen = new Set<string>();
        for (const p of processedBookings) {
          const a = vergleiche(p, liste);
          if (a.bookingId) getroffen.add(a.bookingId);
        }
        setOhneMeldeschein(liste.filter(x => !getroffen.has(x.id) && x.status !== 'cancelled'));
      } catch (e) {
        console.error('Abgleich fehlgeschlagen:', e);
        toast({
          title: 'Abgleich fehlgeschlagen',
          description: e instanceof Error ? e.message : 'Bestehende Buchungen konnten nicht geladen werden',
          variant: 'destructive',
        });
      } finally {
        if (!abgebrochen) setBestandLaedt(false);
      }
    })();
    return () => { abgebrochen = true; };
  }, [selectedHouseId, processedBookings, toast]);

  const abgleiche = useMemo(() => {
    const m = new Map<string, Abgleich>();
    for (const b of processedBookings) m.set(b.blattNr, vergleiche(b, bestand));
    return m;
  }, [processedBookings, bestand]);

  const anzahlNeu = [...abgleiche.values()].filter(a => a.status === 'neu').length;
  const anzahlErgaenzung = [...abgleiche.values()].filter(a => a.status === 'ergaenzung').length;
  const anzahlKonflikt = [...abgleiche.values()].filter(a => a.status === 'konflikt').length;
  const anzahlUnklar = [...abgleiche.values()].filter(a => a.status === 'unklar').length;
  const anzahlFremd = [...abgleiche.values()].filter(a => a.status === 'fremd').length;

  // Gefilterte Buchungen
  const filteredBookings = useMemo(() => {
    if (!searchQuery) return processedBookings;
    const query = searchQuery.toLowerCase();
    return processedBookings.filter(b => 
      b.guestName.toLowerCase().includes(query) ||
      b.blattNr.toLowerCase().includes(query)
    );
  }, [processedBookings, searchQuery]);

  const selectedHouseName = houses?.find(h => h.id === selectedHouseId)?.name ?? '';
  const selectedCount = processedBookings.filter(b => b.selected).length;
  const validCount = processedBookings.filter(b => b.isValid).length;
  const invalidCount = processedBookings.filter(b => !b.isValid).length;

  const kompaktSection = (
    <div className="space-y-3">
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{processedBookings.length}</span>
          <span className="text-sm text-muted-foreground">Meldescheine geladen</span>
        </div>

        {bestandLaedt && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Abgleich mit vorhandenen Buchungen läuft…
          </div>
        )}

        {!bestandLaedt && bestand.length > 0 && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center justify-between rounded border px-2 py-1.5">
              <span className="text-muted-foreground">neu</span>
              <span className="font-medium">{anzahlNeu}</span>
            </div>
            <div className="flex items-center justify-between rounded border border-green-600/40 px-2 py-1.5">
              <span className="text-green-700 dark:text-green-500">Ergänzung</span>
              <span className="font-medium">{anzahlErgaenzung}</span>
            </div>
            <div className="flex items-center justify-between rounded border border-amber-600/40 px-2 py-1.5">
              <span className="text-amber-700 dark:text-amber-500">Konflikt</span>
              <span className="font-medium">{anzahlKonflikt}</span>
            </div>
            <div className="flex items-center justify-between rounded border border-amber-600/40 px-2 py-1.5">
              <span className="text-amber-700 dark:text-amber-500">zu prüfen</span>
              <span className="font-medium">{anzahlUnklar + anzahlFremd}</span>
            </div>
          </div>
        )}

        {invalidCount > 0 && (
          <div className="text-sm text-destructive">{invalidCount} Zeile(n) unvollständig</div>
        )}

        {ohneMeldeschein.length > 0 && (
          <div className="text-sm text-muted-foreground">
            {ohneMeldeschein.length} Buchung(en) im Zeitraum ohne Meldeschein
          </div>
        )}
      </div>

      <Button className="w-full" onClick={() => setShowFullscreen(true)}>
        <Maximize2 className="w-4 h-4 mr-2" />
        Vorschau öffnen und prüfen
      </Button>
      <Button variant="outline" className="w-full" onClick={resetImport}>
        Abbrechen
      </Button>
    </div>
  );

  const previewSection = (
          <div className="space-y-3">
            {/* Header with stats and search */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-sm">
                <Badge variant="outline">{processedBookings.length} gesamt</Badge>
                <Badge variant="default" className="bg-green-600">{validCount} gültig</Badge>
                {invalidCount > 0 && (
                  <Badge variant="destructive">{invalidCount} ungültig</Badge>
                )}
                {bestandLaedt && (
                  <span className="text-xs text-muted-foreground">Abgleich läuft…</span>
                )}
                {!bestandLaedt && bestand.length > 0 && (
                  <>
                    <Badge variant="outline">{anzahlNeu} neu</Badge>
                    <Badge variant="outline" className="text-green-700 border-green-600">{anzahlErgaenzung} Ergänzung</Badge>
                    {anzahlKonflikt > 0 && (
                      <Badge variant="outline" className="text-amber-700 border-amber-600">{anzahlKonflikt} Konflikt</Badge>
                    )}
                    {anzahlUnklar > 0 && (
                      <Badge variant="outline" className="text-amber-700 border-amber-600">{anzahlUnklar} Zeitraum</Badge>
                    )}
                    {anzahlFremd > 0 && (
                      <Badge variant="outline" className="text-amber-700 border-amber-600">{anzahlFremd} anderer Name</Badge>
                    )}
                  </>
                )}
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Suchen..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Table */}
            <ScrollArea className={showFullscreen ? "h-[calc(90vh-300px)] border rounded-lg" : "h-[400px] border rounded-lg"}>
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedCount === processedBookings.length}
                        onCheckedChange={(checked) => toggleAllSelection(!!checked)}
                      />
                    </TableHead>
                    <TableHead className="w-20">Blatt-Nr.</TableHead>
                    <TableHead>Gast</TableHead>
                    <TableHead className="w-28">Anreise</TableHead>
                    <TableHead className="w-28">Abreise</TableHead>
                    <TableHead className="w-14 text-center">Erw.</TableHead>
                    <TableHead className="w-14 text-center">Ki.</TableHead>
                    <TableHead className="w-20">Land</TableHead>
                    <TableHead>Straße</TableHead>
                    <TableHead>Stadt</TableHead>
                    <TableHead className="w-20">PLZ</TableHead>
                    <TableHead className="w-28">Geb.Datum</TableHead>
                    <TableHead className="w-16">Status</TableHead>
                    <TableHead className="w-32">Abgleich</TableHead>
                    <TableHead className="w-20 text-right">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map(booking => (
                    <TableRow key={booking.blattNr} className={!booking.isValid ? 'bg-destructive/10' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={booking.selected}
                          onCheckedChange={() => toggleBookingSelection(booking.blattNr)}
                          disabled={!booking.isValid}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{booking.blattNr}</TableCell>
                      
                      {/* Editing mode */}
                      {editingBlattNr === booking.blattNr ? (
                        <>
                          <TableCell>
                            <Input
                              value={editValues.guestName || ''}
                              onChange={e => setEditValues(v => ({ ...v, guestName: e.target.value }))}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={editValues.checkIn || ''}
                              onChange={e => setEditValues(v => ({ ...v, checkIn: e.target.value }))}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={editValues.checkOut || ''}
                              onChange={e => setEditValues(v => ({ ...v, checkOut: e.target.value }))}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={editValues.numberOfAdults ?? 0}
                              onChange={e => setEditValues(v => ({ ...v, numberOfAdults: parseInt(e.target.value) || 0 }))}
                              className="h-8 w-12 text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              value={editValues.numberOfChildren ?? 0}
                              onChange={e => setEditValues(v => ({ ...v, numberOfChildren: parseInt(e.target.value) || 0 }))}
                              className="h-8 w-12 text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={editValues.nationality || ''}
                              onValueChange={v => setEditValues(val => ({ ...val, nationality: v }))}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {COUNTRIES.map(opt => (
                                  <SelectItem key={opt.code} value={opt.code}>{opt.code}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editValues.guestStreet || ''}
                              onChange={e => setEditValues(v => ({ ...v, guestStreet: e.target.value }))}
                              className="h-8"
                              placeholder="Straße"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editValues.guestCity || ''}
                              onChange={e => setEditValues(v => ({ ...v, guestCity: e.target.value }))}
                              className="h-8"
                              placeholder="Stadt"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editValues.guestPostalCode || ''}
                              onChange={e => setEditValues(v => ({ ...v, guestPostalCode: e.target.value }))}
                              className="h-8"
                              placeholder="PLZ"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={editValues.guestBirthDate || ''}
                              onChange={e => setEditValues(v => ({ ...v, guestBirthDate: e.target.value }))}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>-</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEditing}>
                                <Check className="w-4 h-4 text-green-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEditing}>
                                <X className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium">{booking.guestName || '-'}</TableCell>
                          <TableCell>{formatDateForDisplay(booking.checkIn)}</TableCell>
                          <TableCell>{formatDateForDisplay(booking.checkOut)}</TableCell>
                          <TableCell className="text-center">{booking.numberOfAdults}</TableCell>
                          <TableCell className="text-center">{booking.numberOfChildren}</TableCell>
                          <TableCell>{booking.nationality || '-'}</TableCell>
                          <TableCell className="text-xs">{booking.guestStreet || '-'}</TableCell>
                          <TableCell className="text-xs">{booking.guestCity || '-'}</TableCell>
                          <TableCell className="text-xs">{booking.guestPostalCode || '-'}</TableCell>
                          <TableCell>{booking.guestBirthDate ? formatDateForDisplay(booking.guestBirthDate) : '-'}</TableCell>
                          <TableCell>
                            {booking.isValid ? (
                              <Badge variant="outline" className="text-green-600 border-green-600">✓</Badge>
                            ) : (
                              <Badge variant="destructive" title={booking.validationErrors.join(', ')}>
                                ⚠️
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const a = abgleiche.get(booking.blattNr);
                              if (!a || bestand.length === 0) return <span className="text-muted-foreground">–</span>;
                              const titel = [
                                a.bookingLabel ? `Buchung: ${a.bookingLabel}` : '',
                                a.fuellungen.length ? `Wird ergänzt: ${a.fuellungen.map(f => f.label).join(', ')}` : '',
                                a.konflikte.length ? `Abweichend: ${a.konflikte.map(f => `${f.label} (${f.alt} → ${f.neu})`).join(', ')}` : '',
                              ].filter(Boolean).join(' | ');
                              if (a.status === 'neu')
                                return <Badge variant="outline" title="Keine Buchung im Zeitraum gefunden">neu</Badge>;
                              if (a.status === 'ergaenzung')
                                return <Badge variant="outline" className="text-green-700 border-green-600" title={titel}>
                                  ergänzt {a.fuellungen.length > 0 ? `(${a.fuellungen.length})` : ''}
                                </Badge>;
                              if (a.status === 'konflikt')
                                return <Badge variant="outline" className="text-amber-700 border-amber-600" title={titel}>
                                  {a.konflikte.length} Konflikt{a.konflikte.length === 1 ? '' : 'e'}
                                </Badge>;
                              if (a.status === 'unklar')
                                return <Badge variant="outline" className="text-amber-700 border-amber-600" title={titel}>Zeitraum weicht ab</Badge>;
                              return <Badge variant="outline" className="text-amber-700 border-amber-600" title={titel}>anderer Name</Badge>;
                            })()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEditing(booking)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteBooking(booking.blattNr)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {ohneMeldeschein.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{ohneMeldeschein.length} Buchung(en) im Zeitraum ohne Meldeschein:</strong>{' '}
                  {ohneMeldeschein.slice(0, 5).map(x => `${x.guest_name} (${formatDateForDisplay(tag(x.check_in))})`).join(', ')}
                  {ohneMeldeschein.length > 5 ? ` … und ${ohneMeldeschein.length - 5} weitere` : ''}
                </AlertDescription>
              </Alert>
            )}

            {/* Hinweis: Vorschau-Modus */}
            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                <strong>Vorschau-Modus:</strong> Prüfe und korrigiere die Daten. 
                Erst nach Klick auf "Speichern" werden sie in die Datenbank übernommen.
              </AlertDescription>
            </Alert>

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-sm text-muted-foreground">
                {selectedCount} von {processedBookings.length} ausgewählt
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetImport}>
                  Abbrechen
                </Button>
                <Button onClick={handleImport} disabled={isLoading || !selectedHouseId || selectedCount === 0}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Speichere...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {selectedCount} Buchungen speichern
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          Gästeliste importieren
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Sicherer Import:</strong> Bestehende Buchungen werden nicht geändert oder gelöscht. 
            Duplikate (gleicher Zeitraum) werden automatisch übersprungen.
          </AlertDescription>
        </Alert>

        {/* House Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Haus auswählen</label>
          <Select value={selectedHouseId} onValueChange={setSelectedHouseId}>
            <SelectTrigger>
              <SelectValue placeholder="Haus für Import wählen..." />
            </SelectTrigger>
            <SelectContent>
              {houses?.map(house => (
                <SelectItem key={house.id} value={house.id}>
                  {house.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* File Input - IMMER gerendert, außerhalb des bedingten Blocks */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          className="sr-only"
          id="excel-upload"
        />

        {/* File Upload UI */}
        {processedBookings.length === 0 && !importResult && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Excel-Datei hochladen</label>
            {isMobile && (
              <Alert>
                <Monitor className="h-4 w-4" />
                <AlertDescription>
                  Der Import läuft am Computer. Die Vorschau braucht eine breite Tabelle,
                  die auf dem Handy nicht bedienbar ist.
                </AlertDescription>
              </Alert>
            )}
            <div className={isMobile ? "hidden" : "border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center"}>
              {isParsing ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-10 h-10 text-primary animate-spin mb-2" />
                  <span className="text-sm text-muted-foreground">Datei wird analysiert...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <FileSpreadsheet className="w-10 h-10 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Excel-Datei (.xlsx) auswählen
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      console.log('Button geklickt, triggere Datei-Input');
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Datei auswählen
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {processedBookings.length > 0 && !importResult && !showFullscreen && kompaktSection}


        <Dialog open={showFullscreen} onOpenChange={setShowFullscreen}>
          <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 gap-0 flex flex-col">
            <DialogHeader className="px-4 py-3 md:px-6 md:py-4 border-b shrink-0">
              <DialogTitle className="text-lg md:text-xl">
                Import-Vorschau{selectedHouseName ? ` · ${selectedHouseName}` : ''}
              </DialogTitle>
              <DialogDescription>
                Alle Spalten sichtbar. Änderungen wirken sofort auch in der Karte.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto px-4 py-3 md:px-6 md:py-4">
              {processedBookings.length > 0 && previewSection}
            </div>
          </DialogContent>
        </Dialog>

        {/* Import Result */}
        {importResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium">{importResult.imported} importiert</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <span className="font-medium">{importResult.skipped} übersprungen</span>
              </div>
              {importResult.errors.length > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="font-medium">{importResult.errors.length} Fehler</span>
                </div>
              )}
            </div>

            <ScrollArea className="h-64 border rounded-lg">
              <div className="p-3 space-y-2">
                {importResult.details.map((detail, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-background rounded border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{detail.guest}</div>
                      <div className="text-xs text-muted-foreground">
                        {detail.checkIn} - {detail.checkOut}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {detail.status === 'imported' && (
                        <Badge variant="default" className="bg-green-600">Importiert</Badge>
                      )}
                      {detail.status === 'skipped' && (
                        <Badge variant="secondary">{detail.reason || 'Übersprungen'}</Badge>
                      )}
                      {detail.status === 'error' && (
                        <Badge variant="destructive">{detail.reason || 'Fehler'}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Button variant="outline" onClick={resetImport} className="w-full">
              Neuen Import starten
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GuestImportCard;
