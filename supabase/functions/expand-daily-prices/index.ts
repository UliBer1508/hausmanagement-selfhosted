import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[expand-daily-prices] Starting daily price expansion...');

    // Lade alle Gesamtpreis-Einträge die noch nicht expandiert wurden
    const { data: totalPrices, error: fetchError } = await supabase
      .from('weekly_pricing')
      .select('*')
      .not('period_nights', 'is', null)
      .gt('period_nights', 0)
      .is('is_expanded', false)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('[expand-daily-prices] Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch total prices', details: fetchError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!totalPrices || totalPrices.length === 0) {
      console.log('[expand-daily-prices] No total prices to expand');
      return new Response(
        JSON.stringify({ message: 'No total prices to expand', expanded: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[expand-daily-prices] Found ${totalPrices.length} total prices to expand`);

    let totalDailyRecords = 0;
    const errors: string[] = [];

    for (const record of totalPrices) {
      try {
        const totalPrice = record.period_total_price;
        const nights = record.period_nights;
        const checkIn = new Date(record.period_check_in);
        const checkOut = new Date(record.period_check_out);

        const pricePerNight = totalPrice / nights;

        console.log(
          `[expand-daily-prices] Expanding: ${totalPrice} EUR / ${nights} nights = ${pricePerNight.toFixed(2)} EUR/night (${record.period_check_in} to ${record.period_check_out})`
        );

        // Erstelle Tageseinträge
        const dailyRecords = [];
        for (let i = 0; i < nights; i++) {
          const currentDate = new Date(checkIn);
          currentDate.setDate(currentDate.getDate() + i);

          dailyRecords.push({
            competitor_property_id: record.competitor_property_id,
            house_id: record.house_id,
            date: currentDate.toISOString().split('T')[0],
            price: pricePerNight,
            currency: record.currency,
            is_available: record.is_available,
            source: 'expanded',
            scraped_at: record.scraped_at,
            period_total_price: totalPrice,
            period_check_in: record.period_check_in,
            period_check_out: record.period_check_out,
            period_nights: nights,
            is_expanded: true,
          });
        }

        // Upsert Tageseinträge
        const { error: upsertError } = await supabase
          .from('weekly_pricing')
          .upsert(dailyRecords, {
            onConflict: 'competitor_property_id,date',
          });

        if (upsertError) {
          console.error(`[expand-daily-prices] Upsert error for record ${record.id}:`, upsertError);
          errors.push(`Record ${record.id}: ${upsertError.message}`);
          continue;
        }

        // Markiere Original-Eintrag als expandiert
        const { error: updateError } = await supabase
          .from('weekly_pricing')
          .update({ is_expanded: true })
          .eq('id', record.id);

        if (updateError) {
          console.error(`[expand-daily-prices] Update error for record ${record.id}:`, updateError);
          errors.push(`Update ${record.id}: ${updateError.message}`);
          continue;
        }

        totalDailyRecords += dailyRecords.length;
        console.log(`[expand-daily-prices] Successfully expanded record ${record.id} into ${dailyRecords.length} daily records`);
      } catch (recordError) {
        console.error(`[expand-daily-prices] Error processing record ${record.id}:`, recordError);
        errors.push(`Record ${record.id}: ${recordError.message}`);
      }
    }

    console.log(`[expand-daily-prices] Expansion complete. Created ${totalDailyRecords} daily records from ${totalPrices.length} total prices`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Daily price expansion completed',
        expanded: totalPrices.length,
        dailyRecordsCreated: totalDailyRecords,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[expand-daily-prices] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
