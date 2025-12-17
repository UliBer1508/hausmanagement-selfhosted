import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Internal Supabase (Logik Ferienhäuser)
const INTERNAL_SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const INTERNAL_SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// External Supabase (Wäsche Oberpinzgau)
const EXTERNAL_SUPABASE_URL = 'https://pkpnowevagxmhyqlawng.supabase.co';

// Kundennummer bei Wäsche Oberpinzgau
const KUNDENNUMMER = 'K470214';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { linen_order_id } = await req.json();
    
    if (!linen_order_id) {
      throw new Error('linen_order_id is required');
    }

    console.log(`[sync-external] Starting sync for order: ${linen_order_id}`);

    // Initialize clients
    const internalSupabase = createClient(INTERNAL_SUPABASE_URL, INTERNAL_SUPABASE_KEY);
    
    const externalAnonKey = Deno.env.get('EXTERNAL_LAUNDRY_ANON_KEY');
    if (!externalAnonKey) {
      throw new Error('EXTERNAL_LAUNDRY_ANON_KEY not configured');
    }
    const externalSupabase = createClient(EXTERNAL_SUPABASE_URL, externalAnonKey);

    // 1. Check if external sync is enabled
    const { data: automationSettings } = await internalSupabase
      .from('linen_automation_settings')
      .select('external_sync_enabled')
      .single();

    if (!automationSettings?.external_sync_enabled) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'External sync is disabled' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Load the linen order with house, booking and guest data
    const { data: order, error: orderError } = await internalSupabase
      .from('linen_orders')
      .select(`
        *,
        houses!linen_orders_house_id_fkey (id, name, external_objektnummer),
        bookings!linen_orders_booking_id_fkey (guest_name, check_in, check_out, number_of_guests, guests!bookings_guest_id_fkey(name))
      `)
      .eq('id', linen_order_id)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderError?.message}`);
    }

    // Check if already synced
    if (order.external_bestellnummer) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Order already synced',
        external_bestellnummer: order.external_bestellnummer
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const house = order.houses as any;
    const booking = order.bookings as any;

    if (!house?.external_objektnummer) {
      throw new Error(`House ${house?.name} has no external_objektnummer configured`);
    }

    console.log(`[sync-external] House: ${house.name}, Objektnummer: ${house.external_objektnummer}`);

    // 3. Load external master data
    // 3a. Get kunde_id from kunden table
    const { data: kunde, error: kundeError } = await externalSupabase
      .from('kunden')
      .select('id, kundennummer')
      .eq('kundennummer', KUNDENNUMMER)
      .single();

    if (kundeError || !kunde) {
      console.error('[sync-external] Kunde not found:', kundeError);
      throw new Error(`Kunde ${KUNDENNUMMER} not found: ${kundeError?.message}`);
    }
    console.log(`[sync-external] Kunde found: ${kunde.id}`);

    // 3b. Get objekt_id from objekte table
    const { data: objekt, error: objektError } = await externalSupabase
      .from('objekte')
      .select('id, objektnummer')
      .eq('objektnummer', house.external_objektnummer)
      .single();

    if (objektError || !objekt) {
      console.error('[sync-external] Objekt not found:', objektError);
      throw new Error(`Objekt ${house.external_objektnummer} not found: ${objektError?.message}`);
    }
    console.log(`[sync-external] Objekt found: ${objekt.id}`);

    // 3c. Load waescheartikel catalog
    const { data: artikelKatalog, error: artikelError } = await externalSupabase
      .from('waescheartikel')
      .select('id, artikelnummer, bezeichnung')
      .eq('aktiv', true);

    if (artikelError) {
      throw new Error(`Failed to load artikel catalog: ${artikelError.message}`);
    }
    console.log(`[sync-external] Artikel catalog: ${artikelKatalog?.length} items`);

    // Create artikelnummer -> UUID mapping
    const artikelMap: Record<string, string> = {};
    artikelKatalog?.forEach(a => {
      artikelMap[a.artikelnummer] = a.id;
    });

    // 4. Load internal article mapping (internal_item_key -> external_artikelnummer)
    const { data: articleMappings } = await internalSupabase
      .from('external_article_mapping')
      .select('internal_item_key, external_artikelnummer')
      .eq('is_active', true);

    const internalToExternalMap: Record<string, string> = {};
    articleMappings?.forEach(m => {
      internalToExternalMap[m.internal_item_key] = m.external_artikelnummer;
    });
    console.log(`[sync-external] Article mappings: ${Object.keys(internalToExternalMap).length}`);

    // 5. Insert into waeschebestellungen (OHNE bestellnummer - Portal generiert sie)
    // Nutze guests-Relation falls verfügbar, sonst Legacy-Feld
    const guestName = booking?.guests?.name || booking?.guest_name || 'Gast';
    
    const { data: bestellung, error: bestellungError } = await externalSupabase
      .from('waeschebestellungen')
      .insert({
        kunde_id: kunde.id,
        objekt_id: objekt.id,
        gastname: guestName,
        check_in: booking?.check_in?.split('T')[0] || null,
        check_out: booking?.check_out?.split('T')[0] || null,
        anzahl_personen: booking?.number_of_guests || 1,
        lieferdatum: order.delivery_date,
        status: 'neu'
      })
      .select('id, bestellnummer')
      .single();

    if (bestellungError || !bestellung) {
      console.error('[sync-external] Insert bestellung failed:', bestellungError);
      throw new Error(`Failed to create bestellung: ${bestellungError?.message}`);
    }
    console.log(`[sync-external] Bestellung created: ${bestellung.id} (${bestellung.bestellnummer})`);

    // 7. Prepare and insert bestellpositionen
    // items = { "bedding": 5, "large_towels": 10 }
    // item_variants = { "bedding": "grey_striped", "large_towels": "white" } (Farbe pro Artikel)
    const items = order.items || {};
    const itemVariants = order.item_variants || {};
    const globalColor = order.linen_color || 'white_striped'; // Fallback Gesamtfarbe
    const positionen: Array<{ bestellung_id: string; artikel_id: string; menge: number }> = [];
    const unmappedItems: string[] = [];

    // Lade alle verfügbaren Mappings aus der DB
    // Da mehrere externe Artikel zum gleichen internen Artikel passen können (verschiedene Farben),
    // müssen wir nach itemKey + Farbe das richtige Mapping finden
    console.log(`[sync-external] Processing items: ${JSON.stringify(items)}`);
    console.log(`[sync-external] Item variants: ${JSON.stringify(itemVariants)}`);
    console.log(`[sync-external] Global color: ${globalColor}`);

    for (const [itemKey, quantity] of Object.entries(items)) {
      if ((quantity as number) <= 0) continue;

      // Bestimme die Farbe für diesen Artikel
      const itemColor = itemVariants[itemKey] || globalColor;
      
      // Finde das passende externe Artikelnummer
      // Das Mapping ist jetzt: internal_item_key = "bedding" -> external_artikelnummer = "WA001" (grau) oder "WA005" (weiß)
      // Wir brauchen eine erweiterte Logik um die richtige Farbvariante zu finden
      let externalArtikelnummer = internalToExternalMap[itemKey];
      
      // Falls kein direktes Mapping existiert, versuche mit Farbsuffix
      if (!externalArtikelnummer) {
        const keyWithColor = `${itemKey}__${itemColor}`;
        externalArtikelnummer = internalToExternalMap[keyWithColor];
      }
      
      if (!externalArtikelnummer) {
        console.warn(`[sync-external] No mapping for: ${itemKey} (color: ${itemColor})`);
        unmappedItems.push(`${itemKey} (${itemColor})`);
        continue;
      }

      const artikelId = artikelMap[externalArtikelnummer];
      
      if (!artikelId) {
        console.warn(`[sync-external] Artikelnummer ${externalArtikelnummer} not in catalog`);
        unmappedItems.push(`${itemKey} -> ${externalArtikelnummer} (not found)`);
        continue;
      }

      positionen.push({
        bestellung_id: bestellung.id,
        artikel_id: artikelId,
        menge: quantity as number
      });
      console.log(`[sync-external] Position: ${itemKey} (${itemColor}) -> ${externalArtikelnummer} x ${quantity}`);
    }

    if (positionen.length > 0) {
      const { error: positionenError } = await externalSupabase
        .from('bestellpositionen')
        .insert(positionen);

      if (positionenError) {
        console.error('[sync-external] Insert positionen failed:', positionenError);
        // Continue - order was created
      } else {
        console.log(`[sync-external] ${positionen.length} positionen created`);
      }
    }

    // 8. Create history entry
    await externalSupabase
      .from('bestellung_history')
      .insert({
        bestellung_id: bestellung.id,
        status: 'neu',
        bearbeiter_name: 'Logik Ferienhäuser',
        notiz: `Automatisch importiert (Order: ${order.id})`
      });

    // 9. Update internal order with external bestellnummer
    await internalSupabase
      .from('linen_orders')
      .update({
        external_bestellnummer: bestellnummer,
        external_synced_at: new Date().toISOString()
      })
      .eq('id', linen_order_id);

    console.log('[sync-external] Sync completed successfully');

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Order synced successfully',
      external_bestellnummer: bestellnummer,
      external_bestellung_id: bestellung.id,
      positionen_count: positionen.length,
      unmapped_items: unmappedItems.length > 0 ? unmappedItems : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[sync-external] Error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
