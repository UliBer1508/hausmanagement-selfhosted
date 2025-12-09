import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// External Supabase (Wäsche Oberpinzgau Portal)
const EXTERNAL_SUPABASE_URL = 'https://pkpnowevagxmhyqlawng.supabase.co';

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

    // Internal Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // External Supabase client (direct table access)
    const externalAnonKey = Deno.env.get('EXTERNAL_LAUNDRY_ANON_KEY');
    if (!externalAnonKey) {
      console.error('[sync-linen-order-external] EXTERNAL_LAUNDRY_ANON_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'External Supabase key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const externalSupabase = createClient(EXTERNAL_SUPABASE_URL, externalAnonKey);

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

    // 5. First, let's query the external database to understand the table structure
    console.log('[sync-linen-order-external] Querying external database structure...');
    
    // Try to get table structure by querying with limit 0 or check what tables exist
    const { data: externalOrders, error: externalQueryError } = await externalSupabase
      .from('orders')
      .select('*')
      .limit(1);

    if (externalQueryError) {
      console.log('[sync-linen-order-external] "orders" table query error:', externalQueryError.message);
      
      // Try alternative table names
      const { data: bestellungen, error: bestellungenError } = await externalSupabase
        .from('bestellungen')
        .select('*')
        .limit(1);
      
      if (bestellungenError) {
        console.log('[sync-linen-order-external] "bestellungen" table query error:', bestellungenError.message);
        
        // Try linen_orders
        const { data: linenOrders, error: linenOrdersError } = await externalSupabase
          .from('linen_orders')
          .select('*')
          .limit(1);
        
        if (linenOrdersError) {
          console.error('[sync-linen-order-external] Cannot find orders table. Tried: orders, bestellungen, linen_orders');
          return new Response(
            JSON.stringify({ 
              error: 'Cannot access external orders table',
              details: {
                orders_error: externalQueryError.message,
                bestellungen_error: bestellungenError.message,
                linen_orders_error: linenOrdersError.message
              }
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          console.log('[sync-linen-order-external] Found "linen_orders" table:', linenOrders);
        }
      } else {
        console.log('[sync-linen-order-external] Found "bestellungen" table:', bestellungen);
      }
    } else {
      console.log('[sync-linen-order-external] Found "orders" table. Sample:', externalOrders);
    }

    // 6. Build order data for external insert
    const externalOrderData = {
      kundennummer: settings.external_kundennummer || 'K470214',
      objektnummer: house.external_objektnummer,
      gastname: booking?.guest_name || null,
      check_in: booking?.check_in ? booking.check_in.split('T')[0] : null,
      check_out: booking?.check_out ? booking.check_out.split('T')[0] : null,
      anzahl_personen: booking?.number_of_guests || null,
      lieferdatum: order.delivery_date || null,
      lieferzeit: order.delivery_time || null,
      notizen: order.notes || null,
      positionen: positionen,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    console.log('[sync-linen-order-external] Inserting into external database:', JSON.stringify(externalOrderData, null, 2));

    // 7. Insert into external database - try different table names
    let insertResult: any = null;
    let insertError: any = null;
    let tableName = '';

    // Try 'orders' first
    const { data: ordersInsert, error: ordersInsertError } = await externalSupabase
      .from('orders')
      .insert(externalOrderData)
      .select()
      .single();

    if (!ordersInsertError) {
      insertResult = ordersInsert;
      tableName = 'orders';
    } else {
      console.log('[sync-linen-order-external] Insert into "orders" failed:', ordersInsertError.message);
      
      // Try 'bestellungen'
      const { data: bestellungenInsert, error: bestellungenInsertError } = await externalSupabase
        .from('bestellungen')
        .insert(externalOrderData)
        .select()
        .single();

      if (!bestellungenInsertError) {
        insertResult = bestellungenInsert;
        tableName = 'bestellungen';
      } else {
        console.log('[sync-linen-order-external] Insert into "bestellungen" failed:', bestellungenInsertError.message);
        
        // Try 'linen_orders'
        const { data: linenOrdersInsert, error: linenOrdersInsertError } = await externalSupabase
          .from('linen_orders')
          .insert(externalOrderData)
          .select()
          .single();

        if (!linenOrdersInsertError) {
          insertResult = linenOrdersInsert;
          tableName = 'linen_orders';
        } else {
          insertError = {
            orders: ordersInsertError.message,
            bestellungen: bestellungenInsertError.message,
            linen_orders: linenOrdersInsertError.message
          };
        }
      }
    }

    if (!insertResult) {
      console.error('[sync-linen-order-external] Failed to insert into any table:', insertError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to insert order into external database',
          details: insertError
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-linen-order-external] Successfully inserted into "${tableName}":`, insertResult);

    // Extract bestellnummer from result (might be id or bestellnummer field)
    const externalBestellnummer = insertResult.bestellnummer || insertResult.id || `EXT-${Date.now()}`;

    // 8. Update local linen order with external tracking
    const { error: updateError } = await supabase
      .from('linen_orders')
      .update({
        external_bestellnummer: String(externalBestellnummer),
        external_synced_at: new Date().toISOString()
      })
      .eq('id', linen_order_id);

    if (updateError) {
      console.error('[sync-linen-order-external] Error updating local order:', updateError);
      // Don't fail - the external order was created successfully
    }

    console.log(`[sync-linen-order-external] Successfully synced order. External ID: ${externalBestellnummer}, Table: ${tableName}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        external_bestellnummer: externalBestellnummer,
        table_used: tableName,
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
