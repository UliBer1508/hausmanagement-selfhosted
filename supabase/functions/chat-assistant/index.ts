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

  let query = supabase
    .from('service_tasks')
    .select(`
      *,
      houses(name),
      bookings(guest_name, guest_email, guest_phone),
      service_providers!service_tasks_provider_id_fkey(id, name, contact_email, contact_phone)
    `)
    .eq('service_type', 'cleaning')
    .order('scheduled_date', { ascending: true });

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

  // Filter by guest_name or staff_name if provided
  let filteredData = data || [];
  if (params.guest_name) {
    filteredData = filteredData.filter(t =>
      t.bookings?.guest_name?.toLowerCase().includes(params.guest_name.toLowerCase())
    );
  }
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

  let query = supabase
    .from('linen_orders')
    .select('*, houses(name), bookings(guest_name, check_in, check_out)')
    .order('order_date', { ascending: false });

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

  // Gastname-Filter über die verknüpfte Buchung (post-query, wie bei search_cleaning_tasks)
  let filtered = data || [];
  if (params.guest_name) {
    const needle = params.guest_name.toLowerCase();
    filtered = filtered.filter((o: any) =>
      o.bookings?.guest_name?.toLowerCase().includes(needle)
    );
  }

  return { success: true, data: filtered, count: filtered.length };
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
  if (!params?.booking_id) {
    return { success: false, error: 'booking_id ist erforderlich' };
  }
  const lang = params?.language === 'en' ? 'en' : 'de';

  // 1) Buchung + Haus laden
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, guest_name, guest_email, check_in, check_out, nationality, houses(name)')
    .eq('id', params.booking_id)
    .maybeSingle();
  if (bErr) return { success: false, error: bErr.message };
  if (!booking) return { success: false, error: 'Buchung nicht gefunden' };
  if (!booking.guest_email) {
    return { success: false, error: 'Für diesen Gast ist keine E-Mail-Adresse hinterlegt. Es reicht die telefonische Erinnerung.' };
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

    // Bulk Actions (NEW!)
    case 'create_bulk_cleaning_tasks':
      return await executeCreateBulkCleaningTasks(args);
    case 'create_bulk_linen_orders':
      return await executeCreateBulkLinenOrders(args);

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
    {
      type: "function",
      function: {
        name: "create_bulk_cleaning_tasks",
        description: "Erstellt Reinigungsaufträge für alle Buchungen an einem Datum. Für 'morgige Abreisen' nutze for_date='tomorrow' und trigger='checkout'",
        parameters: {
          type: "object",
          properties: {
            for_date: { type: "string", description: "Datum: 'today', 'tomorrow' oder ISO-Datum" },
            trigger: { type: "string", enum: ["checkout", "checkin"], description: "checkout=Abreisen, checkin=Ankünfte" },
            house_id: { type: "string", description: "Optional: nur für dieses Haus" }
          },
          required: ["for_date", "trigger"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "create_bulk_linen_orders",
        description: "Erstellt Wäschebestellungen für alle Buchungen in einem Zeitraum",
        parameters: {
          type: "object",
          properties: {
            date_from: { type: "string", description: "Start-Datum (ISO)" },
            date_to: { type: "string", description: "End-Datum (ISO)" },
            house_id: { type: "string", description: "Optional: nur für dieses Haus" }
          },
          required: ["date_from", "date_to"]
        }
      }
    },
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
        description: "Sucht Reinigungsaufträge",
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
        description: "Sendet eine Nachricht an einen Dienstleister (Amela = Reinigung, Teuni = Wäsche) in dessen Portal-Posteingang. Die Nachricht erscheint dort als 'Max (Assistent)'. WICHTIGE REGEL: Nur echte TERMINFRAGEN (z.B. 'Passt dir der Reinigungstermin am 18.7.?') dürfen mit ist_terminfrage=true direkt gesendet werden. JEDE andere Nachricht muss mit ist_terminfrage=false erstellt werden - dann wird sie NICHT gesendet, sondern nur als Entwurf zurückgegeben, den du dem Nutzer zur Freigabe zeigst. Sende eine Nicht-Terminfrage erst, wenn der Nutzer sie ausdrücklich bestätigt hat.",
        parameters: {
          type: "object",
          properties: {
            provider_name: { type: "string", description: "Name des Dienstleisters, z.B. 'Amela' oder 'Teuni'" },
            message: { type: "string", description: "Der Nachrichtentext auf Deutsch, höflich und klar" },
            ist_terminfrage: { type: "boolean", description: "true NUR bei echten Terminfragen (direkt senden). Bei allem anderen false (nur Entwurf zur Freigabe)." },
            related_task_id: { type: "string", description: "Optional: ID der zugehörigen Reinigung (service_task), damit die Nachricht direkt daran hängt" },
            related_linen_order_id: { type: "string", description: "Optional: ID der zugehörigen Wäschebestellung" }
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
        description: "Erstellt eine Reinigung für eine Buchung (nutzt die vorhandene Auto-Erstellung). Die Reinigung wird als ENTWURF (draft) angelegt - der Nutzer prüft sie und setzt sie auf 'geplant'. WICHTIG: Rufe dieses Tool NUR auf, nachdem der Nutzer ausdrücklich zugestimmt hat. Wenn du eine fehlende Reinigung entdeckst, FRAGE zuerst 'Soll ich sie anlegen?' und erstelle sie erst nach einem klaren 'ja'. Melde danach ehrlich, dass es ein Entwurf ist, den der Nutzer prüfen und auf 'geplant' setzen muss.",
        parameters: {
          type: "object",
          properties: {
            booking_id: { type: "string", description: "Die ID der Buchung, für die die Reinigung erstellt werden soll" }
          },
          required: ["booking_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "create_linen_for_booking",
        description: "Löst die Wäsche-Automatik aus, die fehlende Wäschebestellungen für die kommenden Buchungen anlegt (Status 'offen', mit Duplikat-Schutz - bestehende Bestellungen bleiben unverändert). Der Nutzer prüft die neuen Bestellungen und setzt sie auf 'ausstehend'. WICHTIG: Rufe dieses Tool NUR auf, nachdem der Nutzer ausdrücklich zugestimmt hat. Wenn du eine fehlende Wäsche entdeckst, FRAGE zuerst 'Soll ich die Wäsche-Automatik auslösen?' und handle erst nach einem klaren 'ja'. Hinweis: Die Automatik arbeitet pro Haus über die nächsten Buchungen, nicht gezielt für eine einzelne. Melde ehrlich, dass die neuen Bestellungen 'offen' sind und geprüft werden müssen.",
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
        description: "Passt die Wäschebestellung einer Buchung an die aktuelle (geänderte) Gästezahl an. Anlass: Uli hat die Gästezahl erhöht und braucht mehr Wäsche. Berechnet die neue Menge und ERSETZT die bestehende Bestellung (items + total_items werden aktualisiert) - unabhängig vom Status (auch wenn bereits in Bearbeitung oder geliefert, denn es wird mehr Wäsche gebraucht). Nutze dieses Tool, wenn eine Buchung eine geänderte Gästezahl hat und die Wäsche angepasst werden muss. WICHTIG: (1) Rufe es NUR nach ausdrücklicher Zustimmung von Uli auf - frage zuerst 'Soll ich die Wäschebestellung auf X Gäste anpassen?'. (2) Nach der Anpassung MUSST du anbieten, Teuni per Nachricht zu informieren (send_provider_message an Teuni), damit sie die geänderte Menge sieht.",
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
        description: "Verschiebt eine Reinigung auf ein neues Datum. Anlass: Amela hat (über Uli) um eine Terminänderung gebeten. Der Termin wird geändert und als ENTWURF (draft) markiert - Uli prüft und setzt ihn auf 'geplant'. WICHTIG: (1) Rufe dieses Tool NUR nach ausdrücklicher Zustimmung von Uli auf - bestätige vorher das genaue alte und neue Datum ('Soll ich die Reinigung für X von TT.MM. auf TT.MM. verschieben?'). (2) Gib new_date immer im Format YYYY-MM-DD an. (3) Wenn du die Buchung nicht eindeutig identifizieren kannst, frage nach oder nutze zuerst search_bookings/search_cleaning_tasks, um die richtige task_id zu finden. Melde danach ehrlich, dass die Änderung ein Entwurf ist, den Uli auf 'geplant' setzen muss.",
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
        description: "Bereitet für EINEN Gast eine Begrüßungs-/Anreise-E-Mail als ENTWURF vor (aus den vorhandenen Vorlagen in der gewählten Sprache, DE oder EN, mit eingesetzten Platzhaltern). Es wird NICHTS gesendet: Im Chat erscheint anschließend ein Button, der das Vorschaufenster VORAUSGEFÜLLT öffnet, wo Uli Betreff/Text prüft und selbst 'Per Gmail senden' klickt. Rufe dieses Tool NUR auf, nachdem Uli ausdrücklich zugestimmt hat ('ja, bereite die Begrüßungs-E-Mail vor'). Wähle language='en' für Gäste aus englischsprachigen Ländern (siehe Nationalität), sonst 'de'. Voraussetzung: der Gast hat eine E-Mail-Adresse (has_email=true).",
        parameters: {
          type: "object",
          properties: {
            booking_id: { type: "string", description: "Die ID der Buchung des anzuschreibenden Gastes" },
            language: { type: "string", enum: ["de", "en"], description: "Sprache der Vorlage. 'en' für Gäste aus englischsprachigen Ländern, sonst 'de' (Standard)." }
          },
          required: ["booking_id"]
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

  // Freigabe-Logik: nur Terminfragen direkt senden, alles andere zur Freigabe zurückgeben.
  if (params.ist_terminfrage !== true) {
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
    const { data, error } = await supabase.functions.invoke('create-cleaning-task-for-booking', {
      body: { booking_id: params.booking_id },
    });
    if (error) return { success: false, error: error.message };
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
 * Löst die Wäsche-Automatik (auto-create-linen-orders) aus.
 * Diese arbeitet pro Haus, geht die nächsten Buchungen durch und legt fehlende
 * Bestellungen mit Status 'offen' an (mit eingebautem Duplikat-Schutz).
 * Ergebnis: neue Bestellung(en) im Status 'offen'. Uli prüft und setzt auf 'ausstehend'.
 * NUR nach ausdrücklicher Bestätigung des Nutzers aufrufen.
 */
async function executeCreateLinenForBooking(params: any) {
  console.log('Executing create_linen_for_booking:', params);
  try {
    const { data, error } = await supabase.functions.invoke('auto-create-linen-orders', {
      body: {},
    });
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      ausgeloest: true,
      status: 'offen',
      hinweis: 'Die Wäsche-Automatik wurde ausgelöst. Fehlende Bestellungen wurden mit Status "offen" angelegt (bestehende bleiben unverändert, Duplikat-Schutz). Bitte prüfe die neuen Bestellungen und setze sie auf "ausstehend", um sie zu bestätigen.',
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
      // 3b. Keine Bestellung vorhanden -> neu anlegen über die Automatik
      const { data: created, error: createErr } = await supabase.functions.invoke('auto-create-linen-orders', {
        body: {},
      });
      if (createErr) return { success: false, error: createErr.message };
      return {
        success: true,
        aktion: 'neu_angelegt',
        neue_menge: newTotal,
        gaeste: guests,
        teuni_informieren: true,
        hinweis: 'Es gab noch keine Bestellung - die Wäsche-Automatik wurde ausgelöst (Status "offen"). Bitte prüfen und Teuni informieren.',
        details: created,
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = await requireAdmin(req, corsHeaders);
  if (authError) return authError;

  try {
    const { messages, context } = await req.json();
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

    // System prompt
    const systemPrompt = `Du bist ein Datenbank-Assistent für eine Ferienhaus-Verwaltungssoftware.

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
- Bulk Reinigungen → create_bulk_cleaning_tasks
- Bulk Wäsche → create_bulk_linen_orders
- Gäste vor Anreise kontaktieren → get_guest_contact_reminders
- Bewertungen prüfen/nachtragen → get_rating_reminders
- Begrüßungs-E-Mail für einen Gast vorbereiten → draft_guest_welcome_email

📋 MORGEN-ÜBERSICHT ("Was steht heute an?", "Guten Morgen", "Tagesübersicht", "Zusammenfassung"):
Stelle die Übersicht aus deinen vorhandenen Tools zusammen — baue NICHTS doppelt:
1. Probleme kommender Buchungen → check_upcoming_bookings
2. Heute (Check-ins/-outs, Reinigungen, Lieferungen, Gästewechsel) → get_daily_overview
3. Offene Buchungsanfragen → search_booking_inquiries (status 'pending')
4. Gäste vor Anreise kontaktieren → get_guest_contact_reminders
5. Bewertungen prüfen/nachtragen → get_rating_reminders
Beim Punkt Gästekontakt: Für jeden Gast MIT E-Mail (has_email=true) biete aktiv an, eine
Begrüßungs-E-Mail zu erstellen ("Soll ich für <Gast> die Begrüßungs-E-Mail vorbereiten?").
Für Gäste OHNE E-Mail nenne nur die Erinnerung (z. B. telefonisch kontaktieren).
Bewertungen sind eine reine Erinnerung zum Nachschauen im Portal — trage nie selbst etwas ein.

✉️ BEGRÜSSUNGS-E-MAIL (draft_guest_welcome_email) — SEHR WICHTIG:
Wenn Uli sagt "bereite eine Begrüßungs-E-Mail für <Gast> vor" oder mit "ja" auf dein
Angebot antwortet, dann SCHREIBE die E-Mail NIEMALS selbst als Text in den Chat.
Gib KEINEN Betreff und KEINEN E-Mail-Text im Chat aus. Rufe stattdessen IMMER das Tool
draft_guest_welcome_email auf — NUR so entsteht der Button, der das Vorschaufenster
vorausgefüllt öffnet. Vorgehen:
1. Wenn du die booking_id des Gastes noch nicht hast, hole sie zuerst über
   get_guest_contact_reminders (oder search_bookings mit dem Namen). Nutze die echte
   booking_id (UUID), nicht die Buchungsnummer.
2. Rufe dann draft_guest_welcome_email mit dieser booking_id auf. Wähle language 'en' für
   Gäste aus englischsprachigen Ländern (Nationalität), sonst 'de'.
3. Antworte danach nur KURZ, z.B.: "Ich habe die Begrüßungs-E-Mail für <Gast> vorbereitet –
   klick auf den Button, um sie im Vorschaufenster zu prüfen und zu senden." Den E-Mail-Text
   selbst gibst du NICHT aus.
Es wird nichts gesendet; Uli prüft im Vorschaufenster und klickt "Per Gmail senden".
Behaupte nie, die E-Mail sei verschickt.

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

      const requestBody = {
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: geminiTools,
        toolConfig: {
          functionCallingConfig: {
            mode: 'AUTO'  // AUTO statt ANY: Modell entscheidet selbst, ob ein Tool nötig ist (verhindert unnötige Extra-Calls -> weniger 429-Rate-Limit)
          }
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

      // Add function responses as user m
