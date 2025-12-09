import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// External Supabase (Wäsche Oberpinzgau)
const EXTERNAL_SUPABASE_URL = 'https://pkpnowevagxmhyqlawng.supabase.co';
const KUNDENNUMMER = 'K470214';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[test-external-laundry] Starting connection test...');

    const externalAnonKey = Deno.env.get('EXTERNAL_LAUNDRY_ANON_KEY');
    if (!externalAnonKey) {
      throw new Error('EXTERNAL_LAUNDRY_ANON_KEY not configured');
    }
    
    const externalSupabase = createClient(EXTERNAL_SUPABASE_URL, externalAnonKey);
    const results: Record<string, any> = {};

    // 1. Test kunden table
    console.log('[test-external-laundry] Querying kunden...');
    const { data: kunden, error: kundenError } = await externalSupabase
      .from('kunden')
      .select('id, kundennummer, name, aktiv')
      .eq('kundennummer', KUNDENNUMMER);
    
    results.kunden = {
      success: !kundenError,
      data: kunden,
      error: kundenError?.message
    };

    // 2. Test objekte table
    console.log('[test-external-laundry] Querying objekte...');
    const { data: objekte, error: objekteError } = await externalSupabase
      .from('objekte')
      .select('id, objektnummer, name, kunde_id')
      .limit(10);
    
    results.objekte = {
      success: !objekteError,
      count: objekte?.length,
      sample: objekte?.slice(0, 3),
      error: objekteError?.message
    };

    // 3. Test waescheartikel table
    console.log('[test-external-laundry] Querying waescheartikel...');
    const { data: artikel, error: artikelError } = await externalSupabase
      .from('waescheartikel')
      .select('id, artikelnummer, bezeichnung, aktiv')
      .eq('aktiv', true)
      .limit(20);
    
    results.waescheartikel = {
      success: !artikelError,
      count: artikel?.length,
      items: artikel,
      error: artikelError?.message
    };

    // 4. Test waeschebestellungen table (read only)
    console.log('[test-external-laundry] Querying waeschebestellungen...');
    const { data: bestellungen, error: bestellungenError } = await externalSupabase
      .from('waeschebestellungen')
      .select('id, bestellnummer, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    results.waeschebestellungen = {
      success: !bestellungenError,
      count: bestellungen?.length,
      sample: bestellungen,
      error: bestellungenError?.message
    };

    // 5. Check if our objects exist
    console.log('[test-external-laundry] Checking our specific objects...');
    const { data: unsereObjekte, error: unsereObjekteError } = await externalSupabase
      .from('objekte')
      .select('id, objektnummer, name')
      .in('objektnummer', ['O415239', 'O550634']);
    
    results.unsere_objekte = {
      success: !unsereObjekteError,
      data: unsereObjekte,
      error: unsereObjekteError?.message
    };

    // Summary
    const allSuccess = Object.values(results).every((r: any) => r.success);
    
    console.log('[test-external-laundry] Test completed:', JSON.stringify(results, null, 2));

    return new Response(JSON.stringify({ 
      success: allSuccess,
      message: allSuccess ? 'All tables accessible' : 'Some tables failed',
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[test-external-laundry] Error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
