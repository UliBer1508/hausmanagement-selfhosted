import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Customer number for filtering invoices
const KUNDE_KUNDENNUMMER = 'K470214';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting laundry invoice sync...');

    // Initialize internal Supabase client
    const internalSupabaseUrl = Deno.env.get('SUPABASE_URL');
    const internalSupabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!internalSupabaseUrl || !internalSupabaseKey) {
      throw new Error('Missing internal Supabase credentials');
    }

    const internalSupabase = createClient(internalSupabaseUrl, internalSupabaseKey);

    // Initialize external Supabase client (Wäsche Oberpinzgau)
    const externalSupabaseUrl = 'https://pkpnowevagxmhyqlawng.supabase.co';
    const externalSupabaseKey = Deno.env.get('EXTERNAL_LAUNDRY_ANON_KEY');

    if (!externalSupabaseKey) {
      throw new Error('Missing EXTERNAL_LAUNDRY_ANON_KEY');
    }

    const externalSupabase = createClient(externalSupabaseUrl, externalSupabaseKey);

    // Fetch invoices from external database for our customer
    console.log(`Fetching invoices for customer ${KUNDE_KUNDENNUMMER}...`);
    
    const { data: externalRechnungen, error: fetchError } = await externalSupabase
      .from('rechnungen')
      .select('*, rechnungspositionen(*)')
      .eq('kunde_kundennummer', KUNDE_KUNDENNUMMER)
      .order('rechnungsdatum', { ascending: false });

    if (fetchError) {
      console.error('Error fetching external invoices:', fetchError);
      throw new Error(`Failed to fetch external invoices: ${fetchError.message}`);
    }

    console.log(`Found ${externalRechnungen?.length || 0} invoices in external database`);

    if (!externalRechnungen || externalRechnungen.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No invoices found for sync',
          newCount: 0,
          updatedCount: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get existing invoices from internal database to check what we already have
    const externalIds = externalRechnungen.map(r => r.id);
    const { data: existingInvoices, error: existingError } = await internalSupabase
      .from('laundry_invoices')
      .select('external_rechnung_id, status, bezahlt_am')
      .in('external_rechnung_id', externalIds);

    if (existingError) {
      console.error('Error fetching existing invoices:', existingError);
      throw new Error(`Failed to fetch existing invoices: ${existingError.message}`);
    }

    // Create a map for quick lookup of existing invoices
    const existingMap = new Map(
      (existingInvoices || []).map(inv => [inv.external_rechnung_id, inv])
    );

    let newCount = 0;
    let updatedCount = 0;

    // Process each external invoice
    for (const rechnung of externalRechnungen) {
      const existing = existingMap.get(rechnung.id);
      
      // Prepare invoice data
      const invoiceData: Record<string, unknown> = {
        external_rechnung_id: rechnung.id,
        external_bestellung_id: rechnung.bestellung_id,
        external_kunde_id: rechnung.kunde_id,
        rechnungsnummer: rechnung.rechnungsnummer,
        rechnungsdatum: rechnung.rechnungsdatum,
        faelligkeitsdatum: rechnung.faelligkeitsdatum,
        kunde_name: rechnung.kunde_name,
        kunde_kundennummer: rechnung.kunde_kundennummer,
        kunde_strasse: rechnung.kunde_strasse,
        kunde_plz: rechnung.kunde_plz,
        kunde_ort: rechnung.kunde_ort,
        nettobetrag: rechnung.nettobetrag,
        mwst_satz: rechnung.mwst_satz,
        mwst_betrag: rechnung.mwst_betrag,
        bearbeitungsgebuehr: rechnung.bearbeitungsgebuehr,
        bruttobetrag: rechnung.bruttobetrag,
        positionen: rechnung.rechnungspositionen,
        synced_at: new Date().toISOString(),
        external_updated_at: rechnung.updated_at,
      };

      if (existing) {
        // Update existing invoice - but preserve local status and bezahlt_am!
        const { error: updateError } = await internalSupabase
          .from('laundry_invoices')
          .update(invoiceData)
          .eq('external_rechnung_id', rechnung.id);

        if (updateError) {
          console.error(`Error updating invoice ${rechnung.rechnungsnummer}:`, updateError);
        } else {
          updatedCount++;
          console.log(`Updated invoice ${rechnung.rechnungsnummer}`);
        }
      } else {
        // Insert new invoice - use external status as initial status
        // Map external status to internal status if needed
        let initialStatus = rechnung.status || 'offen';
        if (!['offen', 'bezahlt', 'storniert', 'mahnung'].includes(initialStatus)) {
          initialStatus = 'offen';
        }
        
        invoiceData.status = initialStatus;
        if (rechnung.bezahlt_am) {
          invoiceData.bezahlt_am = rechnung.bezahlt_am;
        }

        const { error: insertError } = await internalSupabase
          .from('laundry_invoices')
          .insert(invoiceData);

        if (insertError) {
          console.error(`Error inserting invoice ${rechnung.rechnungsnummer}:`, insertError);
        } else {
          newCount++;
          console.log(`Inserted new invoice ${rechnung.rechnungsnummer}`);
        }
      }
    }

    console.log(`Sync complete: ${newCount} new, ${updatedCount} updated`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sync erfolgreich: ${newCount} neue, ${updatedCount} aktualisierte Rechnungen`,
        newCount,
        updatedCount,
        totalProcessed: externalRechnungen.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
