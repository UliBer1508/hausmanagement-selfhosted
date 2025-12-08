import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { linen_order_id } = await req.json();

    if (!linen_order_id) {
      return new Response(
        JSON.stringify({ error: 'linen_order_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const externalApiKey = Deno.env.get('EXTERNAL_LAUNDRY_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[sync-linen-order-external] Starting sync for order: ${linen_order_id}`);

    // 1. Load automation settings
    const { data: settings, error: settingsError } = await supabase
      .from('linen_automation_settings')
      .select('*')
      .single();

    if (settingsError) {
      console.error('[sync-linen-order-external] Error loading settings:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Failed to load automation settings', details: settingsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings.external_sync_enabled) {
      console.log('[sync-linen-order-external] External sync is disabled');
      return new Response(
        JSON.stringify({ success: false, message: 'External sync is disabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!externalApiKey) {
      console.error('[sync-linen-order-external] EXTERNAL_LAUNDRY_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'External API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Load linen order with booking and house
    const { data: order, error: orderError } = await supabase
      .from('linen_orders')
      .select(`
        *,
        houses:house_id (id, name, external_objektnummer),
        bookings:booking_id (id, guest_name, check_in, check_out, number_of_guests)
      `)
      .eq('id', linen_order_id)
      .single();

    if (orderError || !order) {
      console.error('[sync-linen-order-external] Error loading order:', orderError);
      return new Response(
        JSON.stringify({ error: 'Failed to load linen order', details: orderError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already synced
    if (order.external_bestellnummer) {
      console.log(`[sync-linen-order-external] Order already synced: ${order.external_bestellnummer}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Order already synced', external_bestellnummer: order.external_bestellnummer }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const house = order.houses as any;
    const booking = order.bookings as any;

    if (!house?.external_objektnummer) {
      console.error('[sync-linen-order-external] House has no external_objektnummer');
      return new Response(
        JSON.stringify({ error: 'House has no external object number configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Load linen set definitions (contains external_artikelnummer mapping)
    const { data: linenDef, error: linenDefError } = await supabase
      .from('linen_set_definitions')
      .select('custom_categories')
      .eq('house_id', order.house_id)
      .single();

    if (linenDefError) {
      console.warn('[sync-linen-order-external] Could not load linen definitions:', linenDefError.message);
    }

    const customCategories = (linenDef?.custom_categories || {}) as Record<string, any>;

    // 4. Map order items to external format using external_artikelnummer from custom_categories
    const orderItems = order.items as Record<string, number> || {};
    const itemVariants = (order.item_variants || {}) as Record<string, { color?: string }>;
    const globalLinenColor = order.linen_color || 'white_striped';
    
    const unmappedItems: string[] = [];
    const positionen: { artikelnummer: string; menge: number; notizen?: string }[] = [];

    for (const [itemKey, quantity] of Object.entries(orderItems)) {
      if (quantity <= 0) continue;

      const itemConfig = customCategories[itemKey];
      const externalMapping = itemConfig?.external_artikelnummer as Record<string, string> | undefined;
      
      if (!externalMapping || Object.keys(externalMapping).length === 0) {
        unmappedItems.push(itemKey);
        console.warn(`[sync-linen-order-external] No external mapping for: ${itemKey}`);
        continue;
      }

      // Determine color: use item-specific color from item_variants, or global linen_color, or item default
      let itemColor = itemVariants[itemKey]?.color;
      if (!itemColor) {
        // For Schlafbereich items, use global linen_color; for others, use 'white' or 'default'
        const category = itemConfig?.category;
        if (category === 'Schlafbereich') {
          itemColor = globalLinenColor;
        } else if (category === 'Badbereich' || category === 'Wellness') {
          itemColor = 'white'; // Default for bath/wellness items
        } else {
          itemColor = 'default';
        }
      }

      // Look up external artikelnummer for this color
      let externalArtikelnummer = externalMapping[itemColor];
      
      // Fallback: try 'default' if specific color not found
      if (!externalArtikelnummer && externalMapping['default']) {
        externalArtikelnummer = externalMapping['default'];
      }
      
      // Fallback: use first available mapping
      if (!externalArtikelnummer) {
        const firstKey = Object.keys(externalMapping)[0];
        externalArtikelnummer = externalMapping[firstKey];
        console.log(`[sync-linen-order-external] Using fallback mapping for ${itemKey}: ${firstKey} -> ${externalArtikelnummer}`);
      }

      if (!externalArtikelnummer) {
        unmappedItems.push(itemKey);
        console.warn(`[sync-linen-order-external] No matching color mapping for: ${itemKey} (color: ${itemColor})`);
        continue;
      }

      positionen.push({
        artikelnummer: externalArtikelnummer,
        menge: quantity as number
      });

      console.log(`[sync-linen-order-external] Mapped: ${itemKey} (${itemColor}) -> ${externalArtikelnummer} x ${quantity}`);
    }

    if (positionen.length === 0) {
      console.error('[sync-linen-order-external] No items could be mapped');
      return new Response(
        JSON.stringify({ 
          error: 'No items could be mapped to external article numbers',
          unmapped_items: unmappedItems
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Build external API payload
    const payload = {
      kundennummer: settings.external_kundennummer || 'K470214',
      objektnummer: house.external_objektnummer,
      gastname: booking?.guest_name || undefined,
      check_in: booking?.check_in ? booking.check_in.split('T')[0] : undefined,
      check_out: booking?.check_out ? booking.check_out.split('T')[0] : undefined,
      anzahl_personen: booking?.number_of_guests || undefined,
      lieferdatum: order.delivery_date || undefined,
      lieferzeit: order.delivery_time || undefined,
      notizen: order.notes || undefined,
      positionen
    };

    console.log('[sync-linen-order-external] Sending to external API:', JSON.stringify(payload, null, 2));

    // 6. Send to external API
    const externalApiUrl = settings.external_api_url || 'https://pkpnowevagxmhyqlawng.supabase.co/functions/v1/external-order-import';
    
    const externalResponse = await fetch(externalApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${externalApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const externalResult = await externalResponse.json();
    console.log('[sync-linen-order-external] External API response:', externalResponse.status, JSON.stringify(externalResult));

    if (!externalResponse.ok) {
      return new Response(
        JSON.stringify({ 
          error: 'External API request failed',
          status: externalResponse.status,
          details: externalResult
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Update linen order with external tracking
    const { error: updateError } = await supabase
      .from('linen_orders')
      .update({
        external_bestellnummer: externalResult.data?.bestellnummer || externalResult.bestellnummer,
        external_synced_at: new Date().toISOString()
      })
      .eq('id', linen_order_id);

    if (updateError) {
      console.error('[sync-linen-order-external] Error updating order:', updateError);
      // Don't fail - the external order was created successfully
    }

    console.log(`[sync-linen-order-external] Successfully synced order. External Bestellnummer: ${externalResult.data?.bestellnummer || externalResult.bestellnummer}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        external_bestellnummer: externalResult.data?.bestellnummer || externalResult.bestellnummer,
        unmapped_items: unmappedItems.length > 0 ? unmappedItems : undefined
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sync-linen-order-external] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
