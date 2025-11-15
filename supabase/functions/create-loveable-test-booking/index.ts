import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('Creating test booking for Loveable...')

    // 1. Create test booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        house_id: 'a2b4d1f7-f396-40a5-b83f-174ccafa55fd',
        guest_name: 'Loveable',
        guest_email: 'uli.berresheim@hotmail.de',
        check_in: '2024-01-15T14:00:00+00:00',
        check_out: '2024-01-17T10:00:00+00:00',
        number_of_guests: 2,
        status: 'completed',
        booking_amount: null,
        currency: 'EUR',
        source: 'manual',
        notes: 'Test-Buchung für Loveable Team App-Review (beeinflusst keine Statistiken)'
      })
      .select()
      .single()

    if (bookingError) {
      console.error('Error creating booking:', bookingError)
      throw bookingError
    }

    console.log('Booking created:', booking.id)

    // 2. Update app review to link to new booking
    const { error: reviewError } = await supabase
      .from('app_reviews')
      .update({ booking_id: booking.id })
      .eq('id', '188bc85f-1e3a-466c-84a6-65552b62412d')

    if (reviewError) {
      console.error('Error updating review:', reviewError)
      throw reviewError
    }

    console.log('Review linked to booking')

    return new Response(
      JSON.stringify({ 
        success: true, 
        booking_id: booking.id,
        message: 'Test booking created and review linked successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
