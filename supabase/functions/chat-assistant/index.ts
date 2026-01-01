import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      cleaning_staff(name, email, phone)
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
  if (params.staff_name) {
    filteredData = filteredData.filter(t => 
      t.cleaning_staff?.name?.toLowerCase().includes(params.staff_name.toLowerCase())
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
    .select('*, houses(name), bookings(guest_name)')
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
  
  const { data, error } = await query.limit(params.limit || 20);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true, data, count: data?.length || 0 };
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
    case 'get_calendar_events':
      return await executeGetCalendarEvents(args);
    
    default:
      console.warn(`Unknown tool: ${toolName}`);
      return { success: false, error: `Tool ${toolName} nicht implementiert` };
  }
}

// ==================== MAIN SERVE FUNCTION ====================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
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
    
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];

    // System prompt
    const systemPrompt = `Du bist ein Datenbank-Assistent für eine Ferienhaus-Verwaltungssoftware.

📅 AKTUELLES DATUM:
Heute ist: ${berlinTime}
ISO-Datum: ${currentDate}
Morgen: ${tomorrowDate}

⛔ KRITISCHE REGEL ⛔
Du MUSST für JEDE Anfrage ein Tool verwenden! 
Du darfst NIEMALS direkt antworten ohne Tool-Call!

🔍 TOOL-AUSWAHL:

📥 BUCHUNGSANFRAGEN:
- "anfragen" / "offene anfragen" / "buchungsanfragen" / "gibt es anfragen" → search_booking_inquiries mit status="pending"
- "anfrage annehmen" / "bestätigen" + Name/ID → accept_booking_inquiry
- "anfrage ablehnen" / "stornieren" + Name/ID → reject_booking_inquiry

🔄 BULK-AKTIONEN:
- "erstelle reinigung für alle" / "morgige abreisen" / "check-outs heute" → create_bulk_cleaning_tasks
  Beispiel: "Erstelle Reinigung für alle morgigen Abreisen" → create_bulk_cleaning_tasks({ for_date: "tomorrow", trigger: "checkout" })
- "wäsche für alle buchungen" → create_bulk_linen_orders

📅 BUCHUNGEN:
- "buchung" / Gastname → search_bookings
- "familien" / "mit kindern" → search_bookings mit has_children=true (WICHTIG!)
- "wer kommt morgen" → search_bookings mit check_in_date="${tomorrowDate}"
- "wer checkt morgen aus" → search_bookings mit check_out_date="${tomorrowDate}"
- "kommende buchungen" → search_bookings mit upcoming_only=true

🧹 REINIGUNG: "reinigung" / "putzen" → search_cleaning_tasks
🏠 HÄUSER: "haus" / "chalet" → search_houses
👥 GÄSTE: "gast" / "gäste" → search_guests
🧺 WÄSCHE: "wäsche" / "linen" → get_linen_overview oder search_linen_orders
📊 STATISTIKEN: "übersicht" / "dashboard" → get_dashboard_stats
📅 KALENDER: "kalender" / "termine" → get_calendar_events

💡 KRITISCHE FILTER-KOMBINATIONEN:
Beispiel: "Haben wir nächste Woche Buchungen mit Kindern?"
✅ KORREKT: search_bookings({ "has_children": true, "date_from": "[Montag]", "date_to": "[Sonntag]" })
❌ FALSCH: search_bookings ohne has_children Parameter

ANTWORT-FORMATE:

**Buchungsanfragen:**
"📥 Ich habe [X] offene Buchungsanfrage(n) gefunden:

📝 ANFRAGE 1:
• Gast: [name] ([email])
• Haus: [house_name]
• Zeitraum: [check_in] - [check_out]
• Gäste: [number] Personen
• Geschätzter Betrag: [amount] EUR
• Nachricht: [message]

Möchtest du diese Anfrage bestätigen oder ablehnen?"

**Bulk-Aktion:**
"✅ Bulk-Aktion ausgeführt!

📋 REINIGUNGEN ERSTELLT: [X]
• [Haus]: Reinigung am [Datum] für [Gast]

⏭️ ÜBERSPRUNGEN: [Y] (bereits vorhanden)"

**Buchungen:**
"Ich habe [X] Buchung(en) gefunden:
• Gast: [Name]
• Check-in: [Datum]
• Check-out: [Datum]
• Gäste: [Anzahl] 
• Status: [Status]
• Haus: [Hausname]"

Du antwortest auf Deutsch. WICHTIG: ERST Tool aufrufen, DANN antworten!`;

    // Define available tools
    const tools = [
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
              status: { type: "string", enum: ["confirmed", "cancelled", "completed"], description: "Buchungsstatus" },
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
              status: { type: "string", enum: ["scheduled", "in_progress", "completed", "cancelled"] },
              house_id: { type: "string" },
              date_from: { type: "string" },
              date_to: { type: "string" },
              guest_name: { type: "string" },
              staff_name: { type: "string" },
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
          description: "Sucht Wäschebestellungen",
          parameters: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["offen", "bestätigt", "geliefert", "storniert"] },
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
      }
    ];

    // Build messages for API
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role, content: m.content }))
    ];

    // Tool-calling loop
    let iteration = 0;
    const maxIterations = 5;
    let toolResults: any[] = [];
    
    while (iteration < maxIterations) {
      iteration++;
      console.log(`Tool-calling iteration ${iteration}`);
      
      // Call AI
      const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: apiMessages,
          tools,
          tool_choice: iteration === 1 ? 'required' : 'auto'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API error:', errorText);
        throw new Error(`AI API error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage = data.choices[0].message;
      
      console.log('AI response:', { 
        finish_reason: data.choices[0].finish_reason,
        has_tool_calls: !!assistantMessage.tool_calls,
        tool_count: assistantMessage.tool_calls?.length || 0
      });

      // If no tool calls, we're done
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        if (iteration === 1) {
          // Force tool usage on first iteration
          console.log('AI tried to answer without tool call in first iteration - forcing tool usage');
          apiMessages.push({
            role: 'user',
            content: 'Du MUSST ein Tool verwenden um diese Frage zu beantworten. Bitte rufe das passende Tool auf.'
          });
          continue;
        }
        
        // Return final response
        console.log('No more tool calls, preparing final response');
        const finalContent = assistantMessage.content || 'Ich konnte keine passende Antwort generieren.';
        console.log('Final response received:', { textLength: finalContent.length });
        
        return new Response(
          JSON.stringify({ response: finalContent, toolResults }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Process tool calls
      apiMessages.push(assistantMessage);
      
      console.log('Processing tool calls:', assistantMessage.tool_calls.map((t: any) => t.function.name));
      
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');
        
        console.log(`Executing tool: ${toolName}`, args);
        
        const result = await executeTool(toolName, args);
        
        console.log(`Tool result for ${toolName}:`, { 
          success: result.success, 
          dataCount: result.data?.length || result.count || 0,
          error: result.error
        });
        
        toolResults.push({ tool: toolName, args, result });
        
        apiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }
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
