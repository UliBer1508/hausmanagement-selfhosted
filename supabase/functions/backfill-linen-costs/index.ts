import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🔧 [backfill-linen-costs] Start');

    const { data: orders, error } = await supabase
      .from('linen_orders')
      .select('id, booking_id, total_cost, created_at')
      .not('booking_id', 'is', null)
      .gte('created_at', '2026-01-01')
      .or('total_cost.is.null,total_cost.eq.0');

    if (error) throw error;

    const checked = orders?.length ?? 0;
    let updated = 0;
    const skipped: Array<{ order_id: string; booking_id: string | null; reason: string }> = [];

    for (const order of orders ?? []) {
      try {
        const { data: result, error: invokeErr } = await supabase.functions.invoke(
          'generate-booking-linen-order',
          { body: { booking_id: order.booking_id } }
        );

        if (invokeErr) {
          console.warn(`⚠️ Invoke failed for order ${order.id} / booking ${order.booking_id}:`, invokeErr.message);
          skipped.push({ order_id: order.id, booking_id: order.booking_id, reason: `invoke_error: ${invokeErr.message}` });
          continue;
        }

        const estimatedCost = result?.estimated_cost;
        if (estimatedCost == null || typeof estimatedCost !== 'number') {
          console.warn(`⚠️ No estimated_cost for order ${order.id} / booking ${order.booking_id}`);
          skipped.push({ order_id: order.id, booking_id: order.booking_id, reason: 'missing_estimated_cost' });
          continue;
        }

        const { error: updateErr } = await supabase
          .from('linen_orders')
          .update({ total_cost: estimatedCost })
          .eq('id', order.id);

        if (updateErr) {
          console.warn(`⚠️ Update failed for order ${order.id}:`, updateErr.message);
          skipped.push({ order_id: order.id, booking_id: order.booking_id, reason: `update_error: ${updateErr.message}` });
          continue;
        }

        updated++;
        console.log(`✅ Order ${order.id} (booking ${order.booking_id}): total_cost=${estimatedCost}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`⚠️ Exception for order ${order.id}:`, msg);
        skipped.push({ order_id: order.id, booking_id: order.booking_id, reason: `exception: ${msg}` });
      }
    }

    const summary = {
      success: true,
      checked,
      updated,
      skipped: skipped.length,
      skipped_bookings: skipped,
      timestamp: new Date().toISOString(),
    };

    console.log(`🏁 [backfill-linen-costs] Done — checked=${checked}, updated=${updated}, skipped=${skipped.length}`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('❌ [backfill-linen-costs] Fatal:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});