import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

type FeeMode = 'flat' | 'per_person';
interface FeeItem { mode: FeeMode; amount: number }

function readFeeItem(fees: any, key: string, legacyKey: string, legacyDivisor = 1): FeeItem {
  const v = fees?.[key];
  if (v && typeof v === 'object' && 'amount' in v) {
    return { mode: v.mode === 'per_person' ? 'per_person' : 'flat', amount: Number(v.amount) || 0 };
  }
  const legacy = Number(fees?.[legacyKey]) || 0;
  return { mode: 'flat', amount: legacy };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { booking_id, old_guests, new_guests, old_nights, new_nights } = await req.json();

    if (!booking_id || typeof new_guests !== 'number' || typeof new_nights !== 'number') {
      return new Response(JSON.stringify({ error: 'Invalid input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: booking, error: bErr } = await supabase
      .from('bookings').select('id, house_id').eq('id', booking_id).maybeSingle();
    if (bErr || !booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: house, error: hErr } = await supabase
      .from('houses').select('id, additional_fees').eq('id', booking.house_id).maybeSingle();
    if (hErr || !house) {
      return new Response(JSON.stringify({ error: 'House not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const delta = Number(new_guests) - Number(old_guests || 0);
    const charges: any[] = [];

    if (delta > 0) {
      const fees = house.additional_fees || {};
      const linen = readFeeItem(fees, 'linen_fee', 'linen_fee_per_stay');
      const tax = readFeeItem(fees, 'tourist_tax', 'tourist_tax_per_night');

      if (linen.mode === 'per_person' && linen.amount > 0) {
        const amount = round2(delta * linen.amount);
        charges.push({
          booking_id, house_id: house.id,
          charge_type: 'linen',
          description: `${delta} zusätzliche Person${delta > 1 ? 'en' : ''}: Wäsche-Pauschale`,
          quantity: delta,
          unit_amount: round2(linen.amount),
          amount,
          status: 'open',
          origin: 'auto_delta',
        });
      }

      if (tax.mode === 'per_person' && tax.amount > 0 && new_nights > 0) {
        const qty = delta * Number(new_nights);
        const amount = round2(qty * tax.amount);
        charges.push({
          booking_id, house_id: house.id,
          charge_type: 'tourist_tax',
          description: `${delta} zusätzliche Person${delta > 1 ? 'en' : ''}: Ortstaxe ${new_nights} Nächte`,
          quantity: qty,
          unit_amount: round2(tax.amount),
          amount,
          status: 'open',
          origin: 'auto_delta',
        });
      }
    }

    let inserted: any[] = [];
    if (charges.length > 0) {
      const { data, error } = await supabase.from('booking_charges').insert(charges).select();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      inserted = data || [];
    }

    const total_amount = round2(inserted.reduce((s, c) => s + Number(c.amount || 0), 0));

    return new Response(JSON.stringify({ charges: inserted, total_amount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});