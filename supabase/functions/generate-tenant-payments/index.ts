import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RentChange {
  effective_date: string;
  new_rent: number;
  new_additional_costs: number | null;
}

// Soll-Warmmiete zu einem Stichtag — gleiche Logik wie getActiveRent /
// getActiveAdditionalCosts in src/hooks/useTenantRentChanges.ts und der
// Soll-Berechnung in src/components/Tenants/TenantPayments.tsx:
// letzte Mietänderung mit effective_date <= Stichtag gewinnt, sonst Basiswert.
function getWarmRentForDate(
  rentChanges: RentChange[],
  baseRent: number,
  baseAdditionalCosts: number,
  dateStr: string,
): number {
  const applicable = rentChanges
    .filter(rc => rc.effective_date <= dateStr)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))
  const rent = applicable[0] ? Number(applicable[0].new_rent) : baseRent
  const withCosts = applicable.find(rc => rc.new_additional_costs !== null && rc.new_additional_costs !== undefined)
  const additional = withCosts ? Number(withCosts.new_additional_costs) : baseAdditionalCosts
  return rent + additional
}

interface TenantInfo {
  tenant_name?: string;
  tenant_email?: string;
  tenant_phone?: string;
  contract_start?: string;
  contract_end?: string | null; // leer/null = UNBEFRISTET (so im ganzen Modul, z. B. TenantContracts.tsx)
  monthly_rent?: number;       // KALTMIETE (Basis, ohne Mietänderungen)
  additional_costs?: number;   // Nebenkosten-Vorauszahlung (Basis)
  deposit_amount?: number;
  payment_day?: number;
  payment_method?: 'bank_transfer' | 'cash' | 'direct_debit';
  notes?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  console.log('🕐 Tenant payment generation started')

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. SCHNELLER EXIT: Ist heute ein Zahltag?
    const today = new Date()
    const todayDay = today.getDate() // 1-31

    console.log(`📅 Today is day ${todayDay} of the month`)

    // 2. Lade NUR Häuser mit rental_type='long_term' UND tenant_info vorhanden
    const { data: houses, error: housesError } = await supabase
      .from('houses')
      .select('id, name, tenant_info')
      .eq('rental_type', 'long_term')
      .not('tenant_info', 'is', null)

    if (housesError) throw housesError
    if (!houses || houses.length === 0) {
      console.log('ℹ️ No long-term rental houses found')
      return new Response(
        JSON.stringify({ 
          success: true, 
          payments_created: 0, 
          reason: 'no_houses',
          execution_time_ms: Date.now() - startTime 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Filter: Nur Häuser mit payment_day = heute
    const relevantHouses = houses.filter(h => {
      const tenantInfo = h.tenant_info as TenantInfo
      return tenantInfo?.payment_day === todayDay
    })

    if (relevantHouses.length === 0) {
      console.log(`⏭️ No houses with payment_day = ${todayDay}. Skipping.`)
      return new Response(
        JSON.stringify({ 
          success: true, 
          payments_created: 0, 
          reason: 'no_matching_payment_day',
          checked_houses: houses.length,
          execution_time_ms: Date.now() - startTime 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ Found ${relevantHouses.length} houses with payment_day = ${todayDay}`)

    // 4. Für jedes relevante Haus: Zahlung erstellen
    const results = []
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString()

    for (const house of relevantHouses) {
      const tenantInfo = house.tenant_info as TenantInfo

      // Validierung: Vertragsdaten vorhanden?
      // contract_end ist KEIN Pflichtfeld: fehlt es, ist der Vertrag unbefristet.
      // (Bis 28.09.2026 wurde hier auch contract_end verlangt — dadurch wurden alle
      //  unbefristeten Verträge still übersprungen und nie eine Zahlung angelegt.)
      if (!tenantInfo.contract_start || !tenantInfo.monthly_rent) {
        console.log(`⚠️ Skipping ${house.name}: Missing contract data`)
        results.push({
          house_id: house.id,
          house_name: house.name,
          status: 'skipped',
          reason: 'incomplete_contract_data'
        })
        continue
      }

      // Validierung: Vertrag aktiv?
      const contractStart = new Date(tenantInfo.contract_start)
      const contractEnd = tenantInfo.contract_end ? new Date(tenantInfo.contract_end) : null
      if (today < contractStart || (contractEnd && today > contractEnd)) {
        console.log(`⚠️ Skipping ${house.name}: Contract not active (${tenantInfo.contract_start} - ${tenantInfo.contract_end || 'unbefristet'})`)
        results.push({
          house_id: house.id,
          house_name: house.name,
          status: 'skipped',
          reason: 'contract_not_active'
        })
        continue
      }

      // Prüfe ob bereits Zahlung für diesen Monat existiert
      const { data: existingPayments } = await supabase
        .from('tenant_payments')
        .select('id, due_date, status')
        .eq('house_id', house.id)
        .gte('due_date', startOfMonth)
        .lt('due_date', endOfMonth)

      if (existingPayments && existingPayments.length > 0) {
        console.log(`⏭️ Skipping ${house.name}: Payment already exists for this month`)
        results.push({
          house_id: house.id,
          house_name: house.name,
          status: 'skipped',
          reason: 'payment_already_exists',
          existing_payment: existingPayments[0]
        })
        continue
      }

      // Berechne Fälligkeitsdatum
      const dueDate = new Date(today.getFullYear(), today.getMonth(), todayDay)
      const dueDateStr = dueDate.toISOString().split('T')[0]

      // Soll-Warmmiete zum Fälligkeitsdatum inkl. Mietänderungen ermitteln.
      // (Früher wurde hier nur tenant_info.monthly_rent eingetragen — Mieterhöhungen
      //  aus tenant_rent_changes und die Nebenkosten fehlten.)
      const { data: rentChanges, error: rentChangesError } = await supabase
        .from('tenant_rent_changes')
        .select('effective_date, new_rent, new_additional_costs')
        .eq('house_id', house.id)

      if (rentChangesError) {
        console.error(`❌ Error loading rent changes for ${house.name}:`, rentChangesError)
        results.push({
          house_id: house.id,
          house_name: house.name,
          status: 'error',
          error: rentChangesError.message
        })
        continue
      }

      const amount = getWarmRentForDate(
        (rentChanges || []) as RentChange[],
        tenantInfo.monthly_rent,
        tenantInfo.additional_costs || 0,
        dueDateStr,
      )

      // Erstelle neue Zahlung
      const { data: newPayment, error: insertError } = await supabase
        .from('tenant_payments')
        .insert({
          house_id: house.id,
          due_date: dueDateStr,
          amount,
          status: 'pending',
          payment_method: tenantInfo.payment_method || 'bank_transfer',
          notes: `Automatisch generiert am ${today.toISOString().split('T')[0]}`
        })
        .select()
        .single()

      if (insertError) {
        console.error(`❌ Error creating payment for ${house.name}:`, insertError)
        results.push({
          house_id: house.id,
          house_name: house.name,
          status: 'error',
          error: insertError.message
        })
        continue
      }

      console.log(`✅ Created payment for ${house.name}: ${amount} EUR due ${dueDateStr}`)
      results.push({
        house_id: house.id,
        house_name: house.name,
        status: 'created',
        payment_id: newPayment.id,
        due_date: dueDateStr,
        amount
      })
    }

    const paymentsCreated = results.filter(r => r.status === 'created').length
    const executionTime = Date.now() - startTime

    console.log(`🎉 Done! Created ${paymentsCreated} payments in ${executionTime}ms`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        payments_created: paymentsCreated,
        houses_checked: relevantHouses.length,
        execution_time_ms: executionTime,
        details: results
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('❌ Error in generate-tenant-payments:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        execution_time_ms: Date.now() - startTime 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
