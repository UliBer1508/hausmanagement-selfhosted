import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExcelRow {
  'Blatt-Nr.': string;
  'Nachname': string;
  'Vorname': string;
  'Geburtstag': string;
  'Straße': string;
  'Stadt/Ort': string;
  'Land': string;
  'Reisedokument Nr.': string;
  'Anreise': string;
  'Abreise': string;
  'Total': string;
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

// Helper to calculate age from birthdate
function calculateAge(birthdate: string, referenceDate: Date): number {
  if (!birthdate) return 30; // Default adult age
  
  // Parse German date format (DD.MM.YYYY)
  const parts = birthdate.split('.');
  if (parts.length !== 3) return 30;
  
  const birthYear = parseInt(parts[2], 10);
  const birthMonth = parseInt(parts[1], 10) - 1;
  const birthDay = parseInt(parts[0], 10);
  
  const birth = new Date(birthYear, birthMonth, birthDay);
  const age = referenceDate.getFullYear() - birth.getFullYear();
  const monthDiff = referenceDate.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birth.getDate())) {
    return age - 1;
  }
  return age;
}

// Parse German date to ISO format
function parseGermanDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // Handle DD.MM.YYYY format
  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;
  
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
  
  return `${year}-${month}-${day}`;
}

// Map country name to nationality code
function mapCountryToNationality(country: string): string | null {
  if (!country) return null;
  
  const countryMap: Record<string, string> = {
    'Deutschland': 'DE',
    'DE': 'DE',
    'Niederlande': 'NL',
    'NL': 'NL',
    'Österreich': 'AT',
    'AT': 'AT',
    'Schweiz': 'CH',
    'CH': 'CH',
    'Belgien': 'BE',
    'BE': 'BE',
    'Frankreich': 'FR',
    'FR': 'FR',
    'Italien': 'IT',
    'IT': 'IT',
    'Großbritannien': 'GB',
    'UK': 'GB',
    'GB': 'GB',
    'Spanien': 'ES',
    'ES': 'ES',
    'USA': 'US',
    'US': 'US',
    'Polen': 'PL',
    'PL': 'PL',
    'Tschechien': 'CZ',
    'CZ': 'CZ',
    'Ungarn': 'HU',
    'HU': 'HU',
    'Dänemark': 'DK',
    'DK': 'DK',
  };
  
  return countryMap[country.trim()] || country.substring(0, 2).toUpperCase();
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { rows, houseId } = await req.json() as { rows: ExcelRow[], houseId: string };

    console.log(`Processing ${rows.length} rows for house ${houseId}`);

    // Validate house exists
    const { data: house, error: houseError } = await supabase
      .from('houses')
      .select('id, name')
      .eq('id', houseId)
      .single();

    if (houseError || !house) {
      return new Response(
        JSON.stringify({ error: 'House not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Group rows by Blatt-Nr.
    const bookingGroups = new Map<string, ExcelRow[]>();
    
    for (const row of rows) {
      const blattNr = row['Blatt-Nr.'];
      if (!blattNr) continue;
      
      if (!bookingGroups.has(blattNr)) {
        bookingGroups.set(blattNr, []);
      }
      bookingGroups.get(blattNr)!.push(row);
    }

    console.log(`Found ${bookingGroups.size} unique bookings (Blatt-Nr.)`);

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
      details: []
    };

    // Process each booking group
    for (const [blattNr, members] of bookingGroups) {
      // First member is the main booker
      const mainBooker = members[0];
      
      const guestName = `${mainBooker['Vorname'] || ''} ${mainBooker['Nachname'] || ''}`.trim();
      const checkIn = parseGermanDate(mainBooker['Anreise']);
      const checkOut = parseGermanDate(mainBooker['Abreise']);
      
      if (!guestName || !checkIn || !checkOut) {
        result.skipped++;
        result.details.push({
          guest: guestName || `Blatt-Nr. ${blattNr}`,
          checkIn: mainBooker['Anreise'] || 'N/A',
          checkOut: mainBooker['Abreise'] || 'N/A',
          status: 'skipped',
          reason: 'Fehlende Pflichtdaten (Name/Anreise/Abreise)'
        });
        continue;
      }

      // Check for duplicate
      const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('house_id', houseId)
        .eq('check_in', checkIn)
        .eq('check_out', checkOut);

      if (existing && existing.length > 0) {
        result.skipped++;
        result.details.push({
          guest: guestName,
          checkIn,
          checkOut,
          status: 'skipped',
          reason: 'Buchung bereits vorhanden'
        });
        continue;
      }

      // Calculate guest counts
      const numberOfGuests = members.length;
      const referenceDate = new Date(checkIn);
      
      let adults = 0;
      let children = 0;
      
      for (const member of members) {
        const age = calculateAge(member['Geburtstag'], referenceDate);
        if (age < 18) {
          children++;
        } else {
          adults++;
        }
      }

      // Get nationality from main booker
      const nationality = mapCountryToNationality(mainBooker['Land']);

      // Insert new booking (only INSERT, never UPDATE)
      const { error: insertError } = await supabase
        .from('bookings')
        .insert({
          house_id: houseId,
          guest_name: guestName,
          check_in: checkIn,
          check_out: checkOut,
          number_of_guests: numberOfGuests,
          number_of_adults: adults,
          number_of_children: children,
          nationality: nationality,
          status: 'completed',
          source: 'excel_import'
        });

      if (insertError) {
        result.errors.push(`Fehler bei ${guestName}: ${insertError.message}`);
        result.details.push({
          guest: guestName,
          checkIn,
          checkOut,
          status: 'error',
          reason: insertError.message
        });
      } else {
        result.imported++;
        result.details.push({
          guest: guestName,
          checkIn,
          checkOut,
          status: 'imported'
        });
      }
    }

    console.log(`Import complete: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
