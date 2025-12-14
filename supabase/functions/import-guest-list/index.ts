import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  guestBirthDate: string;
  guestTravelDocument: string;
  bookingAmount: number | null;
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

      // Insert new booking
      const { error: insertError } = await supabase
        .from('bookings')
        .insert({
          house_id: houseId,
          guest_name: booking.guestName,
          check_in: booking.checkIn,
          check_out: booking.checkOut,
          number_of_guests: booking.numberOfGuests,
          number_of_adults: booking.numberOfAdults,
          number_of_children: booking.numberOfChildren,
          nationality: booking.nationality || null,
          guest_street: booking.guestStreet || null,
          guest_city: booking.guestCity || null,
          guest_birth_date: booking.guestBirthDate || null,
          guest_travel_document: booking.guestTravelDocument || null,
          booking_amount: booking.bookingAmount || null,
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
        result.details.push({
          guest: booking.guestName,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
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
