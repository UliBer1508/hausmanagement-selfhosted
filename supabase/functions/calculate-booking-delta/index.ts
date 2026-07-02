import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

type FeeMode = 'flat' | 'per_person';
interface FeeItem { mode: FeeMode; amount: number }

function readFeeItem(fees: any, key: string, legacyKey: string): FeeItem {
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
    // baseline_guests = die urspruenglich GEBUCHTE Personenzahl (nicht ein Zwischenstand).
    // new_guests      = die jetzt eingestellte Personenzahl.
    // persist=false   => nur rechnen und zurueckgeben (Vorschau, korrigierbar).
    // persist=true    => die (ggf. vom Nutzer korrigierten) charges wirklich anlegen.
    const {
      booking_id,
      baseline_guests,
      new_guests,
      new_nights,
      persist = false,
      charges: incomingCharges,
    } = await req.json();

    if (!booking_id) {
      return new Response(JSON.stringify({ error: 'booking_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // --- PERSIST-Zweig: vom Client bestaetigte (evtl. korrigierte) charges anlegen ---
    if (persist === true) {
      if (!Array.isArray(incomingCharges) || incomingCharges.length === 0) {
        return new Response(JSON.stringify({ error: 'No charges to persist' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Nur bekannte Felder uebernehmen (kein Vertrauen auf Client-Status/-Herkunft)
      const rows = incomingCharges
        .map((c: any) => ({
          booking_id,
          house_id: c.house_id ?? null,
          charge_type: String(c.charge_type || 'other'),
          description: String(c.description || 'Zusatzforderung'),
          quantity: Number(c.quantity) || 1,
          unit_amount: round2(Number(c.unit_amount) || 0),
          amount: round2(Number(c.amount) || 0),
          status: 'open',
          origin: 'auto_delta',
        }))
        .filter((r) => r.amount > 0);

      if (rows.length === 0) {
        return new Response(JSON.stringify({ charges: [], total_amount: 0 }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase.from('booking_charges').insert(rows).select();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const total_amount = round2((data || []).reduce((s, c) => s + Number(c.amount || 0), 0));
      return new Response(JSON.stringify({ charges: data || [], total_amount, persisted: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- RECHNEN-Zweig (persist=false): nur Vorschau, nichts wird geschrieben ---
    if (typeof new_guests !== 'number' || typeof new_nights !== 'number') {
      return new Response(JSON.stringify({ error: 'Invalid input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // Delta gegen die GEBUCHTE Ausgangszahl. Fehlt sie, kein Delta (statt Fantasiewert).
    const base = Number(baseline_guests);
    const delta = Number.isFinite(base) ? Number(new_guests) - base : 0;
    const charges: any[] = [];

    if (delta > 0) {
      const fees = house.additional_fees || {};
      const linen = readFeeItem(fees, 'linen_fee', 'linen_fee_per_stay');
      const tax = readFeeItem(fees, 'tourist_tax', 'tourist_tax_per_night');

      if (linen.mode === 'per_person' && linen.amount > 0) {
        charges.push({
          booking_id, house_id: house.id,
          charge_type: 'linen',
          description: `${delta} zusätzliche Person${delta > 1 ? 'en' : ''}: Bettwäsche / ${delta} additional guest${delta > 1 ? 's' : ''}: bed linen`,
          quantity: delta,
          unit_amount: round2(linen.amount),
          amount: round2(delta * linen.amount),
          status: 'open',
          origin: 'auto_delta',
        });
      }

      if (tax.mode === 'per_person' && tax.amount > 0 && new_nights > 0) {
        const qty = delta * Number(new_nights);
        charges.push({
          booking_id, house_id: house.id,
          charge_type: 'tourist_tax',
          description: `${delta} zusätzliche Person${delta > 1 ? 'en' : ''}: Ortstaxe (${new_nights} Nächte) / ${delta} additional guest${delta > 1 ? 's' : ''}: city tax (${new_nights} nights)`,
          quantity: qty,
          unit_amount: round2(tax.amount),
          amount: round2(qty * tax.amount),
          status: 'open',
          origin: 'auto_delta',
        });
      }
    }

    const total_amount = round2(charges.reduce((s, c) => s + Number(c.amount || 0), 0));

    // Vorschau: charges tragen bewusst KEINE id (noch nicht in der DB).
    return new Response(JSON.stringify({ charges, total_amount, persisted: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
