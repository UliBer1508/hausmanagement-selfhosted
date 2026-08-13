import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = await requireAdmin(req, corsHeaders);
  if (authError) return authError;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { processedBookings, houseId } = await req.json() as { 
      processedBookings: ProcessedBooking[], 
      houseId: string 
    };

    console.log(`Processing ${processedBookings.length} bookings for house ${houseId}`);

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

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
      details: []
    };

    let zugeordnet = 0;   // Etappe 5: Buchungen mit selbst gesetzter guest_id

    // Process each booking
    for (const booking of processedBookings) {
      // Skip invalid bookings
      if (!booking.isValid) {
        result.skipped++;
        result.details.push({
          guest: booking.guestName || `Blatt-Nr. ${booking.blattNr}`,
          checkIn: booking.checkIn || 'N/A',
          checkOut: booking.checkOut || 'N/A',
          status: 'skipped',
          reason: booking.validationErrors.join(', ') || 'Ungültige Daten'
        });
        continue;
      }

      // Check for duplicate
      const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('house_id', houseId)
        .eq('check_in', booking.checkIn)
        .eq('check_out', booking.checkOut);

      if (existing && existing.length > 0) {
        result.skipped++;
        result.details.push({
          guest: booking.guestName,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          status: 'skipped',
          reason: 'Buchung bereits vorhanden'
        });
        continue;
      }

      // Gast zuerst in `guests` anlegen oder wiederfinden.
      //
      // Etappe 5 (13.08.2026): Bisher entstand der Gast nur als Nebenwirkung —
      // die Daten gingen in die Kopiespalten der Buchung, und erst der Trigger
      // link_guest_on_booking_insert legte daraus einen Gast an.
      //
      // find_or_create_guest() ist dieselbe sechsstufige Kaskade, die auch der
      // Trigger benutzt (SQL/41_gastdaten_entdopplung_etappe5.sql).
      //
      // WICHTIG FUER MELDESCHEINE: Sie liefern weder E-Mail noch Telefon. Die
      // Stufen 1, 2 und 6 der Kaskade greifen hier also nie. Wiedererkannt wird
      // ueber Stufe 3 (Name + Nationalitaet + Stadt), Stufe 4 (Name +
      // Geburtsdatum) und Stufe 5 (Name + seltene Nationalitaet) — genau die
      // Angaben, die ein Meldeschein fuehrt. Ein reines E-Mail-Matching wuerde
      // bei jedem Import neue Gaeste erzeugen.
      //
      // `notes` wird bewusst NICHT mitgegeben: Die Kaskade fuellt bei einem
      // bestehenden Gast Luecken auf, und ein Importvermerk waere dort keine
      // Bereicherung, sondern wuerde ein leeres Notizfeld dauerhaft belegen.
      //
      // FEHLERFALL BEWUSST WEICH: Schlaegt der Aufruf fehl, laeuft der INSERT
      // ohne guest_id weiter und der Trigger uebernimmt wie bisher. Ein Import
      // darf nicht daran scheitern, dass die Gast-Zuordnung klemmt.
      let guestId: string | null = null;
      const { data: rpcGuestId, error: guestError } = await supabase.rpc('find_or_create_guest', {
        p_name:            booking.guestName,
        p_street:          booking.guestStreet || null,
        p_city:            booking.guestCity || null,
        p_postal_code:     booking.guestPostalCode || null,
        p_birth_date:      booking.guestBirthDate || null,
        p_travel_document: booking.guestTravelDocument || null,
        p_nationality:     booking.nationality || null,
      });

      if (guestError) {
        console.error(`find_or_create_guest fehlgeschlagen fuer ${booking.guestName}, Trigger uebernimmt:`, guestError);
      } else {
        guestId = rpcGuestId as string | null;
      }

      // Insert new booking
      const { error: insertError } = await supabase
        .from('bookings')
        .insert({
          house_id: houseId,
          guest_id: guestId,
          guest_name: booking.guestName,
          check_in: booking.checkIn,
          check_out: booking.checkOut,
          number_of_guests: booking.numberOfGuests,
          number_of_adults: booking.numberOfAdults,
          number_of_children: booking.numberOfChildren,
          nationality: booking.nationality || null,
          guest_street: booking.guestStreet || null,
          guest_city: booking.guestCity || null,
          guest_postal_code: booking.guestPostalCode || null,
          guest_birth_date: booking.guestBirthDate || null,
          guest_travel_document: booking.guestTravelDocument || null,
          status: 'completed',
          source: 'excel_import'
        });

      if (insertError) {
        result.errors.push(`Fehler bei ${booking.guestName}: ${insertError.message}`);
        result.details.push({
          guest: booking.guestName,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          status: 'error',
          reason: insertError.message
        });
      } else {
        result.imported++;
        if (guestId) zugeordnet++;
        result.details.push({
          guest: booking.guestName,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          status: 'imported'
        });
      }
    }

    console.log(`Import complete: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`);
    // Etappe 5: sichtbar machen, wie viele Buchungen ihre guest_id selbst
    // mitgebracht haben. Bleibt der Wert bei 0, obwohl importiert wurde,
    // klemmt der RPC-Aufruf und der Trigger arbeitet still weiter.
    console.log(`Gast-Zuordnung: ${zugeordnet} von ${result.imported} Buchungen direkt verknuepft`);

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
