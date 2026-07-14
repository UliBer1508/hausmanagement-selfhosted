import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAdmin } from "../_shared/auth.ts";
import {
  callGemini,
  extractTextFromResponse,
  extractFunctionCalls,
  hasFunctionCalls,
  convertToolsToGemini,
  GeminiContent,
  GeminiPart
} from "../_shared/gemini.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * LINEN ORDER STATUS STANDARD (gespiegelt von src/lib/linenOrderHelpers.ts)
 * NIEMALS 'pending', 'bestellt' oder 'assigned' verwenden!
 */
const LINEN_ORDER_STATUSES = {
  OFFEN: 'offen',
  AUSSTEHEND: 'ausstehend',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
} as const;

// Initialize Supabase client with service role key for full access
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

// ==================== TOOL EXECUTION FUNCTIONS ====================

// Booking Inquiries Tools
async function executeSearchBookingInquiries(params: any) {
  console.log('Executing search_booking_inquiries with params:', params);

  let query = supabase
    .from('booking_inquiries')
    .select('*, houses(name)')
    .order('created_at', { ascending: false });

  if (params.status) {
    query = query.eq('status', params.status);
  }
  if (params.house_id) {
    query = query.eq('house_id', params.house_id);
  }
  if (params.guest_name) {
    query = query.ilike('guest_name', `%${params.guest_name}%`);
  }
  if (params.date_from) {
    query = query.gte('check_in', params.date_from);
  }
  if (params.date_to) {
    query = query.lte('check_in', params.date_to);
  }

  const { data, error } = await query.limit(20);

  if (error) {
    console.error('Error searching booking inquiries:', error);
    return { success: false, error: error.message };
  }

  console.log(`Found ${data?.length || 0} booking inquiries`);
  return { success: true, data, count: data?.length || 0 };
}

async function executeAcceptBookingInquiry(params: any) {
  console.log('Executing accept_booking_inquiry with params:', params);

  const { inquiry_id } = params;

  // 1. Get the inquiry
  const { data: inquiry, error: inquiryError } = await supabase
    .from('booking_inquiries')
    .select('*, houses(name)')
    .eq('id', inquiry_id)
    .single();

  if (inquiryError || !inquiry) {
    return { success: false, error: 'Buchungsanfrage nicht gefunden' };
  }

  if (inquiry.status !== 'pending') {
    return { success: false, error: `Anfrage ist bereits ${inquiry.status}` };
  }

  // 2. Create the booking
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      house_id: inquiry.house_id,
      guest_name: inquiry.guest_name,
      guest_email: inquiry.guest_email,
      guest_phone: inquiry.guest_phone,
      check_in: inquiry.check_in,
      check_out: inquiry.check_out,
      number_of_guests: inquiry.number_of_guests,
      number_of_adults: inquiry.number_of_adults,
      number_of_children: inquiry.number_of_children,
      booking_amount: inquiry.estimated_amount,
      notes: inquiry.message,
      status: 'confirmed',
      source: 'inquiry'
    })
    .select()
    .single();

  if (bookingError) {
    console.error('Error creating booking:', bookingError);
    return { success: false, error: 'Fehler beim Erstellen der Buchung: ' + bookingError.message };
  }

  // 3. Create cleaning task for check-out
  const { error: cleaningError } = await supabase
    .from('service_tasks')
    .insert({
      house_id: inquiry.house_id,
      booking_id: booking.id,
      service_type: 'cleaning',
      scheduled_date: inquiry.check_out.split('T')[0],
      scheduled_time: '10:00',
      status: 'scheduled',
      notes: `Reinigung nach Abreise von ${inquiry.guest_name}`
    });

  if (cleaningError) {
    console.warn('Error creating cleaning task:', cleaningError);
    // Don't fail the whole operation
  }

  // 4. Update inquiry status
  await supabase
    .from('booking_inquiries')
    .update({ status: 'confirmed' })
    .eq('id', inquiry_id);

  await logMaxAction({
    action_type: 'accept_booking_inquiry',
    status: 'abgeschlossen',
    booking_id: booking.id,
    guest_name: inquiry.guest_name,
    last_step: 'Buchungsanfrage angenommen',
    details: { house_name: inquiry.houses?.name, check_in: inquiry.check_in, check_out: inquiry.check_out },
    created_by: 'uli',
  });

  return {
    success: true,
    booking_id: booking.id,
    guest_name: inquiry.guest_name,
    house_name: inquiry.houses?.name,
    check_in: inquiry.check_in,
    check_out: inquiry.check_out
  };
}

async function executeRejectBookingInquiry(params: any) {
  console.log('Executing reject_booking_inquiry with params:', params);

  const { inquiry_id, reason } = params;

  const { data, error } = await supabase
    .from('booking_inquiries')
    .update({
      status: 'rejected',
      message: reason ? `[Abgelehnt: ${reason}] ${params.original_message || ''}` : undefined
    })
    .eq('id', inquiry_id)
    .select('*, houses(name)')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  await logMaxAction({
    action_type: 'reject_booking_inquiry',
    status: 'abgelehnt',
    guest_name: data.guest_name,
    last_step: 'Buchungsanfrage abgelehnt',
    details: { house_name: data.houses?.name, grund: reason || null },
    created_by: 'uli',
  });

  return {
    success: true,
    guest_name: data.guest_name,
    house_name: data.houses?.name
  };
}

// Bulk Action Tools
async function executeCreateBulkCleaningTasks(params: any) {
  console.log('Executing create_bulk_cleaning_tasks with params:', params);

  const { for_date, trigger, house_id } = params;

  // Calculate the target date
  let targetDate = for_date;
  if (for_date === 'tomorrow') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    targetDate = tomorrow.toISOString().split('T')[0];
  } else if (for_date === 'today') {
    targetDate = new Date().toISOString().split('T')[0];
  }

  // Find bookings based on trigger
  let query = supabase
    .from('bookings')
    .select('id, guest_name, house_id, check_in, check_out, houses(name)')
    .neq('status', 'cancelled');

  if (trigger === 'checkout') {
    query = query
      .gte('check_out', `${targetDate}T00:00:00`)
      .lt('check_out', `${targetDate}T23:59:59`);
  } else if (trigger === 'checkin') {
    query = query
      .gte('check_in', `${targetDate}T00:00:00`)
      .lt('check_in', `${targetDate}T23:59:59`);
  }

  if (house_id) {
    query = query.eq('house_id', house_id);
  }

  const { data: bookings, error: bookingsError } = await query;

  if (bookingsError) {
    return { success: false, error: bookingsError.message };
  }

  if (!bookings || bookings.length === 0) {
    return {
      success: true,
      created: 0,
      skipped: 0,
      message: `Keine ${trigger === 'checkout' ? 'Abreisen' : 'Ankünfte'} am ${targetDate} gefunden`
    };
  }

  // Check which bookings already have cleaning tasks
  const bookingIds = bookings.map(b => b.id);
  const { data: existingTasks } = await supabase
    .from('service_tasks')
    .select('booking_id')
    .in('booking_id', bookingIds)
    .eq('service_type', 'cleaning')
    .neq('status', 'cancelled');

  const existingBookingIds = new Set(existingTasks?.map(t => t.booking_id) || []);

  // Create missing tasks
  const tasksToCreate = [];
  const createdDetails = [];
  const skippedDetails = [];

  for (const booking of bookings) {
    if (existingBookingIds.has(booking.id)) {
      skippedDetails.push({
        house_name: booking.houses?.name,
        guest_name: booking.guest_name,
        reason: 'Bereits Reinigung vorhanden'
      });
      continue;
    }

    tasksToCreate.push({
      house_id: booking.house_id,
      booking_id: booking.id,
      service_type: 'cleaning',
      scheduled_date: targetDate,
      scheduled_time: '10:00',
      status: 'scheduled',
      notes: `Reinigung nach ${trigger === 'checkout' ? 'Abreise' : 'Ankunft'} von ${booking.guest_name}`
    });

    createdDetails.push({
      house_name: booking.houses?.name,
      guest_name: booking.guest_name,
      date: targetDate
    });
  }

  if (tasksToCreate.length > 0) {
    const { error: insertError } = await supabase
      .from('service_tasks')
      .insert(tasksToCreate);

    if (insertError) {
      return { success: false, error: insertError.message };
    }
  }

  if (createdDetails.length > 0) {
    await logMaxAction({
      action_type: 'create_bulk_cleaning_tasks',
      status: 'wartet_uli',
      waiting_for: 'uli',
      last_step: `${createdDetails.length} Reinigung(en) angelegt`,
      details: { created: createdDetails, target_date: targetDate, trigger },
      created_by: 'uli',
    });
  }

  return {
    success: true,
    created: createdDetails.length,
    created_details: createdDetails,
    skipped: skippedDetails.length,
    skipped_details: skippedDetails,
    target_date: targetDate,
    trigger
  };
}

async function executeCreateBulkLinenOrders(params: any) {
  console.log('Executing create_bulk_linen_orders with params:', params);

  const { date_from, date_to, house_id } = params;

  // Find bookings in date range that don't have linen orders
  let query = supabase
    .from('bookings')
    .select('id, guest_name, house_id, number_of_guests, check_in, check_out, houses(name)')
    .neq('status', 'cancelled')
    .gte('check_in', date_from)
    .lte('check_in', date_to);

  if (house_id) {
    query = query.eq('house_id', house_id);
  }

  const { data: bookings, error } = await query;

  if (error) {
    return { success: false, error: error.message };
  }

  if (!bookings || bookings.length === 0) {
    return { success: true, created: 0, message: 'Keine Buchungen im Zeitraum gefunden' };
  }

  // Check for existing orders
  const bookingIds = bookings.map(b => b.id);
  const { data: existingOrders } = await supabase
    .from('linen_orders')
    .select('booking_id')
    .in('booking_id', bookingIds);

  const existingBookingIds = new Set(existingOrders?.map(o => o.booking_id) || []);

  const ordersCreated = [];
  let totalCost = 0;

  for (const booking of bookings) {
    if (existingBookingIds.has(booking.id)) continue;

    // Get linen set definitions
    const { data: linenDef } = await supabase
      .from('linen_set_definitions')
      .select('*')
      .eq('house_id', booking.house_id)
      .single();

    if (!linenDef) continue;

    const guests = booking.number_of_guests || 2;
    const items = {
      bedding: guests * (linenDef.bedding_per_guest || 1),
      large_towels: guests * (linenDef.large_towels_per_guest || 1),
      small_towels: guests * (linenDef.small_towels_per_guest || 1),
      sauna_towels: guests * (linenDef.sauna_towels_per_guest || 0),
      bath_mats: linenDef.bath_mats_per_booking || 2,
      sink_towels: linenDef.sink_towels_per_booking || 2,
      kitchen_towels: linenDef.kitchen_towels_per_booking || 2
    };

    // Get prices
    const { data: settings } = await supabase
      .from('ai_linen_settings')
      .select('prices')
      .eq('house_id', booking.house_id)
      .single();

    const prices = settings?.prices || { bedding: 30, large_towels: 18, small_towels: 10, sauna_towels: 20, bath_mats: 15, sink_towels: 8, kitchen_towels: 5 };

    let orderTotal = 0;
    for (const [key, qty] of Object.entries(items)) {
      orderTotal += (qty as number) * (prices[key] || 0);
    }

    const { error: orderError } = await supabase
      .from('linen_orders')
      .insert({
        house_id: booking.house_id,
        booking_id: booking.id,
        order_date: new Date().toISOString().split('T')[0],
        delivery_date: booking.check_in.split('T')[0],
        status: 'offen',
        items,
        total_cost: orderTotal
      });

    if (!orderError) {
      ordersCreated.push({
        house_name: booking.houses?.name,
        guest_name: booking.guest_name,
        cost: orderTotal
      });
      totalCost += orderTotal;
    }
  }

  if (ordersCreated.length > 0) {
    await logMaxAction({
      action_type: 'create_bulk_linen_orders',
      status: 'wartet_uli',
      waiting_for: 'uli',
      last_step: `${ordersCreated.length} Wäschebestellung(en) angelegt`,
      details: { created: ordersCreated, total_cost: totalCost },
      created_by: 'uli',
    });
  }

  return {
    success: true,
    created: ordersCreated.length,
    created_details: ordersCreated,
    total_cost: totalCost,
    skipped: bookings.length - ordersCreated.length
  };
}

// Enhanced search_bookings with new parameters
async function executeSearchBookings(params: any) {
  console.log('Executing search_bookings with params:', params);

  let query = supabase
    .from('bookings')
    .select('*, houses(name, rental_type)')
    .order('check_in', { ascending: true });

  // Filter for tourist rentals only
  query = query.eq('houses.rental_type', 'tourist');

  // Guest name search
  if (params.guest_name) {
    query = query.ilike('guest_name', `%${params.guest_name}%`);
  }

  // Status filter
  if (params.status) {
    query = query.eq('status', params.status);
  }

  // Exclude cancelled (default: true)
  if (params.exclude_cancelled !== false && !params.status) {
    query = query.neq('status', 'cancelled');
  }

  // House filter
  if (params.house_id) {
    query = query.eq('house_id', params.house_id);
  }

  // Has children filter (CRITICAL!)
  if (params.has_children === true) {
    query = query.gt('number_of_children', 0);
  }

  // Date range filters (overlap detection)
  if (params.date_from && params.date_to) {
    query = query
      .lte('check_in', params.date_to)
      .gte('check_out', params.date_from);
  } else if (params.date_from) {
    query = query.gte('check_in', params.date_from);
  } else if (params.date_to) {
    query = query.lte('check_out', params.date_to);
  }

  // Exact check-in date (NEW!)
  if (params.check_in_date) {
    query = query
      .gte('check_in', `${params.check_in_date}T00:00:00`)
      .lt('check_in', `${params.check_in_date}T23:59:59`);
  }

  // Exact check-out date (NEW!)
  if (params.check_out_date) {
    query = query
      .gte('check_out', `${params.check_out_date}T00:00:00`)
      .lt('check_out', `${params.check_out_date}T23:59:59`);
  }

  // Upcoming only (NEW!)
  if (params.upcoming_only) {
    const today = new Date().toISOString().split('T')[0];
    query = query.gte('check_in', today);
  }

  // Updated timestamp filters
  if (params.updated_from) {
    query = query.gte('updated_at', params.updated_from);
  }
  if (params.updated_to) {
    query = query.lte('updated_at', params.updated_to);
  }

  const limit = params.limit || 20;
  const { data, error } = await query.limit(limit);

  if (error) {
    console.error('Error searching bookings:', error);
    return { success: false, error: error.message };
  }

  // Filter out bookings where house is null (not tourist rental)
  const filteredData = data?.filter(b => b.houses !== null) || [];

  console.log(`Found ${filteredData.length} bookings`);
  return { success: true, data: filteredData, count: filteredData.length };
}

async function executeSearchCleaningTasks(params: any) {
  console.log('Executing search_cleaning_tasks with params:', params);

  // ===========================================================================
  // REIHENFOLGE IST ENTSCHEIDEND — Fehler behoben 14.07.2026
  //
  // Früher wurde der Gastname ERST NACH `.limit(20)` in JavaScript gefiltert:
  // Die DB lieferte die 20 ÄLTESTEN Reinigungen (aufsteigend sortiert, ohne
  // Datumsfilter) — und erst danach wurde nach dem Namen gesucht.
  //
  // Belegt an echten Daten: Lucas Reinigung stand auf POSITION 45. Sie fiel aus
  // den ersten 20 heraus, BEVOR gefiltert wurde. Max meldete daraufhin
  // "Es gibt keine Reinigung für Luca in meinen Aufzeichnungen" — obwohl sie
  // existierte (Venediger Chalet, 16.08.2026, scheduled).
  //
  // Alles ab Position 21 war für Max unsichtbar.
  //
  // Jetzt filtert die DATENBANK — so wie search_bookings es immer richtig machte.
  // Der Gastname liegt in der verknüpften Tabelle `bookings`, deshalb `!inner`:
  // nur mit einem Inner-Join lässt sich in Supabase auf ein Feld der Relation
  // filtern.
  // ===========================================================================
  const nachGast = typeof params.guest_name === 'string' && params.guest_name.trim() !== '';

  let query = supabase
    .from('service_tasks')
    .select(`
      *,
      houses(name),
      bookings${nachGast ? '!inner' : ''}(guest_name, guest_email, guest_phone),
      service_providers!service_tasks_provider_id_fkey(id, name, contact_email, contact_phone)
    `)
    .eq('service_type', 'cleaning')
    .order('scheduled_date', { ascending: true });

  // Gastname direkt in der DB filtern — nicht erst nach dem Limit.
  if (nachGast) {
    query = query.ilike('bookings.guest_name', `%${params.guest_name.trim()}%`);
  }

  if (params.status) {
    query = query.eq('status', params.status);
  }
  if (params.house_id) {
    query = query.eq('house_id', params.house_id);
  }
  if (params.date_from) {
    query = query.gte('scheduled_date', params.date_from);
  }
  if (params.date_to) {
    query = query.lte('scheduled_date', params.date_to);
  }
  if (params.payment_status) {
    query = query.eq('payment_status', params.payment_status);
  }

  const { data, error } = await query.limit(params.limit || 20);

  if (error) {
    console.error('Error searching cleaning tasks:', error);
    return { success: false, error: error.message };
  }

  // Provider-Name liegt ebenfalls in einer Relation. Er wird selten genutzt und
  // ist unkritisch (es gibt nur wenige Provider), deshalb bleibt dieser Filter
  // in JS.
  let filteredData = data || [];
  if (params.provider_name) {
    filteredData = filteredData.filter(t =>
      t.service_providers?.name?.toLowerCase().includes(params.provider_name.toLowerCase())
    );
  }

  return { success: true, data: filteredData, count: filteredData.length };
}

async function executeSearchHouses(params: any) {
  console.log('Executing search_houses with params:', params);

  let query = supabase
    .from('houses')
    .select('*')
    .eq('rental_type', 'tourist')
    .order('name');

  if (params.name) {
    query = query.ilike('name', `%${params.name}%`);
  }
  if (params.address) {
    query = query.ilike('address', `%${params.address}%`);
  }

  const { data, error } = await query.limit(params.limit || 20);

  if (error) {
    console.error('Error searching houses:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data, count: data?.length || 0 };
}

async function executeSearchGuests(params: any) {
  console.log('Executing search_guests with params:', params);

  let query = supabase
    .from('bookings')
    .select('guest_name, guest_email, guest_phone, nationality, houses(name)')
    .order('created_at', { ascending: false });

  if (params.name) {
    query = query.ilike('guest_name', `%${params.name}%`);
  }
  if (params.email) {
    query = query.ilike('guest_email', `%${params.email}%`);
  }
  if (params.nationality) {
    query = query.ilike('nationality', `%${params.nationality}%`);
  }

  const { data, error } = await query.limit(100);

  if (error) {
    console.error('Error searching guests:', error);
    return { success: false, error: error.message };
  }

  // Group by email to get unique guests with booking counts
  const guestMap = new Map();
  for (const b of data || []) {
    const key = b.guest_email || b.guest_name;
    if (!guestMap.has(key)) {
      guestMap.set(key, {
        guest_name: b.guest_name,
        guest_email: b.guest_email,
        guest_phone: b.guest_phone,
        nationality: b.nationality,
        booking_count: 1
      });
    } else {
      guestMap.get(key).booking_count++;
    }
  }

  const guests = Array.from(guestMap.values()).slice(0, params.limit || 20);
  return { success: true, data: guests, count: guests.length };
}

async function executeGetDashboardStats(params: any) {
  console.log('Executing get_dashboard_stats');

  const today = new Date().toISOString().split('T')[0];

  // Count houses
  const { count: houseCount } = await supabase
    .from('houses')
    .select('*', { count: 'exact', head: true })
    .eq('rental_type', 'tourist');

  // Count active bookings
  const { count: activeBookings } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .gte('check_out', today)
    .neq('status', 'cancelled');

  // Count pending tasks
  const { count: pendingTasks } = await supabase
    .from('service_tasks')
    .select('*', { count: 'exact', head: true })
    .in('status', ['scheduled', 'in_progress']);

  // Count pending inquiries
  const { count: pendingInquiries } = await supabase
    .from('booking_inquiries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  // Calculate revenue this month
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const { data: revenueData } = await supabase
    .from('bookings')
    .select('booking_amount')
    .gte('check_in', firstOfMonth.toISOString())
    .neq('status', 'cancelled');

  const monthlyRevenue = revenueData?.reduce((sum, b) => sum + (b.booking_amount || 0), 0) || 0;

  return {
    success: true,
    data: {
      houses: houseCount || 0,
      active_bookings: activeBookings || 0,
      pending_tasks: pendingTasks || 0,
      pending_inquiries: pendingInquiries || 0,
      monthly_revenue: monthlyRevenue
    }
  };
}

async function executeGetLinenOverview(params: any) {
  console.log('Executing get_linen_overview');

  const { data: houses, error } = await supabase
    .from('houses')
    .select('id, name, linen_stock')
    .eq('rental_type', 'tourist');

  if (error) {
    return { success: false, error: error.message };
  }

  const overview = houses?.map(h => ({
    house_name: h.name,
    house_id: h.id,
    stock: h.linen_stock || {},
    status: 'ok' // Could be enhanced with actual status calculation
  })) || [];

  return { success: true, data: overview };
}

async function executeSearchLinenOrders(params: any) {
  console.log('Executing search_linen_orders with params:', params);

  // Gleicher Fehler wie in search_cleaning_tasks — behoben 14.07.2026.
  // Der Gastname wurde ERST NACH `.limit(50)` in JavaScript gefiltert. Lag die
  // gesuchte Bestellung außerhalb der 50 zuletzt bestellten, fand Max sie nie.
  //
  // Der alte Kommentar an dieser Stelle lautete wörtlich:
  //   "Gastname-Filter über die verknüpfte Buchung (post-query, wie bei
  //    search_cleaning_tasks)"
  // Der Fehler wurde also bewusst vom kaputten Zwilling abgeschrieben. Ein
  // Doppelgänger im Wortsinn. Beide sind jetzt korrekt.
  const nachGast = typeof params.guest_name === 'string' && params.guest_name.trim() !== '';

  let query = supabase
    .from('linen_orders')
    .select(`*, houses(name), bookings${nachGast ? '!inner' : ''}(guest_name, check_in, check_out)`)
    .order('order_date', { ascending: false });

  // Gastname direkt in der DB filtern (der !inner-Join oben macht das möglich).
  if (nachGast) {
    query = query.ilike('bookings.guest_name', `%${params.guest_name.trim()}%`);
  }

  if (params.status) {
    query = query.eq('status', params.status);
  }
  if (params.house_id) {
    query = query.eq('house_id', params.house_id);
  }
  if (params.date_from) {
    query = query.gte('delivery_date', params.date_from);
  }
  if (params.date_to) {
    query = query.lte('delivery_date', params.date_to);
  }

  const { data, error } = await query.limit(params.limit || 50);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data || [], count: (data || []).length };
}

/**
 * ZENTRALES VERKNÜPFUNGS-TOOL
 * Beantwortet "Zeig mir alles zu Gast X / Buchung Y" in EINEM Aufruf:
 * Buchung -> Reinigung (service_tasks) + Wäsche (linen_orders) + Kosten (booking_charges)
 * + Zahlung (payments) + Vorlieben (guest_preferences) + Rebooking-Tracking.
 * Nimmt guest_name ODER booking_id. Das Modell muss NICHT mehrstufig verketten.
 */
async function executeGetBookingFullContext(params: any) {
  console.log('Executing get_booking_full_context with params:', params);

  // 1) Buchung(en) finden
  let bookingQuery = supabase
    .from('bookings')
    .select('*, houses(name)')
    .order('check_in', { ascending: false });

  if (params.booking_id) {
    bookingQuery = bookingQuery.eq('id', params.booking_id);
  } else if (params.guest_name) {
    bookingQuery = bookingQuery.ilike('guest_name', `%${params.guest_name}%`);
  } else {
    return { success: false, error: 'guest_name oder booking_id erforderlich' };
  }

  // Standardmäßig stornierte ausblenden, außer explizit gewünscht
  if (params.include_cancelled !== true) {
    bookingQuery = bookingQuery.neq('status', 'cancelled');
  }

  const { data: bookings, error: bookingErr } = await bookingQuery.limit(params.limit || 5);
  if (bookingErr) return { success: false, error: bookingErr.message };
  if (!bookings || bookings.length === 0) {
    return { success: true, data: [], count: 0, message: 'Keine passende Buchung gefunden.' };
  }

  // 2) Für jede Buchung den verknüpften Kontext laden
  const results = [];
  for (const b of bookings) {
    const [cleanings, linen, charges, prefs, tracking] = await Promise.all([
      supabase.from('service_tasks')
        .select('id, service_type, status, scheduled_date, scheduled_time, completed_at, notes, service_providers!service_tasks_provider_id_fkey(name)')
        .eq('booking_id', b.id).eq('service_type', 'cleaning')
        .order('scheduled_date', { ascending: true }),
      supabase.from('linen_orders')
        .select('id, status, order_date, delivery_date, delivery_time, total_items, total_cost, notes')
        .eq('booking_id', b.id)
        .order('delivery_date', { ascending: true }),
      supabase.from('booking_charges')
        .select('id, charge_type, description, amount, currency, status, payment_id')
        .eq('booking_id', b.id),
      supabase.from('guest_preferences')
        .select('activity_level, budget_range, group_type, preferred_categories')
        .eq('booking_id', b.id).maybeSingle(),
      supabase.from('booking_action_tracking')
        .select('action_id, action_applied, applied_at')
        .eq('booking_id', b.id),
    ]);

    // Zahlungen zu den Forderungen (falls vorhanden)
    let payments: any[] = [];
    const chargeIds = (charges.data || []).map((c: any) => c.id);
    if (chargeIds.length > 0) {
      const { data: pay } = await supabase
        .from('payments')
        .select('id, amount, currency, status, purpose, paid_at, booking_charge_id')
        .eq('booking_id', b.id);
      payments = pay || [];
    }

    // Wäsche-Status klar interpretieren (für die Kernfrage "schon geliefert?")
    const linenOrders = (linen.data || []).map((lo: any) => ({
      ...lo,
      _geliefert: lo.status === 'delivered',
      _status_klartext:
        lo.status === 'delivered' ? 'geliefert'
        : (lo.status === 'offen' || lo.status === 'ausstehend' || lo.status === 'bestellt') ? 'noch nicht geliefert'
        : lo.status === 'cancelled' ? 'storniert'
        : (lo.status || 'unbekannt'),
    }));

    // Koordination Reinigung <-> Wäsche: kommt die Wäsche VOR dem Reinigungstag?
    const cleaningDates = (cleanings.data || []).map((c: any) => c.scheduled_date).filter(Boolean).sort();
    const firstCleaning = cleaningDates[0] || null;
    const linenTimingWarnings = linenOrders
      .filter((lo: any) => lo.delivery_date && firstCleaning && lo.delivery_date > firstCleaning)
      .map((lo: any) => `Wäsche-Lieferung (${lo.delivery_date}) liegt NACH der Reinigung (${firstCleaning})`);

    results.push({
      booking: {
        id: b.id,
        guest_name: b.guest_name,
        guest_email: b.guest_email,
        house: b.houses?.name || null,
        check_in: b.check_in,
        check_out: b.check_out,
        number_of_guests: b.number_of_guests,
        booked_guests: b.booked_guests,
        guest_surcharge_amount: b.guest_surcharge_amount,
        status: b.status,
        payment_status: b.payment_status,
      },
      cleanings: cleanings.data || [],
      linen_orders: linenOrders,
      charges: charges.data || [],
      payments,
      preferences: prefs.data || null,
      rebooking_tracking: tracking.data || [],
      koordination: {
        erster_reinigungstag: firstCleaning,
        warnungen: linenTimingWarnings,
      },
    });
  }

  return { success: true, data: results, count: results.length };
}

async function executeGetRevenueStats(params: any) {
  console.log('Executing get_revenue_stats with params:', params);

  const now = new Date();
  const currentYear = now.getFullYear();

  let startDate: string;
  let endDate: string;
  let periodLabel: string;

  if (params.year && params.month) {
    // Spezifischer Monat: z.B. März 2026
    const year = params.year;
    const month = params.month;
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    periodLabel = `${monthNames[month - 1]} ${year}`;
  } else if (params.quarter && params.year) {
    // Quartal
    const quarterStarts: Record<number, string> = { 1: '01-01', 2: '04-01', 3: '07-01', 4: '10-01' };
    const quarterEnds: Record<number, string> = { 1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31' };
    startDate = `${params.year}-${quarterStarts[params.quarter]}`;
    endDate = `${params.year}-${quarterEnds[params.quarter]}`;
    periodLabel = `Q${params.quarter} ${params.year}`;
  } else if (params.year) {
    // Ganzes Jahr
    startDate = `${params.year}-01-01`;
    endDate = `${params.year}-12-31`;
    periodLabel = `Jahr ${params.year}`;
  } else if (params.date_from && params.date_to) {
    // Benutzerdefinierter Zeitraum
    startDate = params.date_from;
    endDate = params.date_to;
    periodLabel = `${params.date_from} bis ${params.date_to}`;
  } else {
    // Standard: Aktuelles Jahr
    startDate = `${currentYear}-01-01`;
    endDate = `${currentYear}-12-31`;
    periodLabel = `Jahr ${currentYear}`;
  }

  // Buchungen im Zeitraum abrufen (nur Tourist-Häuser)
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('booking_amount, status, payment_status, houses!inner(rental_type, name)')
    .gte('check_in', startDate)
    .lte('check_in', endDate + 'T23:59:59')
    .neq('status', 'cancelled')
    .eq('houses.rental_type', 'tourist');

  if (error) {
    console.error('Error fetching revenue:', error);
    return { success: false, error: error.message };
  }

  // Berechnungen
  const totalRevenue = bookings?.reduce((sum, b) => sum + (b.booking_amount || 0), 0) || 0;
  const paidRevenue = bookings?.filter(b => b.payment_status === 'paid')
    .reduce((sum, b) => sum + (b.booking_amount || 0), 0) || 0;
  const openRevenue = totalRevenue - paidRevenue;
  const bookingCount = bookings?.length || 0;

  // Umsatz pro Haus
  const revenueByHouse: Record<string, number> = {};
  bookings?.forEach(b => {
    const houseName = (b.houses as any)?.name || 'Unbekannt';
    revenueByHouse[houseName] = (revenueByHouse[houseName] || 0) + (b.booking_amount || 0);
  });

  return {
    success: true,
    data: {
      period: periodLabel,
      date_range: { from: startDate, to: endDate },
      total_revenue: totalRevenue,
      paid_revenue: paidRevenue,
      open_revenue: openRevenue,
      booking_count: bookingCount,
      revenue_by_house: revenueByHouse
    }
  };
}

async function executeGetDailyOverview(params: any) {
  console.log('Executing get_daily_overview with params:', params);

  const targetDate = params.date || new Date().toISOString().split('T')[0];

  // 1. Reinigungen heute
  const { data: cleanings, error: cleaningError } = await supabase
    .from('service_tasks')
    .select(`
      id, scheduled_date, scheduled_time, status, notes,
      houses(name),
      bookings(guest_name, guest_email),
      service_providers!service_tasks_provider_id_fkey(name)
    `)
    .eq('service_type', 'cleaning')
    .eq('scheduled_date', targetDate)
    .neq('status', 'cancelled')
    .order('scheduled_time', { ascending: true });

  if (cleaningError) {
    console.error('Error fetching cleanings:', cleaningError);
  }

  // 2. Check-ins heute (neue Gäste)
  const { data: checkIns, error: checkInError } = await supabase
    .from('bookings')
    .select('id, guest_name, check_in, number_of_guests, number_of_adults, number_of_children, houses(name)')
    .gte('check_in', `${targetDate}T00:00:00`)
    .lt('check_in', `${targetDate}T23:59:59`)
    .neq('status', 'cancelled')
    .order('check_in', { ascending: true });

  if (checkInError) {
    console.error('Error fetching check-ins:', checkInError);
  }

  // 3. Check-outs heute (abreisende Gäste)
  const { data: checkOuts, error: checkOutError } = await supabase
    .from('bookings')
    .select('id, guest_name, check_out, houses(name)')
    .gte('check_out', `${targetDate}T00:00:00`)
    .lt('check_out', `${targetDate}T23:59:59`)
    .neq('status', 'cancelled')
    .order('check_out', { ascending: true });

  if (checkOutError) {
    console.error('Error fetching check-outs:', checkOutError);
  }

  // 4. Gästewechsel identifizieren (Check-out + Check-in am selben Haus)
  const guestChanges: any[] = [];
  if (checkOuts && checkIns) {
    for (const co of checkOuts) {
      const matchingCheckIn = checkIns.find(ci => ci.houses?.name === co.houses?.name);
      if (matchingCheckIn) {
        guestChanges.push({
          house_name: co.houses?.name,
          departing_guest: co.guest_name,
          arriving_guest: matchingCheckIn.guest_name,
          arriving_guests_count: matchingCheckIn.number_of_guests
        });
      }
    }
  }

  // 5. Wäsche-Lieferungen an diesem Tag (fehlte bisher!)
  const { data: linenDeliveries, error: linenError } = await supabase
    .from('linen_orders')
    .select('id, status, delivery_date, delivery_time, total_items, houses(name), bookings(guest_name)')
    .gte('delivery_date', `${targetDate}T00:00:00`)
    .lt('delivery_date', `${targetDate}T23:59:59`)
    .order('delivery_time', { ascending: true });

  if (linenError) {
    console.error('Error fetching linen deliveries:', linenError);
  }

  return {
    success: true,
    data: {
      date: targetDate,
      cleanings: cleanings || [],
      check_ins: checkIns || [],
      check_outs: checkOuts || [],
      linen_deliveries: linenDeliveries || [],
      guest_changes: guestChanges,
      summary: {
        cleaning_count: cleanings?.length || 0,
        check_in_count: checkIns?.length || 0,
        check_out_count: checkOuts?.length || 0,
        linen_delivery_count: linenDeliveries?.length || 0,
        guest_change_count: guestChanges.length
      }
    }
  };
}

async function executeSaveKnowledge(params: any) {
  console.log('Executing save_knowledge:', params);

  const term = (params.term || '').trim();
  const meaning = (params.meaning || '').trim();
  const category = (params.category || 'sonstiges').trim();

  if (!term || !meaning) {
    return { success: false, error: 'term und meaning sind erforderlich.' };
  }

  // Gibt es den Begriff schon aktiv? Dann aktualisieren statt doppelt anlegen.
  try {
    const { data: existing } = await supabase
      .from('assistant_knowledge')
      .select('id')
      .eq('is_active', true)
      .ilike('term', term)
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabase
        .from('assistant_knowledge')
        .update({ meaning, category })
        .eq('id', existing.id);
      if (updErr) return { success: false, error: updErr.message };
      return {
        success: true,
        aktualisiert: true,
        gespeichert: { term, meaning, category },
        hinweis: `Wissen aktualisiert: "${term}" bedeutet jetzt "${meaning}".`,
      };
    }

    const { error: insErr } = await supabase
      .from('assistant_knowledge')
      .insert({ term, meaning, category, created_by: 'max' });
    if (insErr) return { success: false, error: insErr.message };

    return {
      success: true,
      aktualisiert: false,
      gespeichert: { term, meaning, category },
      hinweis: `Gespeichert: "${term}" bedeutet "${meaning}". Ab jetzt weiß ich das.`,
    };
  } catch (e) {
    console.error('Exception save_knowledge:', e);
    return { success: false, error: 'Wissen konnte nicht gespeichert werden.' };
  }
}

async function executeGetMorningSummary(params: any) {
  console.log('Executing get_morning_summary');

  // Ruft die Edge Function morning-summary im ABRUF-Modus auf (deliver=false).
  // So bleibt die Sammel-/Formatier-Logik an EINER Stelle (keine Doppellogik).
  try {
    const { data, error } = await supabase.functions.invoke('morning-summary', {
      body: { deliver: false },
    });

    if (error) {
      console.error('Error get_morning_summary:', error);
      return { success: false, error: 'Morgen-Übersicht konnte nicht geladen werden.' };
    }

    return {
      success: true,
      summary: data?.summary_markdown ?? '',
      hasData: data?.hasData ?? false,
      sections: data?.sections ?? null,
    };
  } catch (e) {
    console.error('Exception get_morning_summary:', e);
    return { success: false, error: 'Morgen-Übersicht konnte nicht geladen werden.' };
  }
}

async function executeGetCalendarEvents(params: any) {
  console.log('Executing get_calendar_events with params:', params);

  const dateFrom = params.date_from || new Date().toISOString().split('T')[0];
  const dateTo = params.date_to || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  })();

  // Get check-ins
  const { data: checkIns } = await supabase
    .from('bookings')
    .select('id, guest_name, check_in, houses(name)')
    .gte('check_in', dateFrom)
    .lte('check_in', dateTo)
    .neq('status', 'cancelled');

  // Get check-outs
  const { data: checkOuts } = await supabase
    .from('bookings')
    .select('id, guest_name, check_out, houses(name)')
    .gte('check_out', dateFrom)
    .lte('check_out', dateTo)
    .neq('status', 'cancelled');

  // Get cleanings
  const { data: cleanings } = await supabase
    .from('service_tasks')
    .select('id, scheduled_date, scheduled_time, houses(name), status')
    .eq('service_type', 'cleaning')
    .gte('scheduled_date', dateFrom)
    .lte('scheduled_date', dateTo);

  return {
    success: true,
    data: {
      check_ins: checkIns || [],
      check_outs: checkOuts || [],
      cleanings: cleanings || [],
      date_range: { from: dateFrom, to: dateTo }
    }
  };
}

// ==================== MORGEN-ÜBERSICHT: GÄSTEKONTAKT ====================
// Nächste anreisende Gäste, die vor der Anreise kontaktiert werden sollen.
// Gespiegelt von src/hooks/useGuestContactReminders.ts (5–10 Tage vor Check-in).
async function executeGetGuestContactReminders(_params: any) {
  console.log('Executing get_guest_contact_reminders');

  const now = new Date();
  const fiveDaysFromNow = new Date(now);
  fiveDaysFromNow.setDate(now.getDate() + 5);
  const tenDaysFromNow = new Date(now);
  tenDaysFromNow.setDate(now.getDate() + 10);

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, guest_name, guest_email, guest_phone, check_in, check_out,
      number_of_guests, number_of_children, guest_contact_status, nationality,
      houses(name, rental_type)
    `)
    .gte('check_in', fiveDaysFromNow.toISOString())
    .lte('check_in', tenDaysFromNow.toISOString())
    .eq('guest_contact_status', 'pending')
    .eq('status', 'confirmed')
    .eq('houses.rental_type', 'tourist')
    .order('check_in', { ascending: true });

  if (error) {
    console.error('Error get_guest_contact_reminders:', error);
    return { success: false, error: error.message };
  }

  // Nur Tourist-Häuser (houses !== null nach dem eq-Filter)
  const filtered = (data || []).filter((b: any) => b.houses !== null);
  const msPerDay = 1000 * 60 * 60 * 24;

  const result = filtered.map((b: any) => {
    const daysUntil = Math.ceil(
      (new Date(b.check_in).getTime() - now.getTime()) / msPerDay
    );
    return {
      booking_id: b.id,
      guest_name: b.guest_name,
      guest_email: b.guest_email || null,
      has_email: !!b.guest_email,
      guest_phone: b.guest_phone || null,
      house: b.houses?.name || null,
      check_in: b.check_in,
      days_until_check_in: daysUntil,
      number_of_guests: b.number_of_guests,
      is_family: (b.number_of_children || 0) > 0,
      nationality: b.nationality || null,
    };
  });

  return { success: true, data: result, count: result.length };
}

// ==================== MORGEN-ÜBERSICHT: BEWERTUNGEN NACHTRAGEN ====================
// Abgereiste Gäste im Einstellungs-Zeitfenster, bei denen noch keine Bewertung
// hinterlegt ist. REINE ERINNERUNG — trägt nichts ein, sendet nichts.
// Einstellungen gespiegelt von system_settings key 'rating_reminder_settings'.
async function executeGetRatingReminders(_params: any) {
  console.log('Executing get_rating_reminders');

  const RATING_DEFAULTS = {
    is_enabled: true,
    min_days_after_checkout: 14,
    max_days_after_checkout: 90,
    require_platform: true,
    rental_type_filter: 'tourist',
  };

  const { data: settingRow } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'rating_reminder_settings')
    .maybeSingle();

  const s = { ...RATING_DEFAULTS, ...((settingRow?.value as any) || {}) };

  if (!s.is_enabled) {
    return {
      success: true,
      enabled: false,
      data: [],
      count: 0,
      message: 'Bewertungs-Erinnerungen sind in den Einstellungen deaktiviert.',
    };
  }

  const now = new Date();
  const minCheckout = new Date(now);
  minCheckout.setDate(now.getDate() - s.max_days_after_checkout);
  const maxCheckout = new Date(now);
  maxCheckout.setDate(now.getDate() - s.min_days_after_checkout);

  let query = supabase
    .from('bookings')
    .select('id, guest_name, check_out, platform, external_rating, houses(name, rental_type)')
    .eq('status', 'completed')
    .gte('check_out', minCheckout.toISOString())
    .lte('check_out', maxCheckout.toISOString())
    .is('external_rating', null);

  if (s.rental_type_filter !== 'all') {
    query = query.eq('houses.rental_type', s.rental_type_filter);
  }
  if (s.require_platform) {
    query = query.not('platform', 'is', null);
  }

  const { data, error } = await query
    .order('check_out', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error get_rating_reminders:', error);
    return { success: false, error: error.message };
  }

  const filtered = (data || []).filter((b: any) => b.houses !== null);
  const msPerDay = 1000 * 60 * 60 * 24;

  const result = filtered.map((b: any) => ({
    booking_id: b.id,
    guest_name: b.guest_name,
    house: b.houses?.name || null,
    check_out: b.check_out,
    platform: b.platform || null,
    days_since_check_out: Math.floor(
      (now.getTime() - new Date(b.check_out).getTime()) / msPerDay
    ),
  }));

  return { success: true, enabled: true, data: result, count: result.length };
}

// ==================== BEGRÜSSUNGS-E-MAIL (Entwurf zur Freigabe) ====================
// Baut aus einer vorhandenen Vorlage (email_templates, DE/EN) einen fertigen
// Begrüßungs-E-Mail-Entwurf für einen Gast und gibt ihn zurück. Es wird NICHTS
// gesendet — der Entwurf wird im Chat als Button angeboten, der das Vorschaufenster
// ("Per Gmail senden") vorausgefüllt öffnet. Uli prüft Betreff/Text und sendet dort.
async function executeDraftGuestWelcomeEmail(params: any) {
  console.log('Executing draft_guest_welcome_email:', params);
  const lang = params?.language === 'en' ? 'en' : 'de';

  // 1) Buchung ermitteln — per booking_id ODER per guest_name (automatische Auswahl).
  let booking: any = null;
  if (params?.booking_id) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, guest_name, guest_email, check_in, check_out, nationality, houses(name)')
      .eq('id', params.booking_id)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    booking = data;
  } else if (params?.guest_name) {
    const todayStr = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('bookings')
      .select('id, guest_name, guest_email, check_in, check_out, nationality, status, houses(name)')
      .ilike('guest_name', `%${params.guest_name}%`)
      .neq('status', 'cancelled')
      .order('check_in', { ascending: true });
    if (error) return { success: false, error: error.message };
    const list = data || [];
    // Bevorzugt: KOMMENDE Buchung (check_in >= heute) MIT E-Mail-Adresse; sonst
    // irgendeine mit E-Mail; sonst die erste.
    booking =
      list.find((b: any) => b.guest_email && String(b.check_in || '').split('T')[0] >= todayStr) ||
      list.find((b: any) => b.guest_email) ||
      list[0] || null;
  } else {
    return { success: false, error: 'booking_id oder guest_name erforderlich' };
  }

  if (!booking) return { success: false, error: 'Keine passende Buchung gefunden' };
  if (!booking.guest_email) {
    return { success: false, error: `Für ${booking.guest_name || 'diesen Gast'} ist keine E-Mail-Adresse hinterlegt. Es reicht die telefonische Erinnerung.` };
  }

  // 2) Passende Begrüßungs-/Anreise-Vorlage in der gewählten Sprache suchen
  const { data: templates } = await supabase
    .from('email_templates')
    .select('template_key, name, subject, content, language')
    .eq('language', lang);

  const welcomeRegex = /(willkommen|welcome|anreise|begrue|begrüß|vorab|arrival|pre.?arrival)/i;
  const tpl = (templates || []).find((t: any) =>
    welcomeRegex.test(t.template_key || '') || welcomeRegex.test(t.name || '')
  ) || null;

  // 3) Betreff + Text bestimmen (Vorlage oder eingebauter Standard)
  const houseName = (booking as any).houses?.name || '';
  let subject: string;
  let body: string;
  let templateUsed: string;

  if (tpl) {
    subject = tpl.subject || '';
    body = tpl.content || '';
    templateUsed = tpl.template_key;
  } else {
    templateUsed = lang === 'en' ? 'built-in-en' : 'built-in-de';
    if (lang === 'en') {
      subject = 'Welcome to Steinbock Chalets, {guestName}';
      body = 'Dear {guestName},\n\nWe are looking forward to welcoming you at {houseName} on {checkIn}.\nIf you have any questions before your arrival, simply reply to this email.\n\nKind regards,\nUli – Steinbock Chalets';
    } else {
      subject = 'Willkommen bei Steinbock Chalets, {guestName}';
      body = 'Liebe/r {guestName},\n\nwir freuen uns auf Ihre Anreise am {checkIn} im {houseName}.\nFalls Sie vor der Anreise Fragen haben, antworten Sie einfach auf diese E-Mail.\n\nHerzliche Grüße\nUli – Steinbock Chalets';
    }
  }

  // 4) Platzhalter füllen (gespiegelt von src/lib/emailPlaceholders / send-guest-email)
  const checkInDE = booking.check_in ? formatDateDE((booking.check_in as string).split('T')[0]) : '';
  const checkOutDE = booking.check_out ? formatDateDE((booking.check_out as string).split('T')[0]) : '';
  const fill = (text: string) => (text || '')
    .replace(/\{guestName\}/gi, booking.guest_name || 'Gast')
    .replace(/\{guest_name\}/gi, booking.guest_name || 'Gast')
    .replace(/\{checkIn\}/gi, checkInDE)
    .replace(/\{check_in\}/gi, checkInDE)
    .replace(/\{checkOut\}/gi, checkOutDE)
    .replace(/\{check_out\}/gi, checkOutDE)
    .replace(/\{houseName\}/gi, houseName)
    .replace(/\{house_name\}/gi, houseName);

  return {
    success: true,
    draft: {
      booking_id: booking.id,
      to: booking.guest_email,
      guest_name: booking.guest_name,
      subject: fill(subject),
      body: fill(body),
      language: lang,
      house: houseName,
      check_in: checkInDE,
      check_out: checkOutDE,
      template_used: templateUsed,
    },
    hinweis: `Begrüßungs-E-Mail (${lang.toUpperCase()}) für ${booking.guest_name} vorbereitet. Es wurde NICHTS gesendet — im Chat erscheint ein Button, der das Vorschaufenster vorausgefüllt öffnet. Dort Betreff/Text prüfen und "Per Gmail senden".`,
  };
}

// Generic tool execution dispatcher
async function executeTool(toolName: string, args: any): Promise<any> {
  console.log(`Executing tool: ${toolName}`, args);

  switch (toolName) {
    // Booking Inquiries (NEW!)
    case 'search_booking_inquiries':
      return await executeSearchBookingInquiries(args);
    case 'accept_booking_inquiry':
      return await executeAcceptBookingInquiry(args);
    case 'reject_booking_inquiry':
      return await executeRejectBookingInquiry(args);

    // STILLGELEGT 12.07.2026 (siehe Kommentar bei den Tool-Definitionen).
    // Sicherheitsnetz: falls das Modell die Namen doch halluziniert.
    case 'create_bulk_cleaning_tasks':
    case 'create_bulk_linen_orders':
      return {
        success: false,
        error: 'Sammelaktionen sind stillgelegt. Bitte Reinigungen/Wäsche einzeln ' +
               'anlegen (create_cleaning_for_booking / create_linen_for_booking).',
      };

    // Core search tools
    case 'search_bookings':
      return await executeSearchBookings(args);
    case 'search_cleaning_tasks':
      return await executeSearchCleaningTasks(args);
    case 'search_houses':
      return await executeSearchHouses(args);
    case 'search_guests':
      return await executeSearchGuests(args);
    case 'get_dashboard_stats':
      return await executeGetDashboardStats(args);
    case 'get_linen_overview':
      return await executeGetLinenOverview(args);
    case 'search_linen_orders':
      return await executeSearchLinenOrders(args);
    case 'get_booking_full_context':
      return await executeGetBookingFullContext(args);
    case 'get_calendar_events':
      return await executeGetCalendarEvents(args);
    case 'get_revenue_stats':
      return await executeGetRevenueStats(args);
    case 'get_daily_overview':
      return await executeGetDailyOverview(args);
    case 'send_provider_message':
      return await executeSendProviderMessage(args);
    case 'check_upcoming_bookings':
      return await executeCheckUpcomingBookings(args);
    case 'create_cleaning_for_booking':
      return await executeCreateCleaningForBooking(args);
    case 'create_linen_for_booking':
      return await executeCreateLinenForBooking(args);
    case 'update_linen_for_booking':
      return await executeUpdateLinenForBooking(args);
    case 'reschedule_cleaning':
      return await executeRescheduleCleaning(args);
    case 'read_provider_replies':
      return await executeReadProviderReplies(args);
    case 'get_guest_contact_reminders':
      return await executeGetGuestContactReminders(args);
    case 'get_rating_reminders':
      return await executeGetRatingReminders(args);
    case 'draft_guest_welcome_email':
      return await executeDraftGuestWelcomeEmail(args);
    case 'get_morning_summary':
      return await executeGetMorningSummary(args);
    case 'save_knowledge':
      return await executeSaveKnowledge(args);

    default:
      console.warn(`Unknown tool: ${toolName}`);
      return { success: false, error: `Tool ${toolName} nicht implementiert` };
  }
}

// Define available tools in OpenAI format (will be converted to Gemini format)
function getToolDefinitions() {
  return [
    // Booking Inquiries
    {
      type: "function",
      function: {
        name: "search_booking_inquiries",
        description: "Sucht Buchungsanfragen. Für 'offene Anfragen' oder 'gibt es Anfragen' nutze status='pending'",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["pending", "confirmed", "rejected"], description: "Status der Anfrage. Für offene Anfragen: 'pending'" },
            house_id: { type: "string", description: "UUID des Hauses" },
            guest_name: { type: "string", description: "Name des Gastes" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "accept_booking_inquiry",
        description: "Bestätigt eine Buchungsanfrage und erstellt Buchung + Reinigung",
        parameters: {
          type: "object",
          properties: {
            inquiry_id: { type: "string", description: "UUID der Anfrage" }
          },
          required: ["inquiry_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "reject_booking_inquiry",
        description: "Lehnt eine Buchungsanfrage ab",
        parameters: {
          type: "object",
          properties: {
            inquiry_id: { type: "string", description: "UUID der Anfrage" },
            reason: { type: "string", description: "Ablehnungsgrund" }
          },
          required: ["inquiry_id"]
        }
      }
    },
    // Bulk Actions
    // ---------------------------------------------------------------
    // STILLGELEGT 12.07.2026: create_bulk_cleaning_tasks + create_bulk_linen_orders
    //
    // GRUND: Beide waren Altlast — in KEINER Doku definiert (weder MASTER noch
    // max_ablaeufe) und nie durchdacht. Sie schrieben EINEN Sammel-Eintrag in
    // max_actions mit status='wartet_uli', aber OHNE booking_id. Ein solcher
    // Vorgang ist nicht zuordenbar und kann NIE abgeschlossen werden — er bleibt
    // ewig auf „Wartet auf dich" stehen.
    //
    // Die execute-Funktionen (executeCreateBulkCleaningTasks /
    // executeCreateBulkLinenOrders) bleiben im Code erhalten, sind aber ohne
    // Tool-Definition für Max unerreichbar.
    //
    // Falls Sammelaktionen gewünscht sind: BEWUSST neu bauen — mit Ablauf in
    // max_ablaeufe, Freigabe pro Reinigung und sauberem Protokoll.
    // ---------------------------------------------------------------
    // Core Search Tools
    {
      type: "function",
      function: {
        name: "search_bookings",
        description: "Sucht Buchungen. WICHTIG: Bei 'Familien' oder 'mit Kindern' IMMER has_children=true setzen!",
        parameters: {
          type: "object",
          properties: {
            guest_name: { type: "string", description: "Name des Gastes" },
            status: { type: "string", enum: ["confirmed", "checked_in", "completed", "cancelled"], description: "Buchungsstatus. 'checked_in'=eingecheckt" },
            house_id: { type: "string", description: "UUID des Hauses" },
            has_children: { type: "boolean", description: "NUR Familien mit Kindern (number_of_children > 0)" },
            date_from: { type: "string", description: "Check-in ab Datum (ISO)" },
            date_to: { type: "string", description: "Check-in bis Datum (ISO)" },
            check_in_date: { type: "string", description: "Exakter Check-in Tag (ISO)" },
            check_out_date: { type: "string", description: "Exakter Check-out Tag (ISO)" },
            upcoming_only: { type: "boolean", description: "Nur zukünftige Buchungen" },
            exclude_cancelled: { type: "boolean", description: "Stornierte ausschließen (default: true)" },
            limit: { type: "number", description: "Max Ergebnisse" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_cleaning_tasks",
        description: "Sucht Reinigungsaufträge — auch nach GASTNAME. Das ist dein Werkzeug, um aus einem Namen die task_id zu bekommen: search_cleaning_tasks({guest_name: 'Luca'}) liefert die Reinigung(en) dieses Gastes mit id, Haus, Datum und Status. Nutze es IMMER, bevor du nach einer ID fragst — Uli nennt Gäste beim Namen, nicht per UUID. Auch für 'Welche Reinigungen stehen an?', 'Was hat Amela diese Woche?' usw. Reine Leseoperation.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["scheduled", "in_progress", "completed", "delayed", "cancelled", "draft"] },
            house_id: { type: "string" },
            date_from: { type: "string" },
            date_to: { type: "string" },
            guest_name: { type: "string" },
            provider_name: { type: "string", description: "Name des verantwortlichen Providers (z.B. Amela)" },
            payment_status: { type: "string", enum: ["paid", "unpaid", "pending"] }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_houses",
        description: "Sucht Häuser/Chalets",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Hausname" },
            address: { type: "string", description: "Adresse" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_guests",
        description: "Sucht Gäste",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            nationality: { type: "string" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_dashboard_stats",
        description: "Holt Dashboard-Statistiken (Häuser, Buchungen, Aufgaben, Umsatz)",
        parameters: { type: "object", properties: {} }
      }
    },
    {
      type: "function",
      function: {
        name: "get_linen_overview",
        description: "Holt Wäsche-Übersicht aller Häuser",
        parameters: { type: "object", properties: {} }
      }
    },
    {
      type: "function",
      function: {
        name: "search_linen_orders",
        description: "Sucht Wäschebestellungen. Kann nach Gastname filtern (findet die Bestellung über die verknüpfte Buchung). WICHTIG: 'delivered' = geliefert, 'offen'/'ausstehend' = noch nicht geliefert.",
        parameters: {
          type: "object",
          properties: {
            guest_name: { type: "string", description: "Name des Gastes (filtert über die verknüpfte Buchung)" },
            status: { type: "string", enum: ["offen", "bestellt", "ausstehend", "delivered", "cancelled"], description: "Wäsche-Status. 'delivered'=geliefert, 'offen'/'ausstehend'/'bestellt'=noch offen, 'cancelled'=storniert" },
            house_id: { type: "string" },
            date_from: { type: "string" },
            date_to: { type: "string" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_booking_full_context",
        description: "WICHTIGSTES Tool für verknüpfte Fragen zu EINEM Gast oder EINER Buchung. Liefert in einem Aufruf ALLES: Buchung + Reinigung + Wäsche (inkl. ob schon geliefert!) + Kosten + Zahlung + Vorlieben + Koordinations-Warnungen. IMMER benutzen bei Fragen wie 'Ist für Gast X die Bettwäsche/Wäsche schon geliefert/da?', 'Zeig mir alles zu Buchung X', 'Ist die Wäsche rechtzeitig vor der Reinigung da?', 'Wurde für Gast X schon gereinigt?', 'Welche Kosten hat Gast X'. NICHT einzeln search_linen_orders/search_cleaning_tasks aufrufen, wenn nach einem konkreten Gast gefragt wird.",
        parameters: {
          type: "object",
          properties: {
            guest_name: { type: "string", description: "Name des Gastes (Teilname genügt)" },
            booking_id: { type: "string", description: "UUID der Buchung (Alternative zu guest_name)" },
            include_cancelled: { type: "boolean", description: "Stornierte Buchungen einschließen (Standard: false)" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_calendar_events",
        description: "Holt Kalender-Events (Check-ins, Check-outs, Reinigungen)",
        parameters: {
          type: "object",
          properties: {
            date_from: { type: "string" },
            date_to: { type: "string" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_revenue_stats",
        description: "Berechnet Umsatzstatistiken für flexible Zeiträume: Jahr, Monat, Quartal oder beliebige Datumsbereiche. Nutze für 'Umsatz 2026', 'Einnahmen März 2026', 'Q1 2026' etc.",
        parameters: {
          type: "object",
          properties: {
            year: { type: "number", description: "Jahr (z.B. 2026). Pflicht für Jahr/Monat/Quartal-Abfragen" },
            month: { type: "number", description: "Monat 1-12 (z.B. 3 für März). Optional, zusammen mit year" },
            quarter: { type: "number", description: "Quartal 1-4 (z.B. 1 für Q1). Optional, zusammen mit year" },
            date_from: { type: "string", description: "Start-Datum ISO (z.B. 2026-01-01) für beliebige Zeiträume" },
            date_to: { type: "string", description: "End-Datum ISO (z.B. 2026-03-31) für beliebige Zeiträume" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_daily_overview",
        description: "Tagesübersicht: Zeigt alle Reinigungen, Check-ins, Check-outs und Gästewechsel für einen Tag. Ideal für 'Was passiert heute?', 'Wo wird heute gereinigt?', 'Kommen heute Gäste?', 'Wer reist ab?'",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Datum im ISO-Format (YYYY-MM-DD). Default: heute" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "send_provider_message",
        description: "Sendet eine Nachricht an einen Dienstleister (Amela = Reinigung, Teuni = Wäsche) in dessen Portal-Posteingang. Die Nachricht erscheint dort als 'Max (Assistent)'. FREIGABE-REGELN: (1) Echte TERMINFRAGEN (z.B. 'Passt dir der Reinigungstermin am 18.7.?') mit ist_terminfrage=true werden direkt gesendet. (2) JEDE andere Nachricht (z.B. Info über eine geänderte Wäschemenge) rufst du ZUERST mit ist_terminfrage=false und OHNE freigegeben auf - dann wird sie NICHT gesendet, sondern nur als Entwurf zurückgegeben, den du dem Nutzer zeigst. (3) Sobald der Nutzer den Entwurf ausdrücklich bestätigt ('ja, sende'), rufst du das Tool ERNEUT mit demselben Text und freigegeben=true auf - ERST DANN wird wirklich gesendet. PFLICHT-BEZUG: Bei ist_terminfrage=true MUSST du related_task_id (Reinigung) ODER related_linen_order_id (Wäschebestellung) mitgeben - sonst wird der Versand ABGELEHNT. Ohne Bezug kann die Antwort des Dienstleisters keiner Reinigung zugeordnet werden. Wenn du die ID nicht kennst, suche sie zuerst (search_cleaning_tasks / search_linen_orders) oder frage den Nutzer.",
        parameters: {
          type: "object",
          properties: {
            provider_name: { type: "string", description: "Name des Dienstleisters, z.B. 'Amela' oder 'Teuni'" },
            message: { type: "string", description: "Der Nachrichtentext auf Deutsch, höflich und klar" },
            ist_terminfrage: { type: "boolean", description: "true NUR bei echten Terminfragen (direkt senden). Bei allem anderen false (nur Entwurf zur Freigabe)." },
            freigegeben: { type: "boolean", description: "true, wenn der Nutzer eine Nicht-Terminfrage ausdrücklich zum Senden freigegeben hat. Weglassen/false = nur Entwurf zurückgeben." },
            related_task_id: { type: "string", description: "ID der zugehörigen Reinigung (service_task). PFLICHT bei ist_terminfrage=true (alternativ related_linen_order_id). Verknüpft Frage und Antwort - Kern der geschlossenen Kommunikationskette." },
            related_linen_order_id: { type: "string", description: "ID der zugehörigen Wäschebestellung. PFLICHT bei ist_terminfrage=true, falls es um Wäsche geht (alternativ related_task_id)." }
          },
          required: ["provider_name", "message", "ist_terminfrage"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "check_upcoming_bookings",
        description: "Tägliche Kontrolle: Prüft alle kommenden, bestätigten Buchungen und meldet, wo etwas fehlt oder nicht stimmt. Vier Prüfungen: (1) keine Reinigung angelegt, (2) keine Wäsche bestellt, (3) Wäsche käme nach der Reinigung, (4) noch nicht bezahlt. Nutze dieses Tool bei Fragen wie 'Ist alles für die kommenden Buchungen vorbereitet?', 'Fehlt irgendwo eine Reinigung?', 'Gibt es offene Zahlungen?', 'Kontrolliere die nächsten Anreisen'. Reine Prüfung - es wird nichts verändert. Fasse das Ergebnis übersichtlich zusammen; wenn alles_ok true ist, sag klar 'alles in Ordnung'.",
        parameters: {
          type: "object",
          properties: {
            advance_days: { type: "number", description: "Optional: wie viele Tage vorausgeschaut wird (Standard aus den Einstellungen, meist 7)" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "create_cleaning_for_booking",
        description: "Erstellt eine Reinigung für eine Buchung (nutzt die vorhandene Auto-Erstellung). Die Reinigung wird als ENTWURF (draft) angelegt - der Nutzer prüft sie und setzt sie auf 'geplant'. WICHTIG: Rufe dieses Tool NUR auf, nachdem der Nutzer ausdrücklich zugestimmt hat. Wenn du eine fehlende Reinigung entdeckst, FRAGE zuerst 'Soll ich sie anlegen?' und erstelle sie erst nach einem klaren 'ja'. Melde danach ehrlich, dass es ein Entwurf ist, den der Nutzer prüfen und auf 'geplant' setzen muss. SONDERFALL: Existiert für die Buchung BEREITS eine Reinigung, legt das Tool KEINE zweite an, sondern liefert bereits_vorhanden=true mit den Daten der vorhandenen. Melde das dem Nutzer und frage, ob er die vorhandene ÄNDERN möchte (dann zeigst du ihm den Button zum Öffnen der Reinigungskarte). Nur wenn er ausdrücklich eine ZUSÄTZLICHE Reinigung will, rufe das Tool erneut mit force=true auf. WICHTIG — ID SELBST BESCHAFFEN: Nennt Uli nur einen Gastnamen (z.B. 'Luca'), SUCHE die booking_id selbst mit search_bookings({guest_name: 'Luca'}). Frage NICHT nach einer ID, ohne vorher gesucht zu haben — Uli kennt keine UUIDs auswendig. Nur bei MEHREREN Treffern legst du sie ihm zur Auswahl vor (mit Haus und Datum), nur bei KEINEM Treffer meldest du das und fragst nach.",
        parameters: {
          type: "object",
          properties: {
            booking_id: { type: "string", description: "Die ID der Buchung, für die die Reinigung erstellt werden soll" },
            force: { type: "boolean", description: "Nur setzen, wenn der Nutzer ausdrücklich eine ZUSÄTZLICHE Reinigung will, obwohl bereits eine existiert. Standard: nicht setzen." }
          },
          required: ["booking_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "create_linen_for_booking",
        description: "Löst die Wäsche-Automatik aus, die fehlende Wäschebestellungen für die kommenden Buchungen anlegt (Status 'offen', mit Duplikat-Schutz - bestehende Bestellungen bleiben unverändert). Der Nutzer prüft die neuen Bestellungen und setzt sie auf 'ausstehend'. WICHTIG: Rufe dieses Tool NUR auf, nachdem der Nutzer ausdrücklich zugestimmt hat. Wenn du eine fehlende Wäsche entdeckst, FRAGE zuerst 'Soll ich die Wäsche-Automatik auslösen?' und handle erst nach einem klaren 'ja'. Hinweis: Die Automatik arbeitet pro Haus über die nächsten Buchungen, nicht gezielt für eine einzelne. Melde ehrlich, dass die neuen Bestellungen 'offen' sind und geprüft werden müssen. WICHTIG — ID SELBST BESCHAFFEN: Nennt Uli nur einen Gastnamen (z.B. 'Luca'), SUCHE die booking_id selbst mit search_bookings({guest_name: 'Luca'}). Frage NICHT nach einer ID, ohne vorher gesucht zu haben — Uli kennt keine UUIDs auswendig. Nur bei MEHREREN Treffern legst du sie ihm zur Auswahl vor (mit Haus und Datum), nur bei KEINEM Treffer meldest du das und fragst nach.",
        parameters: {
          type: "object",
          properties: {
            booking_id: { type: "string", description: "Optional: die Buchung, die den Anlass gab (zur Nachvollziehbarkeit)" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "update_linen_for_booking",
        description: "Passt die Wäschebestellung einer Buchung an die aktuelle (geänderte) Gästezahl an. Anlass: Uli hat die Gästezahl erhöht und braucht mehr Wäsche. Berechnet die neue Menge und ERSETZT die bestehende Bestellung (items + total_items werden aktualisiert) - unabhängig vom Status (auch wenn bereits in Bearbeitung oder geliefert, denn es wird mehr Wäsche gebraucht). Nutze dieses Tool, wenn eine Buchung eine geänderte Gästezahl hat und die Wäsche angepasst werden muss. WICHTIG: (1) Rufe es NUR nach ausdrücklicher Zustimmung von Uli auf - frage zuerst 'Soll ich die Wäschebestellung auf X Gäste anpassen?'. (2) Nach der Anpassung MUSST du anbieten, Teuni per Nachricht zu informieren (send_provider_message an Teuni), damit sie die geänderte Menge sieht. WICHTIG — ID SELBST BESCHAFFEN: Nennt Uli nur einen Gastnamen (z.B. 'Luca'), SUCHE die booking_id selbst mit search_bookings({guest_name: 'Luca'}). Frage NICHT nach einer ID, ohne vorher gesucht zu haben — Uli kennt keine UUIDs auswendig. Nur bei MEHREREN Treffern legst du sie ihm zur Auswahl vor (mit Haus und Datum), nur bei KEINEM Treffer meldest du das und fragst nach.",
        parameters: {
          type: "object",
          properties: {
            booking_id: { type: "string", description: "Die ID der Buchung, deren Wäsche angepasst werden soll" }
          },
          required: ["booking_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "reschedule_cleaning",
        description: "Verschiebt eine Reinigung auf ein neues Datum. Anlass: Amela hat (über Uli) um eine Terminänderung gebeten. Der Termin wird geändert und als ENTWURF (draft) markiert - Uli prüft und setzt ihn auf 'geplant'. WICHTIG: (1) Rufe dieses Tool NUR nach ausdrücklicher Zustimmung von Uli auf - bestätige vorher das genaue alte und neue Datum ('Soll ich die Reinigung für X von TT.MM. auf TT.MM. verschieben?'). (2) Gib new_date immer im Format YYYY-MM-DD an. (3) DU BRAUCHST EINE ID. Nennt Uli nur einen Gastnamen (z.B. 'Luca'), dann SUCHE SIE SELBST: rufe search_cleaning_tasks({guest_name: 'Luca'}) auf — das liefert dir die task_id. Frage NICHT nach einer ID, ohne vorher gesucht zu haben; Uli kennt keine UUIDs auswendig und erwartet, dass du den Gast findest. Nur wenn die Suche MEHRERE Reinigungen liefert, lege sie Uli zur Auswahl vor (mit Haus und Datum). Nur wenn sie GAR NICHTS liefert, melde das und frage nach. Melde danach ehrlich, dass die Änderung ein Entwurf ist, den Uli auf 'geplant' setzen muss.",
        parameters: {
          type: "object",
          properties: {
            booking_id: { type: "string", description: "Die ID der Buchung, deren Reinigung verschoben werden soll" },
            task_id: { type: "string", description: "Optional: die ID der Reinigung direkt (eindeutiger als booking_id, falls mehrere Reinigungen existieren)" },
            new_date: { type: "string", description: "Das neue Datum im Format YYYY-MM-DD" }
          },
          required: ["new_date"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "read_provider_replies",
        description: "Liest die jüngsten Antworten von Amela/Teuni und verknüpft jede mit der Reinigung, auf die sie sich bezieht (über related_task_id - so ist eindeutig klar, welche Reinigung gemeint ist). Nutze dieses Tool bei Fragen wie 'Hat Amela geantwortet?', 'Gibt es neue Rückmeldungen?', 'Was hat Teuni geschrieben?'. Wenn eine Antwort einen Terminänderungswunsch enthält, fasse ihn mit dem konkreten Bezug zusammen (Gast, Haus, aktuelles Datum) und frage Uli, ob du die Änderung mit reschedule_cleaning durchführen sollst. Reine Leseoperation.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Optional: wie viele der jüngsten Antworten gelesen werden (Standard 10, max 20)" }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_guest_contact_reminders",
        description: "Liefert die als Nächstes anreisenden Gäste, die noch VOR der Anreise kontaktiert werden sollen (5–10 Tage vor Check-in, guest_contact_status noch offen, nur Ferienvermietung). Pro Gast wird mitgeliefert, ob eine E-Mail-Adresse vorhanden ist (has_email) sowie Haus, Check-in, Tage bis Anreise, Personenzahl, Familie mit Kindern und Nationalität. Nutze dieses Tool für die morgendliche Übersicht und bei Fragen wie 'Welche Gäste muss ich kontaktieren?'. Für Gäste MIT E-Mail biete an, eine Begrüßungs-E-Mail zu erstellen; für Gäste OHNE E-Mail reicht die Erinnerung.",
        parameters: { type: "object", properties: {} }
      }
    },
    {
      type: "function",
      function: {
        name: "get_rating_reminders",
        description: "Liefert abgereiste Gäste, bei denen Uli im jeweiligen Portal nachschauen sollte, ob eine Bewertung abgegeben wurde, die er noch eintragen muss (Zeitfenster aus den Einstellungen, external_rating noch nicht hinterlegt). REINE ERINNERUNG — es wird nichts eingetragen und nichts gesendet. Nutze es für die morgendliche Übersicht und bei 'Welche Bewertungen muss ich nachtragen/prüfen?'.",
        parameters: { type: "object", properties: {} }
      }
    },
    {
      type: "function",
      function: {
        name: "draft_guest_welcome_email",
        description: "Bereitet für EINEN Gast eine Begrüßungs-/Anreise-E-Mail als ENTWURF vor (aus den vorhandenen Vorlagen in der gewählten Sprache, DE oder EN, mit eingesetzten Platzhaltern). Es wird NICHTS gesendet: Im Chat erscheint anschließend ein Button, der das Vorschaufenster VORAUSGEFÜLLT öffnet, wo Uli Betreff/Text prüft und selbst 'Per Gmail senden' klickt. Rufe dieses Tool auf, sobald Uli eine Begrüßungs-/Willkommens-/Anreise-E-Mail für einen Gast will — am einfachsten mit guest_name; das Tool wählt automatisch die passende kommende Buchung mit E-Mail-Adresse. Schreibe die E-Mail NIEMALS selbst als Text. Wähle language='en' für Gäste aus englischsprachigen Ländern (Nationalität), sonst 'de'.",
        parameters: {
          type: "object",
          properties: {
            guest_name: { type: "string", description: "Name des Gastes (Teilname genügt). Bevorzugt verwenden — das Tool wählt automatisch die passende kommende Buchung mit E-Mail-Adresse." },
            booking_id: { type: "string", description: "Optional: UUID der Buchung, falls bekannt (Alternative zu guest_name)." },
            language: { type: "string", enum: ["de", "en"], description: "Sprache der Vorlage. 'en' für Gäste aus englischsprachigen Ländern, sonst 'de' (Standard)." }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_morning_summary",
        description: "Liefert die vollständige Morgen-/Tagesübersicht in EINEM Schritt: Gäste vor Anreise kontaktieren, Bewertungen nachtragen, offene Wäschebestellungen, kommende Buchungen (7 Tage), Reinigungen heute + kommend, bestätigte Wäsche-Lieferungen. Nutze dieses Tool für 'Guten Morgen', 'Was steht heute an?', 'Tagesübersicht', 'Zusammenfassung'. Gib den zurückgegebenen Text 'summary' unverändert und vollständig aus.",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "save_knowledge",
        description: "Speichert dauerhaft eine Erklärung/Bedeutung, die Uli dir beigebracht hat (dein lernendes Gedächtnis). Nutze dies NUR, nachdem Uli ausdrücklich mit 'ja' bestätigt hat, dass du dir etwas merken sollst. Beispiel: term='Wald', meaning='das Haus Wald Chalet'. Für Dinge, die nicht schon strukturiert in der Datenbank stehen (Spitznamen, Abkürzungen, Betriebsregeln).",
        parameters: {
          type: "object",
          properties: {
            term: { type: "string", description: "Der Begriff/Auslöser, z. B. 'Wald'." },
            meaning: { type: "string", description: "Die Bedeutung/Erklärung, z. B. 'das Haus Wald Chalet'." },
            category: { type: "string", enum: ["haus", "dienstleister", "regel", "abkuerzung", "sonstiges"], description: "Grobe Einordnung (optional, Standard: sonstiges)." }
          },
          required: ["term", "meaning"]
        }
      }
    }
  ];
}

// ==================== MAIN SERVE FUNCTION ====================

/**
 * Baut aus den Tool-Ergebnissen klickbare Sprung-Buttons (Schnellzugriff) für das Frontend.
 * Das Frontend (ChatMessage.tsx) erwartet am Textende: ___ENTITIES___\n[JSON-Array]
 * Format je Link: { id, type, label }
 * type: 'booking' | 'cleaning_task' | 'laundry_order' | 'house' | 'guest' | 'calendar'
 * WICHTIG: bei 'guest' ist die id die E-Mail (Frontend navigiert per openGuestEmail).
 */
/**
 * ETAPPE 1 — Max schreibt Amela/Teuni.
 * Findet den Dienstleister über den Namen und schreibt eine Nachricht in provider_messages
 * als sender_type 'assistant'. Optional verknüpft mit einer Reinigung (related_task_id).
 *
 * Freigabe-Logik:
 *  - ist_terminfrage = true  -> Nachricht wird DIREKT gesendet (z.B. "Termin am 18.7. ok?")
 *  - ist_terminfrage = false -> es wird NICHTS gesendet; die Nachricht wird nur als Entwurf
 *    zurückgegeben, damit Max sie dem Nutzer zur Freigabe vorlegt.
 */
async function executeSendProviderMessage(params: any) {
  console.log('Executing send_provider_message with params:', params);

  const providerName = params.provider_name;
  const message = params.message;
  if (!providerName || !message) {
    return { success: false, error: 'provider_name und message sind erforderlich' };
  }

  // Dienstleister über den Namen finden (Amela, Teuni ...)
  const { data: providers, error: provErr } = await supabase
    .from('service_providers')
    .select('id, name')
    .ilike('name', `%${providerName}%`)
    .eq('is_active', true);

  if (provErr) return { success: false, error: provErr.message };
  if (!providers || providers.length === 0) {
    return { success: false, error: `Kein aktiver Dienstleister gefunden für "${providerName}".` };
  }
  if (providers.length > 1) {
    return {
      success: false,
      error: `Mehrere Dienstleister passen zu "${providerName}": ${providers.map((p: any) => p.name).join(', ')}. Bitte genauer angeben.`
    };
  }

  const provider = providers[0];

  // Freigabe-Logik: Terminfragen ODER ausdrücklich freigegebene Nachrichten senden; sonst nur Entwurf.
  if (params.ist_terminfrage !== true && params.freigegeben !== true) {
    return {
      success: true,
      gesendet: false,
      freigabe_erforderlich: true,
      entwurf: {
        an: provider.name,
        provider_id: provider.id,
        nachricht: message,
        related_task_id: params.related_task_id || null,
      },
      hinweis: `Diese Nachricht ist keine Terminfrage und wurde NICHT gesendet. Zeige dem Nutzer den Entwurf und sende erst, nachdem er ausdrücklich bestätigt hat.`,
    };
  }

  // ---------------------------------------------------------------
  // SPERRE (12.07.2026): Eine Terminfrage MUSS einen Bezug haben.
  //
  // GRUND: Ohne related_task_id kann die Antwort des Dienstleisters keiner
  // Reinigung zugeordnet werden — die geschlossene Kommunikationskette bricht.
  // Der Vorgang landet dann als 'wartet_provider' mit due_at in max_actions,
  // der Überfällig-Wächter meldet ihn nach 2 Tagen, aber NIEMAND kann ihn je
  // abschließen, weil unklar ist, worauf er sich bezieht.
  //
  // Regel: related_task_id (Reinigung) ODER related_linen_order_id (Wäsche).
  // ---------------------------------------------------------------
  if (params.ist_terminfrage === true && !params.related_task_id && !params.related_linen_order_id) {
    return {
      success: false,
      error: 'Terminfrage ohne Bezug nicht möglich.',
      hinweis: 'Eine Terminfrage an einen Dienstleister braucht IMMER einen Bezug: ' +
               'related_task_id (Reinigung) oder related_linen_order_id (Wäschebestellung). ' +
               'Sonst kann die Antwort später nicht zugeordnet werden. ' +
               'Frage den Nutzer, um welche Reinigung/Bestellung es geht, ' +
               'oder suche sie zuerst (search_cleaning_tasks / search_linen_orders).',
    };
  }

  // Terminfrage -> direkt senden
  const { data: inserted, error: insErr } = await supabase
    .from('provider_messages')
    .insert({
      provider_id: provider.id,
      sender_type: 'assistant',
      message: message,
      related_task_id: params.related_task_id || null,
      related_linen_order_id: params.related_linen_order_id || null,
      is_read: false,
    })
    .select('id')
    .single();

  if (insErr) return { success: false, error: insErr.message };

  // Workflow nur für echte Terminfragen (die auf eine Antwort warten). Reine, vom Nutzer
  // freigegebene Info-Nachrichten erwarten keine Antwort und dürfen keinen "keine Antwort"-Alarm auslösen.
  if (params.ist_terminfrage === true) {
  // Fälligkeit: 2 Tage — danach kann der Wächter "keine Antwort" erkennen.
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 2);
  const waitingFor = /teuni/i.test(provider.name) ? 'teuni' : /amela/i.test(provider.name) ? 'amela' : 'provider';
  if (params.related_task_id) {
    // Gehört zu einem bestehenden Reinigungs-/Wäsche-Workflow → fortschreiben.
    const ok = await updateMaxAction(
      { related_task_id: params.related_task_id },
      {
        status: 'wartet_provider',
        waiting_for: waitingFor,
        last_step: `Frage an ${provider.name} gesendet`,
        due_at: dueAt.toISOString(),
      }
    );
    // Falls es noch keinen Eintrag gab, einen neuen eröffnen.
    if (!ok) {
      await logMaxAction({
        action_type: 'provider_message',
        status: 'wartet_provider',
        related_task_id: params.related_task_id,
        waiting_for: waitingFor,
        last_step: `Frage an ${provider.name} gesendet`,
        due_at: dueAt.toISOString(),
        details: { an: provider.name, nachricht: message },
        created_by: 'max',
      });
    }
  } else {
    // UNERREICHBAR seit der Sperre oben (Terminfrage ohne Bezug wird abgewiesen).
    // Bleibt als Sicherheitsnetz stehen — protokolliert dann OHNE due_at, damit
    // kein unabschließbarer Vorgang entsteht, den der Überfällig-Wächter meldet.
    await logMaxAction({
      action_type: 'provider_message',
      status: 'abgeschlossen',
      waiting_for: null,
      last_step: `Nachricht an ${provider.name} gesendet (ohne Bezug — nicht nachverfolgbar)`,
      details: { an: provider.name, nachricht: message },
      created_by: 'max',
    });
  }
  } // Ende: Workflow nur bei Terminfragen

  // Reine Info-Nachricht (kein Terminfrage-Workflow): trotzdem protokollieren,
  // aber als abgeschlossen und OHNE due_at/waiting_for (erwartet keine Antwort).
  if (params.ist_terminfrage !== true) {
    await logMaxAction({
      action_type: 'provider_message',
      status: 'abgeschlossen',
      related_task_id: params.related_task_id || null,
      last_step: `Info an ${provider.name} gesendet`,
      details: { an: provider.name, nachricht: message, art: 'info' },
      created_by: 'max',
    });
  }

  return {
    success: true,
    gesendet: true,
    an: provider.name,
    message_id: inserted?.id,
    bestaetigung: `Nachricht an ${provider.name} wurde gesendet.`,
  };
}

/**
 * WÄCHTER-FUNKTIONEN ("Max: Tägliche Kontrolle")
 * ------------------------------------------------
 * Liest die Einstellungen aus system_settings (Schlüssel 'max_control_settings').
 * Struktur ist zukunftssicher: dieselbe Prüflogik kann später ein Cron-Job nutzen.
 * Bei Weg A (Chat-Tool) sind 'enabled' und 'time' noch ungenutzt — nur vorbereitet.
 */
async function getControlSettings() {
  const defaults = {
    enabled: false,          // für spätere Automatik (Weg B)
    time: '06:00',           // für spätere Automatik (Weg B)
    advance_days: 7,         // wie weit voraus wird geschaut
    checks: {
      missing_cleaning: true,
      missing_linen: true,
      linen_timing: true,
      unpaid: true,
    },
  };
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'max_control_settings')
      .maybeSingle();
    if (data?.value && typeof data.value === 'object') {
      const v: any = data.value;
      return {
        enabled: v.enabled ?? defaults.enabled,
        time: v.time ?? defaults.time,
        advance_days: v.advance_days ?? defaults.advance_days,
        checks: { ...defaults.checks, ...(v.checks || {}) },
      };
    }
  } catch (_) {
    // Tabelle/Schlüssel fehlt -> Standardwerte verwenden
  }
  return defaults;
}

/**
 * Die eigentliche Prüflogik — wiederverwendbar (Chat-Tool jetzt, Cron später).
 * Reine Lese-Operation: prüft kommende Buchungen und meldet, was fehlt.
 */
async function runUpcomingBookingsControl(overrideAdvanceDays?: number) {
  const settings = await getControlSettings();
  const advanceDays = overrideAdvanceDays ?? settings.advance_days;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + advanceDays);
  const todayStr = today.toISOString().split('T')[0];
  const windowEndStr = windowEnd.toISOString().split('T')[0];

  // Kommende, aktive Buchungen im Fenster
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, guest_name, check_in, check_out, status, payment_status, house_id, houses(name)')
    .eq('status', 'confirmed')
    .gte('check_in', todayStr)
    .lte('check_in', windowEndStr)
    .order('check_in', { ascending: true });

  if (error) return { success: false, error: error.message };

  const findings: any[] = [];

  for (const b of bookings || []) {
    const houseName = (b as any).houses?.name || 'Objekt';
    const label = `${b.guest_name} (Anreise ${formatDateDE(b.check_in)}, ${houseName})`;
    const issues: string[] = [];

    // Reinigung + Wäsche einmal laden
    const [cleaning, linen] = await Promise.all([
      supabase.from('service_tasks').select('id, scheduled_date').eq('booking_id', b.id).eq('service_type', 'cleaning'),
      supabase.from('linen_orders').select('id, status, delivery_date').eq('booking_id', b.id),
    ]);

    const cleanings = cleaning.data || [];
    const linens = linen.data || [];

    // 1. Fehlende Reinigung
    if (settings.checks.missing_cleaning && cleanings.length === 0) {
      issues.push('keine Reinigung angelegt');
    }
    // 2. Fehlende Wäsche
    if (settings.checks.missing_linen && linens.length === 0) {
      issues.push('keine Wäsche bestellt');
    }
    // 3. Wäsche-Timing: Wäsche käme nach der Reinigung
    if (settings.checks.linen_timing && cleanings.length > 0 && linens.length > 0) {
      const firstCleaning = cleanings.map((c: any) => c.scheduled_date).filter(Boolean).sort()[0];
      const late = linens.some((l: any) => l.status !== 'delivered' && l.delivery_date && firstCleaning && l.delivery_date > firstCleaning);
      if (late) issues.push('Wäsche käme nach der Reinigung');
    }
    // 4. Offene Zahlung
    if (settings.checks.unpaid && b.payment_status !== 'paid') {
      issues.push('noch nicht bezahlt');
    }

    if (issues.length > 0) {
      findings.push({ buchung: label, booking_id: b.id, probleme: issues });
    }
  }

  return {
    success: true,
    fenster: `${todayStr} bis ${windowEndStr}`,
    tage_voraus: advanceDays,
    geprueft: bookings?.length || 0,
    auffaellig: findings.length,
    alles_ok: findings.length === 0,
    details: findings,
  };
}

/** Chat-Tool: Max prüft die kommenden Buchungen auf Anfrage. */
async function executeCheckUpcomingBookings(params: any) {
  console.log('Executing check_upcoming_bookings with params:', params);
  const advance = typeof params?.advance_days === 'number' ? params.advance_days : undefined;
  return await runUpcomingBookingsControl(advance);
}

/**
 * Erstellt eine Reinigung für eine Buchung, indem die vorhandene Funktion
 * create-cleaning-task-for-booking aufgerufen wird.
 * Ergebnis: Reinigung im Status 'draft' (Entwurf). Uli prüft und setzt auf 'geplant'.
 * NUR nach ausdrücklicher Bestätigung des Nutzers aufrufen (siehe Prompt-Regel).
 */
async function executeCreateCleaningForBooking(params: any) {
  console.log('Executing create_cleaning_for_booking:', params);
  if (!params?.booking_id) {
    return { success: false, error: 'booking_id ist erforderlich' };
  }
  try {
    // ---- SONDERFALL: existiert bereits eine Reinigung für diese Buchung? ----
    // Dann NICHT einfach eine zweite anlegen, sondern melden und fragen,
    // ob die vorhandene geaendert werden soll (Uli entscheidet).
    const { data: vorhanden, error: checkErr } = await supabase
      .from('service_tasks')
      .select('id, scheduled_date, scheduled_time, status, houses(name), bookings(guest_name)')
      .eq('service_type', 'cleaning')
      .eq('booking_id', params.booking_id)
      .not('status', 'in', '("cancelled")')
      .order('scheduled_date', { ascending: true })
      .limit(1);

    if (checkErr) return { success: false, error: checkErr.message };

    if (vorhanden && vorhanden.length > 0 && params?.force !== true) {
      const t: any = vorhanden[0];
      const gast = t.bookings?.guest_name || 'Gast';
      const haus = t.houses?.name || 'Objekt';
      const datum = t.scheduled_date ? formatDateDE(t.scheduled_date) : 'ohne Datum';
      const zeit = t.scheduled_time ? ` um ${String(t.scheduled_time).slice(0, 5)} Uhr` : '';
      const statusText = t.status === 'draft' ? 'Entwurf' : t.status;

      return {
        success: true,
        bereits_vorhanden: true,
        erstellt: false,
        task_id: t.id,
        gast,
        haus,
        datum,
        status: t.status,
        hinweis: `Für ${gast} (${haus}) gibt es BEREITS eine Reinigung am ${datum}${zeit} (Status: ${statusText}). ` +
          `Es wurde KEINE neue angelegt. Frage Uli, ob er die vorhandene Reinigung ändern möchte — ` +
          `wenn ja, zeige ihm den Button zum Öffnen der Reinigungskarte. Wenn er stattdessen ` +
          `wirklich eine ZUSÄTZLICHE Reinigung will, rufe dieses Tool erneut mit force=true auf.`,
      };
    }

    const { data, error } = await supabase.functions.invoke('create-cleaning-task-for-booking', {
      body: { booking_id: params.booking_id },
    });
    if (error) return { success: false, error: error.message };
    await logMaxAction({
      action_type: 'create_cleaning_for_booking',
      status: 'wartet_uli',
      booking_id: params.booking_id,
      waiting_for: 'uli',
      last_step: 'Reinigung als Entwurf angelegt — Uli muss auf "geplant" setzen',
      details: data,
      created_by: 'uli',
    });
    return {
      success: true,
      erstellt: true,
      status: 'draft',
      hinweis: 'Die Reinigung wurde als ENTWURF (draft) angelegt. Bitte prüfe sie in der Reinigungs-Verwaltung und setze sie auf "geplant", um sie zu bestätigen.',
      details: data,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Legt gezielt EINE Wäschebestellung für EINE Buchung an.
 *
 * Ruft `create-linen-order-for-booking` (Haus + Menge kommen aus der Buchung,
 * Mengenberechnung über `generate-booking-linen-order`, Status 'offen',
 * Teuni als Provider). Uli prüft und setzt auf 'ausstehend'.
 *
 * ACHTUNG — nicht verwechseln: `auto-create-linen-orders` ist die BATCH-Automatik
 * (Cron 06:00, läuft über alle Häuser, begrenzt durch lookahead_bookings) und
 * nimmt KEINE booking_id entgegen. Sie wurde hier früher fälschlich aufgerufen;
 * der Doc-Kommentar beschrieb bis 13.07.2026 noch dieses alte Verhalten.
 *
 * NUR nach ausdrücklicher Bestätigung des Nutzers aufrufen.
 */
async function executeCreateLinenForBooking(params: any) {
  console.log('Executing create_linen_for_booking:', params);
  try {
    if (!params?.booking_id) {
      return { success: false, error: 'booking_id ist erforderlich' };
    }
    const { data, error } = await supabase.functions.invoke('create-linen-order-for-booking', {
      body: { booking_id: params.booking_id },
    });
    if (error) return { success: false, error: error.message };

    // Die Function meldet Fehler auch im Body (success:false), nicht nur als
    // Transportfehler. Ohne diese Prüfung meldet Max einen Misserfolg als Erfolg.
    // (Genau so blieb der order_source-Check-Constraint-Fehler am 12.07. unsichtbar.)
    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'Wäschebestellung konnte nicht angelegt werden.',
      };
    }

    await logMaxAction({
      action_type: 'create_linen_for_booking',
      status: 'wartet_uli',
      booking_id: params.booking_id,   // WICHTIG: ohne das findet der DB-Trigger
                                        // trg_close_max_action_on_linen_confirmed
                                        // den Vorgang nicht und er bleibt ewig offen.
      waiting_for: 'uli',
      last_step: 'Wäschebestellung angelegt (offen) — Uli muss auf "ausstehend" setzen',
      details: data,
      created_by: 'uli',
    });
    return {
      success: true,
      ausgeloest: true,
      order_id: data.linen_order_id,
      status: 'offen',
      // Der Text beschrieb bis 13.07.2026 noch die BATCH-Automatik ("fehlende
      // Bestellungen", "Duplikat-Schutz") — das stimmte nicht mehr, seit hier
      // gezielt create-linen-order-for-booking gerufen wird (Umbau 11.07.).
      hinweis: `Wäschebestellung für ${data.guest_name || 'den Gast'} angelegt (${data.total_items ?? '?'} Teile, Status "offen"). Bitte prüfe sie und setze sie auf "ausstehend", um sie zu bestätigen.`,
      details: data,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Passt die Wäschebestellung einer Buchung an die aktuelle Gästezahl an.
 * Anlass: Uli hat die Gästezahl händisch erhöht -> mehr Wäsche nötig.
 * Ablauf: neue Menge berechnen (generate-booking-linen-order, rechnet per_guest),
 * bestehende Bestellung ERSETZEN (items/total_items aktualisieren) - egal welcher
 * Status. Falls keine Bestellung existiert, wird eine neue angelegt.
 * Danach: Teuni muss informiert werden (Max sendet die Nachricht separat).
 * NUR nach ausdrücklicher Zustimmung des Nutzers aufrufen.
 */
async function executeUpdateLinenForBooking(params: any) {
  console.log('Executing update_linen_for_booking:', params);
  if (!params?.booking_id) {
    return { success: false, error: 'booking_id ist erforderlich' };
  }
  try {
    // 1. Neue Menge berechnen (nutzt aktuelle number_of_guests der Buchung)
    const { data: calc, error: calcErr } = await supabase.functions.invoke('generate-booking-linen-order', {
      body: { booking_id: params.booking_id },
    });
    if (calcErr || !calc?.success) {
      return { success: false, error: calcErr?.message || 'Mengenberechnung fehlgeschlagen' };
    }

    const newItems = calc.order_items ?? calc.items ?? {};
    const newTotal = calc.total_items ?? 0;
    const guests = calc.booking?.number_of_guests ?? null;
    const nowIso = new Date().toISOString();
    const note = `Wäschemenge angepasst an ${guests ?? '?'} Gäste (durch Max, ${formatDateDE(nowIso.split('T')[0])}). Grund: geänderte Gästezahl.`;

    // 2. Bestehende Bestellung suchen (nicht storniert)
    const { data: existing } = await supabase
      .from('linen_orders')
      .select('id, status, total_items')
      .eq('booking_id', params.booking_id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      const order = existing[0];
      const oldTotal = order.total_items;
      // 3a. Ersetzen: items + total aktualisieren, egal welcher Status
      const { error: updErr } = await supabase
        .from('linen_orders')
        .update({
          items: newItems,
          total_items: newTotal,
          item_variants: calc.item_variants ?? undefined,
          linen_color: calc.linen_color ?? undefined,
          notes: note,
          updated_at: nowIso,
          status_changed_at: nowIso,
        })
        .eq('id', order.id);
      if (updErr) return { success: false, error: updErr.message };
      await logMaxAction({
        action_type: 'update_linen_for_booking',
        status: 'wartet_uli',
        booking_id: params.booking_id,
        waiting_for: 'teuni',
        last_step: `Wäschemenge angepasst (${oldTotal} → ${newTotal}) — Teuni muss informiert werden`,
        details: { order_id: order.id, alte_menge: oldTotal, neue_menge: newTotal, gaeste: guests },
        created_by: 'uli',
      });
      return {
        success: true,
        aktion: 'aktualisiert',
        order_id: order.id,
        alter_status: order.status,
        alte_menge: oldTotal,
        neue_menge: newTotal,
        gaeste: guests,
        teuni_informieren: true,
        hinweis: `Wäschebestellung aktualisiert (von ${oldTotal} auf ${newTotal} Teile, Status war "${order.status}"). WICHTIG: Teuni muss über die Änderung informiert werden - biete an, ihr eine Nachricht zu senden.`,
      };
    } else {
      // 3b. Keine Bestellung vorhanden -> gezielt EINE für DIESE Buchung anlegen.
      //
      // FRÜHER (Fehler, behoben 13.07.2026): hier wurde 'auto-create-linen-orders'
      // mit leerem Body aufgerufen. Das ist die BATCH-AUTOMATIK über alle Häuser —
      // sie nimmt gar keine booking_id entgegen, sondern iteriert selbst und ist
      // durch lookahead_bookings begrenzt (max. 3 offene Bestellungen pro Haus).
      // Für die konkrete Buchung wurde deshalb womöglich NICHTS angelegt, während
      // Max trotzdem "Wäsche neu angelegt (X Teile)" meldete — eine Falschmeldung.
      //
      // Richtig ist 'create-linen-order-for-booking' (dieselbe Function, die auch
      // create_linen_for_booking nutzt): legt gezielt eine Bestellung für genau
      // diese Buchung an und meldet zurück, ob es geklappt hat.
      const { data: created, error: createErr } = await supabase.functions.invoke(
        'create-linen-order-for-booking',
        { body: { booking_id: params.booking_id } },
      );
      if (createErr) return { success: false, error: createErr.message };

      // Die Function meldet Fehler auch im Body (success:false) — nicht nur als
      // Transportfehler. Ohne diese Prüfung würde Max einen Misserfolg als Erfolg melden.
      if (!created?.success) {
        return {
          success: false,
          error: created?.error || 'Wäschebestellung konnte nicht angelegt werden.',
        };
      }

      // Menge aus der ANGELEGTEN Bestellung nehmen, nicht aus der Vorab-Berechnung.
      const angelegteMenge = created.total_items ?? newTotal;

      await logMaxAction({
        action_type: 'update_linen_for_booking',
        status: 'wartet_uli',
        booking_id: params.booking_id,
        waiting_for: 'uli',   // Die Bestellung steht auf 'offen' und wartet auf ULIS
                              // Freigabe ('ausstehend'), NICHT auf Teuni. Erst diese
                              // Freigabe schließt den Vorgang (DB-Trigger
                              // trg_close_max_action_on_linen_confirmed).
        last_step: `Wäsche neu angelegt (${angelegteMenge} Teile, Status "offen") — Uli muss auf "ausstehend" setzen`,
        details: { order_id: created.linen_order_id, neue_menge: angelegteMenge, gaeste: guests },
        created_by: 'uli',
      });
      return {
        success: true,
        aktion: 'neu_angelegt',
        order_id: created.linen_order_id,
        neue_menge: angelegteMenge,
        gaeste: guests,
        teuni_informieren: true,
        hinweis: `Es gab noch keine Bestellung — es wurde eine neue für ${created.guest_name || 'den Gast'} angelegt (${angelegteMenge} Teile, Status "offen"). Bitte prüfe sie und setze sie auf "ausstehend". Danach sollte Teuni informiert werden.`,
      };
    }
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Verschiebt eine Reinigung auf ein neues Datum.
 * Anlass: Amela hat (über Uli) um eine Terminänderung gebeten.
 * Setzt scheduled_date neu UND Status auf 'draft' (Entwurf) - Uli prüft die
 * Änderung und setzt sie auf 'geplant', um sie zu bestätigen.
 * NUR nach ausdrücklicher Zustimmung von Uli aufrufen.
 * new_date muss im Format YYYY-MM-DD übergeben werden.
 */
/**
 * Liest die jüngsten Antworten von Amela/Teuni (sender_type 'provider') und
 * verknüpft sie mit der Reinigung, auf die sie sich beziehen (related_task_id).
 * So bleibt die Kette intakt: Max weiß eindeutig, welche Reinigung gemeint ist.
 * Reine Lese-Operation.
 */
async function executeReadProviderReplies(params: any) {
  console.log('Executing read_provider_replies:', params);
  const limit = typeof params?.limit === 'number' ? Math.min(params.limit, 20) : 10;
  try {
    const { data: replies, error } = await supabase
      .from('provider_messages')
      .select('id, message, created_at, related_task_id, provider_id, service_providers(name)')
      .eq('sender_type', 'provider')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };

    const results: any[] = [];
    for (const r of replies || []) {
      let context: any = null;
      if (r.related_task_id) {
        // Die zugeordnete Reinigung + Buchung laden
        const { data: task } = await supabase
          .from('service_tasks')
          .select('id, scheduled_date, status, booking_id, bookings(guest_name), houses(name)')
          .eq('id', r.related_task_id)
          .maybeSingle();
        if (task) {
          context = {
            task_id: task.id,
            booking_id: task.booking_id,
            gast: (task as any).bookings?.guest_name,
            haus: (task as any).houses?.name,
            aktuelles_datum: task.scheduled_date ? formatDateDE(task.scheduled_date) : null,
            status: task.status,
          };
        }
      }
      results.push({
        von: (r as any).service_providers?.name || 'Dienstleister',
        antwort: r.message,
        gesendet: formatDateDE((r.created_at || '').split('T')[0]),
        bezug: context,  // null = Antwort ohne Reinigungs-Bezug
      });
    }

    return {
      success: true,
      anzahl: results.length,
      hinweis: 'Antworten mit "bezug" beziehen sich eindeutig auf die genannte Reinigung. Wenn eine Antwort eine Terminänderung wünscht, frage Uli, ob du sie mit reschedule_cleaning durchführen sollst.',
      antworten: results,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

async function executeRescheduleCleaning(params: any) {
  console.log('Executing reschedule_cleaning:', params);
  if (!params?.new_date || !/^\d{4}-\d{2}-\d{2}$/.test(params.new_date)) {
    return { success: false, error: 'new_date im Format YYYY-MM-DD ist erforderlich' };
  }
  if (!params?.booking_id && !params?.task_id) {
    return { success: false, error: 'booking_id oder task_id ist erforderlich' };
  }
  try {
    // Reinigung finden (per task_id oder über booking_id)
    let query = supabase
      .from('service_tasks')
      .select('id, scheduled_date, status, booking_id, bookings(guest_name), houses(name)')
      .eq('service_type', 'cleaning');
    query = params.task_id
      ? query.eq('id', params.task_id)
      : query.eq('booking_id', params.booking_id);

    const { data: tasks, error: findErr } = await query.limit(2);
    if (findErr) return { success: false, error: findErr.message };
    if (!tasks || tasks.length === 0) {
      return { success: false, error: 'Keine Reinigung gefunden. Bitte booking_id/task_id prüfen.' };
    }
    if (tasks.length > 1) {
      return { success: false, error: 'Mehrere Reinigungen gefunden. Bitte über task_id eindeutig angeben.' };
    }

    const task = tasks[0];
    const oldDate = task.scheduled_date;
    const guestName = (task as any).bookings?.guest_name || 'Gast';
    const houseName = (task as any).houses?.name || 'Objekt';
    const nowIso = new Date().toISOString();

    const { error: updErr } = await supabase
      .from('service_tasks')
      .update({
        scheduled_date: params.new_date,
        status: 'draft',
        status_changed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', task.id);
    if (updErr) return { success: false, error: updErr.message };

    // Vorgang protokollieren — FEHLTE BIS 13.07.2026 komplett.
    //
    // Warum das ein echter Fehler war (nicht nur Kosmetik):
    // Der DB-Trigger trg_close_max_action_on_cleaning_scheduled sucht bei
    // draft -> scheduled einen offenen Vorgang vom Typ 'reschedule_cleaning'
    // mit status='wartet_uli'. Ohne diesen logMaxAction-Aufruf gab es nie
    // einen — der Trigger fand nichts zu schließen, die Workflow-Kette brach
    // bei JEDER Terminverschiebung ab. Im Max-Aktionen-Fenster tauchte die
    // Verschiebung gar nicht erst auf.
    //
    // Beide IDs sind nötig, weil zwei verschiedene Trigger sie brauchen:
    //   booking_id      -> trg_close_max_action_on_cleaning_scheduled (Abschluss)
    //   related_task_id -> trg_max_actions_on_provider_reply (Amelas Antwort)
    //
    // EINE STELLE, EIN LOG (korrigiert 13.07.2026):
    // Das Protokoll wird NUR hier geschrieben — nicht zusätzlich bei den Aufrufern.
    // Die deterministischen Pfade A und B loggten früher selbst; nachdem hier ein
    // logMaxAction ergänzt wurde, entstanden ZWEI Einträge pro Verschiebung und der
    // Vorgang erschien im Max-Aktionen-Fenster doppelt.
    //
    // Die HERKUNFT (Uli direkt vs. Amelas Portal-Wunsch) reichen die Aufrufer über
    // params.quelle durch — max_ablaeufe, Schritt 1 unterscheidet beide Fälle
    // ausdrücklich ("Uli direkt ODER Amela via Portal").
    const quelle = params.quelle === 'amela' ? 'amela' : 'uli';
    await logMaxAction({
      action_type: 'reschedule_cleaning',
      status: 'wartet_uli',
      booking_id: task.booking_id,
      related_task_id: task.id,
      guest_name: guestName,
      waiting_for: 'uli',
      last_step: `Termin verschoben: ${formatDateDE(oldDate)} → ${formatDateDE(params.new_date)} (Entwurf) — Uli muss auf "geplant" setzen`,
      details: {
        task_id: task.id,
        haus: houseName,
        altes_datum: oldDate,
        neues_datum: params.new_date,
        quelle,
      },
      created_by: quelle,
    });

    return {
      success: true,
      geaendert: true,
      task_id: task.id,
      gast: guestName,
      haus: houseName,
      altes_datum: formatDateDE(oldDate),
      neues_datum: formatDateDE(params.new_date),
      status: 'draft',
      hinweis: `Der Reinigungstermin für ${guestName} (${houseName}) wurde von ${formatDateDE(oldDate)} auf ${formatDateDE(params.new_date)} geändert und als ENTWURF (draft) markiert. Bitte prüfe die Änderung und setze den Status auf "geplant", um sie zu bestätigen.`,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function formatDateDE(iso: string): string {
  try { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; } catch { return iso; }
}

function buildEntityLinks(toolResults: any[]): Array<{ id: string; type: string; label: string }> {
  const links: Array<{ id: string; type: string; label: string }> = [];
  const seen = new Set<string>();

  const add = (id: string | null | undefined, type: string, label: string) => {
    if (!id) return;
    const key = `${type}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ id: String(id), type, label });
  };

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '';
    try {
      const dt = new Date(d);
      return dt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    } catch { return ''; }
  };

  for (const tr of toolResults || []) {
    const result = tr?.result;
    if (!result || result.success === false) continue;

    // Begrüßungs-E-Mail: Button, der das Vorschaufenster vorausgefüllt öffnet.
    if (tr.tool === 'draft_guest_welcome_email' && result.draft) {
      const d = result.draft;
      links.push({
        id: String(d.booking_id || d.to || 'email'),
        type: 'email_draft',
        label: `Begrüßungs-E-Mail an ${d.guest_name || 'Gast'} öffnen`,
        email: {
          to: d.to,
          subject: d.subject,
          body: d.body,
          guestName: d.guest_name,
          checkIn: d.check_in,
          checkOut: d.check_out,
          houseName: d.house,
        },
      } as any);
      continue;
    }

    // Reinigungstermin verschoben: Button, der die Reinigungskarte (Edit-Dialog) öffnet.
    // Der Handler liefert task_id + gast direkt (nicht unter result.data).
    if (tr.tool === 'reschedule_cleaning' && result.task_id) {
      links.push({
        id: String(result.task_id),
        type: 'cleaning_task',
        label: `Reinigung für ${result.gast || 'Gast'} öffnen (${result.neues_datum || ''})`.trim(),
      });
      continue;
    }

    // SONDERFALL: Reinigung existiert bereits -> Button zum Öffnen der vorhandenen Karte
    if (tr.tool === 'create_cleaning_for_booking' && result?.bereits_vorhanden && result?.task_id) {
      links.push({
        id: String(result.task_id),
        type: 'cleaning_task',
        label: `Vorhandene Reinigung öffnen${result.datum ? ` (${result.datum})` : ''}`.trim(),
      });
      continue;
    }

    if (tr.tool === 'create_cleaning_for_booking' && result?.details?.service_task_id) {
      links.push({
        id: String(result.details.service_task_id),
        type: 'cleaning_task',
        label: `Reinigung öffnen${result.details.scheduled_date ? ` (${result.details.scheduled_date})` : ''}`.trim(),
      });
      continue;
    }

    if (tr.tool === 'create_linen_for_booking' && result?.details?.linen_order_id) {
      links.push({
        id: String(result.details.linen_order_id),
        type: 'laundry_order',
        label: `Wäschebestellung öffnen${result.details.house_name ? ` – ${result.details.house_name}` : ''}`,
      });
      continue;
    }

    const data = result.data;
    if (!data) continue;

    switch (tr.tool) {
      case 'get_booking_full_context': {
        // data ist ein Array von { booking, cleanings, linen_orders, ... }
        const arr = Array.isArray(data) ? data : [data];
        for (const ctx of arr) {
          const b = ctx.booking;
          if (b?.id) add(b.id, 'booking', `Buchung ${b.guest_name || ''}`.trim());
          for (const c of ctx.cleanings || []) {
            add(c.id, 'cleaning_task', `Reinigung ${fmtDate(c.scheduled_date)}`.trim());
          }
          for (const lo of ctx.linen_orders || []) {
            add(lo.id, 'laundry_order', `Wäsche ${fmtDate(lo.delivery_date)}`.trim());
          }
        }
        break;
      }
      case 'search_bookings': {
        const arr = Array.isArray(data) ? data : [];
        for (const b of arr.slice(0, 5)) {
          add(b.id, 'booking', `Buchung ${b.guest_name || fmtDate(b.check_in)}`.trim());
        }
        break;
      }
      case 'search_cleaning_tasks': {
        const arr = Array.isArray(data) ? data : [];
        for (const c of arr.slice(0, 5)) {
          const name = c.bookings?.guest_name || fmtDate(c.scheduled_date);
          add(c.id, 'cleaning_task', `Reinigung ${name}`.trim());
        }
        break;
      }
      case 'search_linen_orders': {
        const arr = Array.isArray(data) ? data : [];
        for (const lo of arr.slice(0, 5)) {
          const name = lo.bookings?.guest_name || fmtDate(lo.delivery_date);
          add(lo.id, 'laundry_order', `Wäsche ${name}`.trim());
        }
        break;
      }
      case 'search_guests': {
        const arr = Array.isArray(data) ? data : [];
        for (const g of arr.slice(0, 5)) {
          // Frontend navigiert per E-Mail -> id = email
          add(g.email || g.guest_email, 'guest', `${g.name || g.guest_name || 'Gast'}`.trim());
        }
        break;
      }
      case 'search_houses': {
        const arr = Array.isArray(data) ? data : [];
        for (const h of arr.slice(0, 3)) {
          add(h.id, 'house', `${h.name || 'Haus'}`.trim());
        }
        break;
      }
    }
  }

  // Nicht mehr als 6 Buttons, damit die Ansicht im schmalen Fenster nicht überläuft
  return links.slice(0, 6);
}

// ===== DETERMINISTISCHE AKTIONEN (ohne Gemini) =====
// Erkennt den Befehl "erstelle/schreibe eine (Begrüßungs-)E-Mail an/für <Gast>".
function isWelcomeEmailCommand(text: string): boolean {
  const t = text || '';
  const hasEmailWord = /(e-?mail|email|mail|begrüßung|begruessung|begrüss|willkommen|welcome|anschreiben)/i.test(t);
  const hasTarget = /\b(an|für|fuer)\s+\S+/i.test(t);
  return hasEmailWord && hasTarget;
}
// Extrahiert den Gastnamen nach "an"/"für" (bis zu vier Wörter).
function extractGuestNameFromCommand(text: string): string | null {
  const m = (text || '').match(/\b(?:an|für|fuer)\s+([A-Za-zÄÖÜäöüß.\-]+(?:\s+[A-Za-zÄÖÜäöüß.\-]+){0,3})/i);
  return m ? m[1].trim() : null;
}

/**
 * Extrahiert den Gastnamen aus einem RESCHEDULE-Befehl.
 *
 * WARUM EIGENE FUNKTION (13.07.2026):
 * extractGuestNameFromCommand() oben sucht nur nach "an"/"für" — passend für
 * E-Mail-Befehle ("E-Mail AN Luca"), aber NICHT für Verschiebe-Befehle. Die
 * Soll-Definition (Tabelle max_ablaeufe, reschedule_cleaning, Schritt 1) nennt
 * den Auslöser wörtlich: "ändere Reinigung VON <Gast> auf <Datum>".
 *
 * Das Wort "von" fehlte im alten Muster. Folge: guestName blieb null, und Max
 * fragte nach einer UUID, statt den Gast zu suchen — genau der Fehler, den Uli
 * am 13.07.2026 mit "Luca" gemeldet hat.
 *
 * Stoppwörter verhindern, dass Füllwörter oder Verben als Name durchgehen
 * ("Reinigungstermin verschieben" darf keinen Gast namens "verschieben" liefern).
 * Sie werden nur am ANFANG und ENDE geschnitten, nie mittendrin — sonst würde
 * aus "Christiaan Van Der Horst" ein "Christiaan Van Horst".
 */
function extractGuestNameFromReschedule(text: string): string | null {
  const t = (text || '').trim();

  const STOPP = new Set([
    'die', 'der', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen',
    'reinigung', 'reinigungstermin', 'termin', 'putzen', 'putz',
    'auf', 'am', 'um', 'zum', 'zur', 'nach', 'bitte', 'mal',
    'heute', 'morgen', 'übermorgen', 'uebermorgen',
    'wald', 'venediger', 'chalet',   // Häuser sind keine Gäste
    // Verben aus dem Befehl selbst:
    'verschieben', 'verschiebe', 'verschieb', 'ändern', 'aendern', 'ändere',
    'aendere', 'anpassen', 'passe', 'setzen', 'setze', 'legen', 'lege',
  ]);

  const istName = (w: string) => w.length >= 2 && !STOPP.has(w.toLowerCase()) && !/^\d/.test(w);

  // Füllwörter nur vorn und hinten abschneiden — die Mitte bleibt (siehe "Van Der").
  const saeubern = (roh: string): string | null => {
    const w = roh.split(/\s+/).filter(Boolean);
    while (w.length && !istName(w[0])) w.shift();
    while (w.length && !istName(w[w.length - 1])) w.pop();
    return w.length ? w.join(' ') : null;
  };

  // 1) Mit Präposition: "von/an/für <Name>" — der Normalfall laut Definition.
  let m = t.match(/\b(?:von|an|für|fuer)\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\-]*(?:\s+[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\-]*){0,3})/i);
  if (m) {
    const name = saeubern(m[1]);
    if (name) return name;
  }

  // 2) Genitiv: "verschiebe Lucas Reinigung"
  m = t.match(/\b([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\-]*)s\s+Reinigung/i);
  if (m && istName(m[1])) return m[1];

  // 3) Ohne Präposition: "Reinigung Luca auf 20.7."
  m = t.match(/\bReinigung(?:stermin)?\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\-]*(?:\s+[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.\-]*)?)/i);
  if (m) {
    const name = saeubern(m[1]);
    if (name) return name;
  }

  return null;
}

// Schreibt einen Eintrag in den Auftragsverlauf (Tabelle max_actions).
// Rein additiv: schlägt es fehl, wird nur geloggt — die Aktion läuft trotzdem weiter.
async function logMaxAction(entry: {
  action_type: string;
  status: string;
  booking_id?: string | null;
  guest_name?: string | null;
  details?: any;
  created_by?: string;
  related_task_id?: string | null;
  last_step?: string | null;
  waiting_for?: string | null;
  due_at?: string | null;
}): Promise<string | null> {
  try {
    // Verlaufs-Kette anlegen: der erste Schritt ist last_step (falls vorhanden).
    const nowIso = new Date().toISOString();
    const baseDetails = entry.details && typeof entry.details === 'object' ? { ...entry.details } : (entry.details ? { info: entry.details } : {});
    const verlauf = Array.isArray(baseDetails.verlauf) ? baseDetails.verlauf : [];
    if (entry.last_step) {
      verlauf.push({ schritt: entry.last_step, zeitpunkt: nowIso, akteur: entry.created_by ?? 'max' });
    }
    baseDetails.verlauf = verlauf;

    const { data, error } = await supabase
      .from('max_actions')
      .insert({
        action_type: entry.action_type,
        status: entry.status,
        booking_id: entry.booking_id ?? null,
        guest_name: entry.guest_name ?? null,
        details: baseDetails,
        created_by: entry.created_by ?? 'max',
        related_task_id: entry.related_task_id ?? null,
        last_step: entry.last_step ?? null,
        waiting_for: entry.waiting_for ?? null,
        due_at: entry.due_at ?? null,
      })
      .select('id')
      .single();
    if (error) {
      console.error('logMaxAction error:', error);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.error('logMaxAction exception:', e);
    return null;
  }
}

// Hängt einen weiteren Schritt an die Verlaufs-Kette eines bestehenden Workflows an
// (via related_task_id ODER id) und aktualisiert Status/waiting_for/last_step.
// Rein additiv/robust: Fehler brechen die eigentliche Aktion nicht ab.
async function appendWorkflowStep(
  match: { related_task_id?: string | null; id?: string | null },
  step: {
    schritt: string;
    akteur?: string;
    status?: string;
    waiting_for?: string | null;
    due_at?: string | null;
  }
): Promise<boolean> {
  try {
    if (!match.related_task_id && !match.id) return false;
    // Bestehenden Eintrag laden (neuester, falls mehrere).
    let sel = supabase.from('max_actions').select('id, details').order('created_at', { ascending: false }).limit(1);
    sel = match.id ? sel.eq('id', match.id) : sel.eq('related_task_id', match.related_task_id as string);
    const { data: rows, error: selErr } = await sel;
    if (selErr || !rows || rows.length === 0) return false;

    const row = rows[0] as any;
    const details = row.details && typeof row.details === 'object' ? { ...row.details } : {};
    const verlauf = Array.isArray(details.verlauf) ? details.verlauf : [];
    verlauf.push({ schritt: step.schritt, zeitpunkt: new Date().toISOString(), akteur: step.akteur ?? 'max' });
    details.verlauf = verlauf;

    const patch: any = { details, last_step: step.schritt, updated_at: new Date().toISOString() };
    if (step.status !== undefined) patch.status = step.status;
    if (step.waiting_for !== undefined) patch.waiting_for = step.waiting_for;
    if (step.due_at !== undefined) patch.due_at = step.due_at;

    const { error: updErr } = await supabase.from('max_actions').update(patch).eq('id', row.id);
    if (updErr) {
      console.error('appendWorkflowStep update error:', updErr);
      return false;
    }
    return true;
  } catch (e) {
    console.error('appendWorkflowStep exception:', e);
    return false;
  }
}

// Schreibt einen bestehenden Workflow fort (via related_task_id ODER id).
// Rein additiv/robust: Fehler brechen die eigentliche Aktion nicht ab.
async function updateMaxAction(
  match: { related_task_id?: string | null; id?: string | null },
  patch: {
    status?: string;
    last_step?: string | null;
    waiting_for?: string | null;
    due_at?: string | null;
    details?: any;
  }
): Promise<boolean> {
  try {
    if (!match.related_task_id && !match.id) return false;
    let q = supabase.from('max_actions').update({ ...patch, updated_at: new Date().toISOString() });
    if (match.id) {
      q = q.eq('id', match.id);
    } else {
      q = q.eq('related_task_id', match.related_task_id as string);
    }
    const { error } = await q;
    if (error) {
      console.error('updateMaxAction error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('updateMaxAction exception:', e);
    return false;
  }
}

// Erkennt ein Datum aus freiem Text: TT.MM.JJJJ, TT.MM., "TT. Monat [JJJJ]".
// Gibt ISO 'YYYY-MM-DD' zurück oder null. Fehlt das Jahr, wird das nächste
// zukünftige Jahr gewählt.
function parseGermanDate(text: string): string | null {
  const t = text || '';
  const months: Record<string, number> = {
    januar: 1, jänner: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6,
    juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
  };
  const futureYear = (mon: number, day: number): number => {
    const now = new Date();
    let year = now.getFullYear();
    const candidate = new Date(year, mon - 1, day);
    if (candidate.getTime() < now.getTime() - 86400000) year += 1;
    return year;
  };
  // 1) TT.MM.JJJJ
  let m = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // 2) TT.MM. (ohne Jahr)
  m = t.match(/(\d{1,2})\.(\d{1,2})\.?(?!\d)/);
  if (m) {
    const day = parseInt(m[1], 10), mon = parseInt(m[2], 10);
    const year = futureYear(mon, day);
    return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // 3) TT. Monat [JJJJ]
  m = t.match(/(\d{1,2})\.?\s+(januar|jänner|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)(?:\s+(\d{4}))?/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = months[m[2].toLowerCase()];
    const year = m[3] ? parseInt(m[3], 10) : futureYear(mon, day);
    return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

// Findet offene Termin-Vorschläge von Dienstleistern (Amela/Teuni):
// provider-Nachrichten "Neuer Termin: TT.MM.JJJJ" mit Reinigungsbezug,
// die noch nicht angewandt wurden (aktuelles Datum != Vorschlag).
async function findAmelaRescheduleProposals(): Promise<any[]> {
  const { data: msgs } = await supabase
    .from('provider_messages')
    .select('id, message, related_task_id, created_at, provider_id, service_providers(name)')
    .eq('sender_type', 'provider')
    .not('related_task_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30);

  const re = /Neuer Termin:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i;
  const seen = new Set<string>();
  const out: any[] = [];
  for (const msg of msgs || []) {
    const mm = re.exec((msg as any).message || '');
    if (!mm) continue;
    const taskId = (msg as any).related_task_id;
    if (seen.has(taskId)) continue; // pro Reinigung nur der jüngste Vorschlag
    seen.add(taskId);
    const iso = `${mm[3]}-${mm[2].padStart(2, '0')}-${mm[1].padStart(2, '0')}`;
    const { data: task } = await supabase
      .from('service_tasks')
      .select('id, scheduled_date, booking_id, service_type, bookings(guest_name), houses(name)')
      .eq('id', taskId)
      .maybeSingle();
    if (!task || (task as any).service_type !== 'cleaning') continue;
    if (String((task as any).scheduled_date) === iso) continue; // schon angewandt
    out.push({
      task_id: (task as any).id,
      booking_id: (task as any).booking_id,
      iso,
      new_date_de: `${mm[1].padStart(2, '0')}.${mm[2].padStart(2, '0')}.${mm[3]}`,
      old_date_de: formatDateDE(String((task as any).scheduled_date)),
      guest: (task as any).bookings?.guest_name || 'Gast',
      haus: (task as any).houses?.name || '',
      provider_name: (msg as any).service_providers?.name || 'Amela',
      provider_id: (msg as any).provider_id,
    });
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = await requireAdmin(req, corsHeaders);
  if (authError) return authError;

  try {
    const { messages, context } = await req.json();

    // ===== DETERMINISTISCHE AKTION: Begrüßungs-E-Mail — DIREKT ausführen, OHNE Gemini. =====
    // Wenn der letzte Nutzer-Text ein E-Mail-Befehl ist, ruft das Backend die Funktion
    // executeDraftGuestWelcomeEmail selbst auf und gibt "Auftrag ausgeführt" + Button zurück.
    // Gemini wird dabei NICHT gefragt (zuverlässig statt Zufall).
    const latestUserText = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';
    if (isWelcomeEmailCommand(latestUserText)) {
      const guestName = extractGuestNameFromCommand(latestUserText);
      const result = await executeDraftGuestWelcomeEmail({ guest_name: guestName || undefined });
      const toolResults = [{ tool: 'draft_guest_welcome_email', args: { guest_name: guestName }, result }];

      let responseText: string;
      if (result.success && (result as any).draft) {
        const d = (result as any).draft;
        // Status-Verlauf: Auftrag protokollieren (Entwurf erstellt, wartet auf Prüfung/Senden).
        await logMaxAction({
          action_type: 'welcome_email',
          status: 'wartet_uli',
          waiting_for: 'uli',
          booking_id: d.booking_id ?? null,
          guest_name: d.guest_name ?? null,
          details: { to: d.to, subject: d.subject, language: d.language, house: d.house },
          created_by: 'uli',
        });
        responseText = `✅ Auftrag ausgeführt: Begrüßungs-E-Mail (${String(d.language || 'de').toUpperCase()}) für ${d.guest_name} vorbereitet. Klick auf den Button, prüfe Betreff/Text im Vorschaufenster und sende mit „Per Gmail senden".`;
      } else {
        responseText = (result as any).error || 'Ich konnte die Begrüßungs-E-Mail nicht vorbereiten.';
      }

      const entityLinks = buildEntityLinks(toolResults);
      const responseWithEntities = entityLinks.length > 0
        ? `${responseText}\n___ENTITIES___\n${JSON.stringify(entityLinks)}`
        : responseText;

      return new Response(
        JSON.stringify({ response: responseWithEntities, toolResults }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== DETERMINISTISCHE AKTION: Reinigungstermin ändern (ohne Gemini) =====
    const dateInMsg = parseGermanDate(latestUserText);
    const mentionsReschedule = /(verschieb|reinigungstermin|reinigung.*termin|termin.*reinigung)/i.test(latestUserText);
    const mentionsAmelaChange =
      /amela/i.test(latestUserText) &&
      /(änder|termin|geantwortet|vorschlag|neuer termin|was möchte|was will)/i.test(latestUserText);
    const jsonHeaders = { headers: { ...corsHeaders, 'Content-Type': 'application/json' } };

    // =========================================================================
    // A) Direkter Befehl MIT Datum: "verschiebe die Reinigung von <Gast> auf <Datum>"
    //
    // SOLL-DEFINITION (Tabelle max_ablaeufe, reschedule_cleaning, standard):
    //   1 uli    Änderungswunsch (Uli direkt oder Amela via Portal)
    //   2 max    Ordnet die Reinigung über related_task_id zu      -> wartet_uli
    //   3 max    Ändert auf neues Datum, Status draft
    //   4 max    Zeigt Button "Reinigung öffnen"
    //   5 uli    Prüft in der Karte, setzt Geplant
    //   6 system DB-Trigger informiert Amela                       -> abgeschlossen
    //
    // KEINE Chat-Rückfrage vor Schritt 3 — und das ist KEIN Verstoß gegen Modell A:
    // 'draft' IST die Freigabestufe. Die Änderung ist folgenlos, bis Uli in der
    // Karte auf "Geplant" setzt (Schritt 5); erst dann wird Amela informiert.
    // (Anders bei accept_booking_inquiry: dort steht eine Chat-Bestätigung in der
    // Definition, weil eine Buchung anzulegen NICHT reversibel ist.)
    // =========================================================================
    if (mentionsReschedule && dateInMsg) {
      // Eigener Parser: kennt "von <Gast>" — genau der Auslöser aus der Definition.
      // Der alte (extractGuestNameFromCommand) kannte nur "an"/"für" und lieferte
      // deshalb null. Max fragte dann nach einer UUID (Fehler vom 13.07.2026).
      const guestName = extractGuestNameFromReschedule(latestUserText);
      if (!guestName) {
        return new Response(JSON.stringify({ response: 'Für welchen Gast soll ich die Reinigung verschieben? Bitte den Namen nennen, z. B. „verschiebe die Reinigung von Niels auf 18.07.2026".', toolResults: [] }), jsonHeaders);
      }

      const todayStr = new Date().toISOString().split('T')[0];
      // Nur ANSTEHENDE, aktive Reinigungen — Vergangenes/Storniertes ist nicht verschiebbar.
      // (Filter in der DB statt in JS: vorher wurden ALLE Reinigungen geladen.)
      const { data: tasks } = await supabase
        .from('service_tasks')
        .select('id, scheduled_date, status, booking_id, bookings(guest_name), houses(name)')
        .eq('service_type', 'cleaning')
        .not('status', 'in', '("cancelled","completed")')
        .gte('scheduled_date', todayStr)
        .order('scheduled_date', { ascending: true });
      const list = (tasks || []).filter((t: any) =>
        (t.bookings?.guest_name || '').toLowerCase().includes(guestName.toLowerCase())
      );

      // MEHRERE TREFFER -> zur Auswahl vorlegen, nicht raten.
      // Analog zur Definition (create_cleaning_for_booking, Schritt 3:
      // "Mehrere Treffer: zeigt Buchungen zur Auswahl", wartet_uli).
      // Vorher nahm der Code stillschweigend die nächstliegende — womöglich die falsche.
      if (list.length > 1) {
        const auswahl = list
          .map((t: any, i: number) => `${i + 1}. ${t.bookings?.guest_name} — ${t.houses?.name || 'Objekt'}, ${formatDateDE(t.scheduled_date)}`)
          .join('\n');
        return new Response(JSON.stringify({
          response: `Für „${guestName}" gibt es mehrere anstehende Reinigungen:\n${auswahl}\n\nWelche soll ich auf ${formatDateDE(dateInMsg)} verschieben? Nenne bitte das Haus oder das aktuelle Datum.`,
          toolResults: [],
        }), jsonHeaders);
      }

      const task = list[0];
      const toolResults: any[] = [];
      let text: string;
      if (!task) {
        text = `Ich habe keine anstehende Reinigung für „${guestName}" gefunden.`;
      } else {
        // quelle:'uli' -> der Wunsch kam direkt von Uli (nicht von Amela).
        // KEIN logMaxAction hier: executeRescheduleCleaning protokolliert selbst
        // (13.07.2026). Ein zweites Log hier erzeugte doppelte Vorgänge.
        const rr = await executeRescheduleCleaning({ task_id: (task as any).id, new_date: dateInMsg, quelle: 'uli' });
        toolResults.push({ tool: 'reschedule_cleaning', args: { task_id: (task as any).id, new_date: dateInMsg }, result: rr });
        if (rr.success) {
          text = `✅ Auftrag ausgeführt: Reinigung für ${(rr as any).gast || guestName} von ${(rr as any).altes_datum} auf ${(rr as any).neues_datum} verschoben (als Entwurf). Bitte in der Reinigungs-Verwaltung auf „geplant" setzen.`;
        } else {
          text = `Konnte die Reinigung nicht verschieben: ${(rr as any).error || 'unbekannter Fehler'}`;
        }
      }
      const entityLinksA = buildEntityLinks(toolResults);
      const responseA = entityLinksA.length > 0
        ? `${text}\n___ENTITIES___\n${JSON.stringify(entityLinksA)}`
        : text;
      return new Response(JSON.stringify({ response: responseA, toolResults }), jsonHeaders);
    }

    // B) Bestätigung OHNE Datum ("verschieben" / "ja verschieben"): Amelas jüngsten Vorschlag anwenden
    if (mentionsReschedule && !dateInMsg) {
      const proposals = await findAmelaRescheduleProposals();
      const p = proposals[0];
      const toolResults: any[] = [];
      let text: string;
      if (!p) {
        text = 'Ich habe keinen offenen Termin-Vorschlag von Amela gefunden. Wenn du direkt verschieben willst, nenne Gast und Datum, z.B. „verschiebe die Reinigung von Niels auf 18.07.2026".';
      } else {
        // quelle:'amela' -> der Wunsch kam aus Amelas Portal (max_ablaeufe, Schritt 1).
        // KEIN logMaxAction hier: executeRescheduleCleaning protokolliert selbst
        // (13.07.2026) und übernimmt die Herkunft aus params.quelle.
        const rr = await executeRescheduleCleaning({ task_id: p.task_id, new_date: p.iso, quelle: 'amela' });
        toolResults.push({ tool: 'reschedule_cleaning', args: { task_id: p.task_id, new_date: p.iso }, result: rr });
        if (rr.success) {
          // HINWEIS: Amela wird NICHT mehr sofort bestätigt.
          // Die Bestätigung übernimmt der DB-Trigger, NACHDEM Uli den Status
          // in der Reinigungskarte auf "Geplant" (scheduled) gesetzt hat.
          text = `✅ Reinigung für ${p.guest} von ${p.old_date_de} auf ${p.new_date_de} geändert (Entwurf). Öffne die Reinigungskarte, prüfe das Datum und setze den Status auf „Geplant" — erst dann wird ${p.provider_name} automatisch informiert.`;
        } else {
          text = `Konnte die Reinigung nicht verschieben: ${(rr as any).error || 'unbekannter Fehler'}`;
        }
      }
      const entityLinksB = buildEntityLinks(toolResults);
      const responseB = entityLinksB.length > 0
        ? `${text}\n___ENTITIES___\n${JSON.stringify(entityLinksB)}`
        : text;
      return new Response(JSON.stringify({ response: responseB, toolResults }), jsonHeaders);
    }

    // C) Nachfrage "was möchte Amela ändern?": offene Vorschläge auflisten
    if (mentionsAmelaChange) {
      const proposals = await findAmelaRescheduleProposals();
      let text: string;
      if (proposals.length === 0) {
        text = 'Aktuell gibt es keinen offenen Termin-Vorschlag von Amela.';
      } else {
        const lines = proposals
          .map((p) => `• Reinigung für ${p.guest}${p.haus ? ` (${p.haus})` : ''}: von ${p.old_date_de} auf ${p.new_date_de}`)
          .join('\n');
        text = `Amela möchte folgende Reinigung(en) verschieben:\n${lines}\n\nSoll ich das durchführen? Antworte mit „verschieben".`;
      }
      return new Response(JSON.stringify({ response: text, toolResults: [] }), jsonHeaders);
    }

    const GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');

    if (!GEMINI_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
    }

    console.log('Chat request received:', { messageCount: messages.length, context });

    // Aktuelles Datum für zeitbasierte Anfragen
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const berlinTime = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      dateStyle: 'full',
      timeStyle: 'short'
    }).format(now);

    // Hilfsfunktion für ISO-Format
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // Morgen
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = formatDate(tomorrow);

    // Gestern
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = formatDate(yesterday);

    // Diese Woche (Montag bis Sonntag)
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() + mondayOffset);
    const thisSunday = new Date(thisMonday);
    thisSunday.setDate(thisMonday.getDate() + 6);

    // Nächste Woche
    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);

    // Letzte Woche
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);

    // Dieser Monat
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Nächster Monat
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    // Letzter Monat
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Wochenende (nächstes Samstag/Sonntag)
    const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7;
    const nextSaturday = new Date(now);
    nextSaturday.setDate(now.getDate() + daysUntilSat);
    const nextSundayWE = new Date(nextSaturday);
    nextSundayWE.setDate(nextSaturday.getDate() + 1);

    // Nächste 7 Tage / 30 Tage
    const in7Days = new Date(now);
    in7Days.setDate(now.getDate() + 7);
    const in30Days = new Date(now);
    in30Days.setDate(now.getDate() + 30);

    // ============================================================
    // DYNAMISCHER KONTEXT — aus der aktuellen Datenbank gelesen.
    // Der System-Prompt wird NICHT hart eingetippt, sondern setzt sich
    // aus lebenden Daten zusammen: echte Häuser, echte Dienstleister und
    // das gelernte Wissen aus assistant_knowledge. Ändert sich der Betrieb,
    // ändert sich Max' Wissen automatisch mit.
    // ============================================================
    let housesContext = '';
    try {
      const { data: housesData } = await supabase
        .from('houses')
        .select('id, name, rental_type, max_guests, property_type')
        .order('name');
      if (housesData && housesData.length > 0) {
        housesContext = housesData
          .map((h: any) => {
            const parts = [`"${h.name}" (ID: ${h.id}`];
            if (h.max_guests) parts.push(`max. ${h.max_guests} Gäste`);
            if (h.rental_type) parts.push(`${h.rental_type}`);
            return parts.join(', ') + ')';
          })
          .join('\n- ');
      }
    } catch (e) {
      console.error('Kontext: houses konnten nicht geladen werden:', e);
    }

    let providersContext = '';
    try {
      const { data: provData } = await supabase
        .from('service_providers')
        .select('id, name, alias, service_type, is_active, has_portal')
        .eq('is_active', true)
        .order('name');
      if (provData && provData.length > 0) {
        providersContext = provData
          .map((p: any) => {
            const parts = [`"${p.name}"`];
            if (p.alias) parts.push(`alias "${p.alias}"`);
            if (p.service_type) parts.push(`Bereich: ${p.service_type}`);
            parts.push(`ID: ${p.id}`);
            if (p.has_portal) parts.push('hat Portal');
            return parts.join(', ');
          })
          .join('\n- ');
      }
    } catch (e) {
      console.error('Kontext: service_providers konnten nicht geladen werden:', e);
    }

    let learnedContext = '';
    try {
      const { data: knowData } = await supabase
        .from('assistant_knowledge')
        .select('term, meaning, category')
        .eq('is_active', true)
        .order('category');
      if (knowData && knowData.length > 0) {
        learnedContext = knowData
          .map((k: any) => `- "${k.term}" bedeutet: ${k.meaning}${k.category ? ` [${k.category}]` : ''}`)
          .join('\n');
      }
    } catch (e) {
      console.error('Kontext: assistant_knowledge konnte nicht geladen werden:', e);
    }

    // =========================================================================
    // ABLÄUFE AUS DER DATENBANK LADEN (Tabelle max_ablaeufe)
    //
    // WARUM (14.07.2026): max_ablaeufe ist die VERBINDLICHE Soll-Definition aller
    // Max-Abläufe (je Fall: Schritt -> Akteur -> Funktion -> Status). Bis heute
    // wurde sie NIRGENDS gelesen — sie kam im Code nur in Kommentaren vor. Max'
    // Verhalten steckte stattdessen als fest verdrahtete Prosa im System-Prompt.
    //
    // Folge: ZWEI Wahrheiten, die auseinanderdrifteten. Belegt: Der Prompt wies Max
    // noch an, `create_bulk_cleaning_tasks` zu nutzen — obwohl das Tool am
    // 12.07.2026 stillgelegt wurde. Max las eine Anweisung ins Leere.
    //
    // Jetzt gilt: EINE Wahrheit. Ändert Uli die Tabelle, ändert sich Max' Verhalten
    // — ohne Code-Deploy. Die Tabelle ist ein lebendes Dokument, kein totes.
    //
    // Nur Schritte mit umsetzung='umgesetzt' gelten als verbindlich. Schritte mit
    // 'fehlt' werden Max ausdrücklich als NICHT VERFÜGBAR gemeldet, damit er nichts
    // verspricht, was es nicht gibt (z. B. reject_reschedule — Absage an Amela).
    // =========================================================================
    let ablaeufeContext = '';
    let luekenContext = '';
    try {
      const { data: ablaufData } = await supabase
        .from('max_ablaeufe')
        .select('aktion, aktion_label, variante, schritt_nr, akteur, schritt, ergebnis_status, funktion, umsetzung')
        .order('aktion')
        .order('variante')
        .order('schritt_nr');

      if (ablaufData && ablaufData.length > 0) {
        const umgesetzt = ablaufData.filter((r: any) => r.umsetzung === 'umgesetzt');
        const offen = ablaufData.filter((r: any) => r.umsetzung === 'fehlt');

        const gruppen = new Map<string, any[]>();
        for (const r of umgesetzt) {
          const titel = `${r.aktion_label || r.aktion}` +
            (r.variante && r.variante !== 'standard' ? ` — ${r.variante}` : '');
          if (!gruppen.has(titel)) gruppen.set(titel, []);
          gruppen.get(titel)!.push(r);
        }

        ablaeufeContext = [...gruppen.entries()]
          .map(([titel, schritte]) => {
            const zeilen = schritte.map((s: any) =>
              `  ${s.schritt_nr}. [${s.akteur}] ${s.schritt}` +
              (s.ergebnis_status ? `  ⇒ ${s.ergebnis_status}` : '') +
              (s.funktion ? `\n       → ${s.funktion}` : '')
            ).join('\n');
            return `▸ ${titel}\n${zeilen}`;
          })
          .join('\n\n');

        if (offen.length > 0) {
          luekenContext = [...new Set(offen.map((r: any) => r.aktion_label || r.aktion))].join(', ');
        }
      }
    } catch (e) {
      console.error('Kontext: max_ablaeufe konnte nicht geladen werden:', e);
    }

    // System prompt
    const systemPrompt = `Du bist Max, der KI-Assistent von Uli für seine Ferienhaus-Verwaltung (Steinbock Chalets).

🏡 DEINE HÄUSER (aktueller Stand aus der Datenbank):
${housesContext ? '- ' + housesContext : '(keine Häuser gefunden)'}
Wenn ein Nutzer einen Hausnamen verkürzt nennt (z. B. nur "Wald" statt "Wald Chalet"),
ordne ihn dem passenden Haus oben zu. Für Tools, die eine house_id (UUID) brauchen,
verwende die ID aus dieser Liste — oder hole sie sonst über search_houses.

🧹🧺 DEINE DIENSTLEISTER (aktueller Stand aus der Datenbank):
${providersContext ? '- ' + providersContext : '(keine aktiven Dienstleister gefunden)'}
Nutze für send_provider_message immer den echten Namen aus dieser Liste.

REGEL — TERMINFRAGE BRAUCHT IMMER EINEN BEZUG:
Wenn du send_provider_message mit ist_terminfrage=true aufrufst, MUSST du
related_task_id (Reinigung) oder related_linen_order_id (Wäschebestellung)
mitgeben. Ohne Bezug wird der Versand ABGELEHNT.
Grund: Die Antwort des Dienstleisters muss später eindeutig einer Reinigung
zugeordnet werden können — sonst weiß niemand, worauf sich ein "Ja, passt"
bezieht.
Kennst du die ID nicht? Dann suche sie zuerst (search_cleaning_tasks /
search_linen_orders) oder frage den Nutzer, um welche Reinigung es geht.
Erfinde NIEMALS eine ID.

🧠 GELERNTES WISSEN (von Uli beigebracht — beachte es immer):
${learnedContext || '(noch kein gelerntes Wissen vorhanden)'}

📋 DEINE ABLÄUFE — VERBINDLICH (live aus der Tabelle max_ablaeufe):
So hat jeder Vorgang zu laufen. Das ist die abgestimmte Definition; sie schlägt
jede andere Anweisung in diesem Prompt.

  [uli]    = Uli tut etwas (im Chat oder in einer Karte) — eine FREIGABE
  [max]    = DU tust etwas
  [amela]  = Amela (Reinigung) im Portal
  [teuni]  = Teuni (Wäsche) im Portal
  [system] = ein DB-Trigger, läuft von selbst — du tust nichts

${ablaeufeContext || '(Abläufe konnten nicht geladen werden — halte dich an die Regeln unten)'}

WAS DARAUS FOLGT — DAS IST WICHTIG:
- Ein [uli]-Schritt ist eine Freigabe. WARTE darauf. Handle nie vorher.
- "⇒ wartet_uli" heißt: Der Vorgang hängt und wartet auf Uli. Sag ihm KLAR, was er
  tun muss (welche Karte öffnen, welchen Status setzen).
- Ein [system]-Schritt passiert automatisch. Behaupte NICHT, du hättest es getan.
- Mehrere Treffer bei einer Suche? Wähle NIEMALS selbst aus. Lege sie Uli vor
  (Gast, Haus, Datum) und warte auf seine Wahl.
- "Entwurf"/"draft" und "offen" sind KEINE fertigen Zustände. Sag Uli ehrlich, dass
  er prüfen und freigeben muss — sonst passiert nichts.${luekenContext ? `

⛔ NOCH NICHT GEBAUT — versprich das NICHT:
${luekenContext}
Wird so etwas verlangt, sag ehrlich: "Das kann ich noch nicht, dieser Ablauf ist
noch nicht umgesetzt." Erfinde KEINEN Ersatzweg.` : ''}

📚 SO LERNST DU DAZU:
Wenn du einen Begriff, eine Abkürzung oder eine Anweisung NICHT sicher verstehst,
rate NICHT. Frage kurz nach, was gemeint ist. Wenn Uli es dir erklärt, biete an,
es dauerhaft zu speichern: "Soll ich mir merken, dass <Begriff> = <Bedeutung> ist?".
Erst nach einem klaren "ja" rufst du save_knowledge auf. So wächst dein Wissen mit.

Du bist ein Datenbank-Assistent für eine Ferienhaus-Verwaltungssoftware.

📅 AKTUELLES DATUM & BERECHNETE ZEITRÄUME:
Heute: ${berlinTime} (ISO: ${currentDate})
Gestern: ${yesterdayDate}
Morgen: ${tomorrowDate}

📆 BERECHNETE ZEITRÄUME (benutze diese exakten Daten!):
• Diese Woche: ${formatDate(thisMonday)} bis ${formatDate(thisSunday)}
• Nächste Woche: ${formatDate(nextMonday)} bis ${formatDate(nextSunday)}
• Letzte Woche: ${formatDate(lastMonday)} bis ${formatDate(lastSunday)}
• Dieser Monat: ${formatDate(monthStart)} bis ${formatDate(monthEnd)}
• Nächster Monat: ${formatDate(nextMonthStart)} bis ${formatDate(nextMonthEnd)}
• Letzter Monat: ${formatDate(lastMonthStart)} bis ${formatDate(lastMonthEnd)}
• Wochenende: ${formatDate(nextSaturday)} bis ${formatDate(nextSundayWE)}
• Nächste 7 Tage: ${currentDate} bis ${formatDate(in7Days)}
• Nächste 30 Tage: ${currentDate} bis ${formatDate(in30Days)}

⛔ KRITISCHE REGEL ⛔
Für Fragen zu Daten (Buchungen, Reinigung, Wäsche, Gäste, Umsatz …) MUSST du ein Tool verwenden.
Rate NIEMALS Daten aus dem Gedächtnis – hole sie immer per Tool.

🎯 WICHTIGSTE REGEL FÜR VERKNÜPFTE FRAGEN:
Buchung, Reinigung und Wäsche gehören IMMER zusammen (über die Buchung verknüpft).
Wenn nach EINEM konkreten Gast oder EINER Buchung gefragt wird und dabei Wäsche,
Reinigung, Kosten oder Zahlung eine Rolle spielen → benutze IMMER
get_booking_full_context. Dieses eine Tool liefert alles zusammen.
NICHT mehrere Einzel-Tools hintereinander aufrufen.

Beispiele, die IMMER get_booking_full_context brauchen:
- "Ist für Gast Niels die Bettwäsche/Wäsche schon geliefert/da?"
- "Wurde für Gast X schon gereinigt?"
- "Zeig mir alles zu Buchung/Gast X"
- "Ist die Wäsche rechtzeitig vor der Reinigung da?"
- "Welche Kosten/Zahlungen hat Gast X?"

🔍 TOOL-AUSWAHL:
- Alles zu EINEM Gast/EINER Buchung (Wäsche+Reinigung+Kosten) → get_booking_full_context ⭐
- Listen von Buchungen (mehrere) → search_bookings
- Listen von Reinigungen → search_cleaning_tasks
- Listen von Wäschebestellungen → search_linen_orders (kann auch nach guest_name filtern)
- Häuser/Chalets → search_houses
- Gäste → search_guests
- Statistiken → get_dashboard_stats
- Wäsche-Bestand aller Häuser → get_linen_overview
- Kalender → get_calendar_events
- Umsatz → get_revenue_stats
- Tagesübersicht (inkl. Wäsche-Lieferungen) → get_daily_overview
- Buchungsanfragen → search_booking_inquiries
- Gäste vor Anreise kontaktieren → get_guest_contact_reminders
- Bewertungen prüfen/nachtragen → get_rating_reminders
- Begrüßungs-E-Mail für einen Gast vorbereiten → draft_guest_welcome_email

📋 MORGEN-ÜBERSICHT ("Was steht heute an?", "Guten Morgen", "Tagesübersicht", "Zusammenfassung"):
Rufe get_morning_summary auf und gib den zurückgegebenen Text 'summary' vollständig und
unverändert aus. Das Tool enthält bereits alles: Gästekontakt vor Anreise, Bewertungen,
offene Wäsche, kommende Buchungen (7 Tage), Reinigungen heute + kommend, bestätigte
Lieferungen. Baue die Übersicht NICHT aus Einzel-Tools zusammen.
Danach gilt weiterhin: Für jeden im Abschnitt Gästekontakt genannten Gast MIT E-Mail biete
aktiv an, die Begrüßungs-E-Mail zu erstellen ("Soll ich für <Gast> die Begrüßungs-E-Mail
vorbereiten?"). Für Gäste OHNE E-Mail nenne nur die Erinnerung (z. B. telefonisch kontaktieren).
Bewertungen sind eine reine Erinnerung zum Nachschauen im Portal — trage nie selbst etwas ein.

✉️ BEGRÜSSUNGS-E-MAIL (draft_guest_welcome_email) — SEHR WICHTIG:
Wenn Uli dich bittet, für einen Gast eine Begrüßungs-/Willkommens-/Anreise-E-Mail zu
"schreiben", "erstellen", "vorbereiten", "eine Vorlage zu nehmen" oder "den E-Mail-Client
zu starten" (oder mit "ja" auf dein Angebot antwortet), dann ist das GENAU die Aufgabe des
Tools draft_guest_welcome_email. LEHNE NIEMALS mit "ich kann keine E-Mails schreiben/senden"
oder "ich kann keinen E-Mail-Client starten" ab — du KANNST das, indem du dieses Tool
aufrufst. Es öffnet für Uli ein vorausgefülltes Vorschaufenster, in dem er selbst sendet.
"Schreiben"/"starten" bedeutet hier IMMER: dieses Tool aufrufen — NICHT den Text im Chat ausgeben.

Regeln:
- Gib NIEMALS Betreff oder E-Mail-Text selbst im Chat aus.
- Rufe IMMER draft_guest_welcome_email auf. Wenn du die booking_id des Gastes noch nicht
  hast, hole sie zuerst über get_guest_contact_reminders oder search_bookings (echte
  booking_id / UUID, nicht die Buchungsnummer).
- Wähle language 'en' für Gäste aus englischsprachigen Ländern (Nationalität), sonst 'de'.
- Antworte danach nur KURZ, z.B.: "Ich habe die Begrüßungs-E-Mail für <Gast> vorbereitet –
  klick auf den Button, um sie im Vorschaufenster zu prüfen und zu senden."
Es wird nichts automatisch gesendet; Uli sendet selbst im Vorschaufenster. Behaupte nie,
die E-Mail sei verschickt.

📦 WÄSCHE-STATUS richtig deuten:
- 'delivered' = geliefert / ist da
- 'offen', 'ausstehend', 'bestellt' = noch NICHT geliefert
- 'cancelled' = storniert

✉️ NACHRICHTEN AN DIENSTLEISTER (Amela/Teuni) — send_provider_message:
Du kannst Amela (Reinigung) oder Teuni (Wäsche) eine Nachricht in ihr Portal schreiben.
Sie erscheint dort als "Max (Assistent)".
STRENGE FREIGABE-REGEL:
- Echte Terminfragen (z.B. "Passt dir der Reinigungstermin am 18.7.?") → ist_terminfrage=true, wird direkt gesendet.
- ALLES ANDERE → ist_terminfrage=false. Die Nachricht wird dann NICHT gesendet, sondern als Entwurf zurückgegeben. Zeige dem Nutzer den Entwurf und sende ihn erst, nachdem der Nutzer ausdrücklich "ja, senden" o.ä. bestätigt hat (dann erneut send_provider_message, weiterhin ist_terminfrage=false, aber jetzt mit Bestätigung des Nutzers).
- Formuliere Nachrichten höflich, auf Deutsch. Beginne jede Nachricht an einen Dienstleister mit "Hallo [Name], ich bin Max, der KI-Assistent von Uli."
- Wenn du eine Reinigung ansprichst, gib wenn möglich related_task_id mit, damit die Nachricht daran hängt.

Du antwortest auf Deutsch, klar und konkret. Nenne bei Wäsche immer eindeutig,
ob sie schon geliefert ist oder nicht.

🛠️ FEHLENDES ANLEGEN (create_cleaning_for_booking / create_linen_for_booking):
Wenn du über check_upcoming_bookings feststellst, dass eine Reinigung oder Wäsche fehlt, darfst du anbieten, sie anzulegen - aber NIEMALS ungefragt.
- Frage IMMER zuerst: "Soll ich die Reinigung/Wäsche anlegen?" und warte auf ein klares "ja".
- Erst nach der Zustimmung rufst du das Tool auf.
- Danach meldest du EHRLICH den Status: Reinigung ist ein ENTWURF (draft), den Uli prüfen und auf "geplant" setzen muss; Wäsche ist "offen" und muss auf "ausstehend" gesetzt werden.
- Bei geänderter Gästezahl darfst du die WÄSCHE anpassen (siehe unten). Reinigungen und andere Bestellungen änderst du nicht - solche Fälle meldest du nur an Uli.

⚠️ SONDERFALL: REINIGUNG EXISTIERT SCHON
Wenn create_cleaning_for_booking mit bereits_vorhanden=true antwortet, wurde KEINE neue Reinigung angelegt (das ist Absicht, kein Fehler).
- Melde Uli klar und freundlich, dass es die Reinigung SCHON GIBT, mit Datum, Haus und Status. Beispiel: "Für Luca (Wald Chalet) gibt es bereits eine Reinigung am 18.07.2026 (Status: Entwurf). Ich habe keine zweite angelegt."
- FRAGE dann: "Möchtest du die vorhandene Reinigung ändern?"
- Bei "ja": zeige den Button zum Öffnen der Reinigungskarte (kommt automatisch). Uli ändert dort Datum/Zeit und speichert. Danach läuft alles wie beim Ablauf "Reinigung ändern" (reschedule_cleaning): Statuswechsel auf "geplant" löst die Benachrichtigung an Amela aus.
- Lege NUR dann eine zusätzliche Reinigung an (force=true), wenn Uli ausdrücklich sagt, dass er eine ZWEITE zusätzlich möchte. Frage im Zweifel nach.

🧺 WÄSCHE BEI GÄSTEZAHL-ÄNDERUNG (update_linen_for_booking):
Wenn eine Buchung eine geänderte (erhöhte) Gästezahl hat, ist mehr Wäsche nötig.
- Frage zuerst: "Soll ich die Wäschebestellung auf X Gäste anpassen?" und warte auf ein klares "ja".
- Erst dann rufst du update_linen_for_booking auf. Die bestehende Bestellung wird ersetzt (mehr Wäsche), egal welcher Status.
- Danach MUSST du anbieten, Teuni zu informieren: sende ihr per send_provider_message die geänderte Menge. Teuni muss die Änderung sehen.

📅 REINIGUNGSTERMIN VERSCHIEBEN (reschedule_cleaning):
Wenn Uli dir mitteilt, dass Amela einen Reinigungstermin ändern möchte, kannst du die Reinigung verschieben.
- Bestätige zuerst das genaue alte und neue Datum: "Soll ich die Reinigung für [Gast] von [alt] auf [neu] verschieben?" und warte auf ein klares "ja".
- Erst dann rufst du reschedule_cleaning auf (new_date im Format YYYY-MM-DD).
- Der Termin wird als ENTWURF (draft) markiert. Melde Uli ehrlich, dass er die Änderung prüfen und auf "geplant" setzen muss.
- Wenn die Buchung nicht eindeutig ist, nutze zuerst search_bookings, um die richtige zu finden.`;

    const tools = getToolDefinitions();

    // Build Gemini-compatible contents
    const contents: GeminiContent[] = [];

    for (const m of messages) {
      if (m.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: m.content }]
        });
      } else if (m.role === 'assistant') {
        contents.push({
          role: 'model',
          parts: [{ text: m.content }]
        });
      }
    }

    // Absicht "Begrüßungs-E-Mail vorbereiten" in der letzten Nutzer-Nachricht erkennen.
    // In dem Fall erzwingen wir den Aufruf von draft_guest_welcome_email, weil Gemini
    // sonst den E-Mail-Text selbst schreibt, statt das Tool (und damit den Button) zu nutzen.
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';
    const wantsWelcomeEmail =
      /(begrüßung|begruessung|begrüss|begruess|willkommen|welcome)/i.test(lastUserMsg) ||
      (/(anreise)/i.test(lastUserMsg) && /(e-?mail|mail|schreib|vorlage|client|nachricht)/i.test(lastUserMsg));

    // Tool-calling loop
    let iteration = 0;
    const maxIterations = 5;
    let toolResults: any[] = [];
    let rateLimitRetried = false; // erlaubt genau einen 429-Retry pro Anfrage
    let toolNudged = false; // erlaubt genau einen sanften Tool-Hinweis pro Anfrage

    while (iteration < maxIterations) {
      iteration++;
      console.log(`Tool-calling iteration ${iteration}`);

      // Build request for Gemini
      const geminiTools = convertToolsToGemini(tools);

      // Wurde in dieser Anfrage schon ein Begrüßungs-Entwurf erzeugt? Dann nicht mehr erzwingen.
      const draftDone = toolResults.some((t: any) => t.tool === 'draft_guest_welcome_email' && t.result?.success);
      // Bei erkannter E-Mail-Absicht: draft_guest_welcome_email ERZWINGEN (mode ANY), sonst AUTO.
      const functionCallingConfig = (wantsWelcomeEmail && !draftDone)
        ? { mode: 'ANY', allowedFunctionNames: ['draft_guest_welcome_email'] }
        : { mode: 'AUTO' };  // AUTO: Modell entscheidet selbst (spart 429-Rate-Limit)

      const requestBody = {
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: geminiTools,
        toolConfig: {
          functionCallingConfig
        },
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7
        }
      };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error:', response.status, errorText);

        if (response.status === 429) {
          // Rate-Limit: einmalig kurz warten und dieselbe Iteration erneut versuchen,
          // statt sofort abzubrechen. Das fängt kurzzeitige Limits (Free-Tier) ab.
          if (!rateLimitRetried) {
            rateLimitRetried = true;
            console.log('Rate limit (429) - warte 2s und versuche erneut...');
            await new Promise((r) => setTimeout(r, 2000));
            iteration--; // diese Iteration wiederholen, nicht verbrauchen
            continue;
          }
          return new Response(
            JSON.stringify({ error: 'Der Assistent ist gerade stark ausgelastet. Bitte versuche es in einer Minute erneut.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      console.log('Gemini response:', {
        finishReason: candidate?.finishReason,
        partsCount: parts.length,
        hasFunctionCall: parts.some((p: GeminiPart) => p.functionCall)
      });

      // Check for function calls
      const functionCalls = parts.filter((p: GeminiPart) => p.functionCall);

      if (functionCalls.length === 0) {
        // No function calls - return text response
        const textPart = parts.find((p: GeminiPart) => p.text);
        const finalContent = textPart?.text || 'Ich konnte keine passende Antwort generieren.';

        if (iteration === 1 && !toolNudged) {
          // Einmaliger sanfter Stupser: Wenn das Modell bei der ersten Runde ohne Tool
          // antwortet, obwohl es eine Datenfrage ist, einmal zum passenden Tool anstoßen.
          // (Kein harter Zwang mehr wie bei mode:'ANY' - das sparte 429-Rate-Limits.)
          toolNudged = true;
          console.log('AI antwortete ohne Tool - einmaliger Hinweis auf passendes Tool');
          contents.push({
            role: 'user',
            parts: [{ text: 'Falls dies eine Frage zu konkreten Daten (Buchung, Gast, Wäsche, Reinigung, Kosten) ist: bitte das passende Tool aufrufen. Bei Fragen zu einem konkreten Gast/einer Buchung: get_booking_full_context.' }]
          });
          continue;
        }

        console.log('Final response received:', { textLength: finalContent.length });

        // Sprung-Buttons (Schnellzugriff) aus den Tool-Ergebnissen anhängen.
        // Das Frontend (ChatMessage.tsx) erkennt den ___ENTITIES___-Marker und rendert Buttons.
        const entityLinks = buildEntityLinks(toolResults);
        const responseWithEntities = entityLinks.length > 0
          ? `${finalContent}\n___ENTITIES___\n${JSON.stringify(entityLinks)}`
          : finalContent;

        return new Response(
          JSON.stringify({ response: responseWithEntities, toolResults }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Process function calls
      // Add model response to contents
      contents.push({
        role: 'model',
        parts: parts
      });

      console.log('Processing function calls:', functionCalls.map((fc: any) => fc.functionCall.name));

      const functionResponses: GeminiPart[] = [];

      for (const fc of functionCalls) {
        const toolName = fc.functionCall.name;
        const args = fc.functionCall.args || {};

        console.log(`Executing tool: ${toolName}`, args);

        const result = await executeTool(toolName, args);

        console.log(`Tool result for ${toolName}:`, {
          success: result.success,
          dataCount: result.data?.length || result.count || 0,
          error: result.error
        });

        toolResults.push({ tool: toolName, args, result });

        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: result
          }
        });
      }

      // Add function responses as user message
      contents.push({
        role: 'user',
        parts: functionResponses
      });
    }

    // Max iterations reached
    return new Response(
      JSON.stringify({
        response: 'Die Anfrage konnte nicht vollständig bearbeitet werden. Bitte versuche es erneut.',
        toolResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Chat assistant error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
