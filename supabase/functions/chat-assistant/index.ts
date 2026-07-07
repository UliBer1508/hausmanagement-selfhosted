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
ob sie schon geliefert ist oder nicht.`;

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
