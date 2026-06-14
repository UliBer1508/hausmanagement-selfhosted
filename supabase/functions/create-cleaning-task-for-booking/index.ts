import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { booking_id } = await req.json();
    
    console.log('🧹 CREATE CLEANING TASK - START');
    console.log('Booking ID:', booking_id);

    if (!booking_id) {
      throw new Error('booking_id is required');
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Load automation settings
    console.log('📋 Loading automation settings...');
    const { data: settings, error: settingsError } = await supabase
      .from('cleaning_automation_settings')
      .select('*')
      .single();

    if (settingsError) {
      console.error('❌ Error loading automation settings:', settingsError);
      throw new Error('Failed to load automation settings');
    }

    console.log('✅ Automation settings loaded:', settings);

    // Check if automation is enabled
    if (!settings.is_enabled) {
      console.log('⚠️ Automation is disabled');
      return new Response(
        JSON.stringify({
          success: true,
          task_created: false,
          message: 'Automatisierung ist deaktiviert. Reinigung wurde nicht erstellt.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Load booking data with house and guest information
    console.log('📋 Loading booking data...');
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        house_id,
        guest_name,
        number_of_guests,
        check_in,
        check_out,
        houses (
          id,
          name,
          default_cleaning_hours
        ),
        guests!bookings_guest_id_fkey (
          name
        )
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      console.error('❌ Error loading booking:', bookingError);
      throw new Error('Booking not found');
    }

    console.log('✅ Booking loaded:', booking);

    // 3. Load provider information
    console.log('📋 Loading provider...');
    const { data: provider, error: providerError } = await supabase
      .from('service_providers')
      .select('id, name, hourly_rate')
      .eq('id', settings.default_provider_id)
      .single();

    if (providerError || !provider) {
      console.error('❌ Error loading provider:', providerError);
      throw new Error('Provider not found');
    }

    console.log('✅ Provider loaded:', provider);

    // 4. Calculate scheduled date based on schedule_timing
    let scheduledDate: string;
    if (settings.schedule_timing === 'on_checkin') {
      scheduledDate = booking.check_in;
      console.log('📅 Scheduled for check-in:', scheduledDate);
    } else {
      // on_checkout
      scheduledDate = booking.check_out;
      console.log('📅 Scheduled for check-out:', scheduledDate);
    }

    // 5. Calculate cost
    const defaultHours = booking.houses?.default_cleaning_hours || 3;
    const hourlyRate = provider.hourly_rate || 50;
    const estimatedCost = defaultHours * hourlyRate;

    console.log('💰 Cost calculation:');
    console.log('  Hours:', defaultHours);
    console.log('  Rate:', hourlyRate);
    console.log('  Total:', estimatedCost);

    // 6. Create service task
    // Nutze guests-Relation falls verfügbar, sonst Legacy-Feld
    const guestName = (booking as any).guests?.name || booking.guest_name;
    
    console.log('📝 Creating service task...');
    const scheduledTime = settings.default_time.substring(0, 5); // Extract HH:MM

    const { data: serviceTask, error: taskError } = await supabase
      .from('service_tasks')
      .insert({
        booking_id: booking.id,
        house_id: booking.house_id,
        service_type: 'cleaning',
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        cleaning_hours: defaultHours,
        cleaning_cost: estimatedCost,
        provider_id: settings.default_provider_id,
        status: 'draft',
        notes: `Automatisch erstellt für Buchung von ${guestName} - Bitte prüfen`,
      })
      .select()
      .single();

    if (taskError) {
      console.error('❌ Error creating service task:', taskError);
      throw new Error('Failed to create cleaning task');
    }

    console.log('✅ Service task created:', serviceTask);

    // Standard-Reinigungskraft Amela zuweisen, falls vorhanden
    try {
      const { data: amela } = await supabase
        .from('cleaning_staff')
        .select('id')
        .ilike('name', 'Amela')
        .eq('is_active', true)
        .maybeSingle();

      if (amela?.id) {
        const { error: assignErr } = await supabase
          .from('cleaning_assignments')
          .insert({
            service_task_id: serviceTask.id,
            cleaning_staff_id: amela.id,
            status: 'assigned',
          });
        if (assignErr) {
          console.error('⚠️ Konnte Amela nicht zuweisen:', assignErr);
        } else {
          console.log('✅ Amela als Standard-Reinigungskraft zugewiesen');
        }
      } else {
        console.log('ℹ️ Amela nicht gefunden - keine Standardzuweisung');
      }
    } catch (assignError) {
      console.error('⚠️ Fehler bei Standard-Zuweisung:', assignError);
    }

    // Format date for response
    const dateObj = new Date(scheduledDate);
    const formattedDate = dateObj.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    return new Response(
      JSON.stringify({
        success: true,
        task_created: true,
        scheduled_date: formattedDate,
        scheduled_time: scheduledTime,
        estimated_cost: estimatedCost,
        provider_name: provider.name,
        house_name: booking.houses?.name,
        service_task_id: serviceTask.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ ERROR in create-cleaning-task-for-booking:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An error occurred',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
