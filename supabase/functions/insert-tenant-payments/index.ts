import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { requireAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authError = await requireAdmin(req, corsHeaders);
  if (authError) return authError;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { houseId, payments } = await req.json()

    // Insert all payments
    const { data, error } = await supabase
      .from('tenant_payments')
      .insert(payments)
      .select()

    if (error) {
      console.error('Error inserting payments:', error)
      throw error
    }

    return new Response(
      JSON.stringify({ success: true, count: data.length, data }),
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
