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
    /*
     * Der Aufrufer übergibt NUR die booking_id.
     *
     * Gästezahl, gebuchte Ausgangszahl und Nächte werden unten aus der
     * Buchung gelesen. Sie früher vom Client entgegenzunehmen war die
     * Ursache der Fehlberechnung bei Tal Yehuda (siehe Kommentar im
     * Rechen-Zweig).
     *
     * persist=false => nur rechnen und zurueckgeben (Vorschau, korrigierbar).
     * persist=true  => die (ggf. vom Nutzer korrigierten) charges anlegen.
     */
    const {
      booking_id,
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
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('id, house_id, booked_guests, number_of_guests, check_in, check_out')
      .eq('id', booking_id)
      .maybeSingle();
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

    /*
     * ALLE Rechengrößen kommen aus der DATENBANK.
     *
     * Bis 08.09.2026 schickte der Client `baseline_guests`, `new_guests` und
     * `new_nights` mit, und die Funktion rechnete damit. Der Client bildete
     * die Ausgangszahl aus
     * `initialData.booked_guests ?? initialData.number_of_guests ?? 0` —
     * enthielt das Buchungsobjekt, mit dem der Dialog geöffnet wurde, keines
     * von beiden, landete dort eine 0. Die Rückfrage erschien trotzdem
     * (7 > 0), gerechnet wurde gegen null Personen.
     *
     * Fall Tal Yehuda: `booked_guests = 6` stand korrekt in der Datenbank,
     * gerechnet wurde dreimal mit 7 zusätzlichen Personen. 49 statt 7
     * Ortstaxe-Einheiten, 122,50 und 137,20 EUR statt 19,60 EUR.
     *
     * Welche Abfrage im Frontend welche Spalte mitlädt, darf über einen
     * Geldbetrag nicht entscheiden. Es gibt genau eine Quelle: die Buchung.
     * Der Aufrufer übergibt nur noch die `booking_id`.
     *
     * Voraussetzung: die Buchung ist zum Zeitpunkt des Aufrufs bereits
     * gespeichert. Das ist im Ablauf so festgelegt — Schritt 1 ändert die
     * Gästezahl, Schritt 2 berechnet
     * (docs/Prozess-Gaestezahl-Aenderung.md).
     */
    const new_guests = Number(booking.number_of_guests);

    const msPerDay = 1000 * 60 * 60 * 24;
    const new_nights =
      booking.check_in && booking.check_out
        ? Math.max(0, Math.round(
            (new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime()) / msPerDay,
          ))
        : 0;

    /*
     * ACHTUNG `Number(null)` ergibt 0, und 0 ist finit — die frühere Prüfung
     * `Number.isFinite(base)` fing einen fehlenden Wert deshalb NICHT ab.
     * Eine unbekannte Ausgangszahl muss zu KEINEM Delta führen, nicht zum
     * größtmöglichen. Eine Buchung mit null Gästen gibt es nicht.
     */
    const base =
      booking.booked_guests === null || booking.booked_guests === undefined
        ? null
        : Number(booking.booked_guests);

    if (base === null || !Number.isFinite(base) || base <= 0) {
      console.warn('⚠️ Keine Ausgangs-Gästezahl in der Buchung', {
        booking_id, booked_guests: booking.booked_guests,
      });
      return new Response(JSON.stringify({
        charges: [],
        total_amount: 0,
        persisted: false,
        warnung:
          'In der Buchung ist keine ursprünglich gebuchte Gästezahl hinterlegt (booked_guests). ' +
          'Ohne sie lässt sich nicht bestimmen, wie viele Personen hinzugekommen sind. ' +
          'Bitte den Wert in der Buchung setzen und erneut versuchen.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    if (!Number.isFinite(new_guests) || new_guests <= 0) {
      return new Response(JSON.stringify({ error: 'Booking has no guest count' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const delta = new_guests - base;
    const charges: any[] = [];

    /*
     * Schon einmal berechnet?
     *
     * Der Persist-Zweig prüfte nichts, deshalb legte jeder weitere Durchlauf
     * dieselben Posten erneut an. Bei Tal Yehuda entstanden so zwei
     * Ortstaxe-Forderungen für dieselbe eine Zusatzperson, am 01.09. mit
     * einem Satz von 2,50 und am 06.09. mit 2,80.
     *
     * Gemeldet wird das nur — geblockt wird nicht. Es gibt berechtigte Fälle
     * (erst eine Person mehr, später noch eine). Die Entscheidung bleibt bei
     * Uli, aber er sieht jetzt, was schon da ist.
     */
    const { data: vorhandene } = await supabase
      .from('booking_charges')
      .select('id, charge_type, description, amount, status, created_at')
      .eq('booking_id', booking_id)
      .eq('origin', 'auto_delta')
      .neq('status', 'cancelled');

    const bereitsBerechnet = (vorhandene ?? []).map((c: any) => ({
      charge_type: c.charge_type,
      description: c.description,
      amount: Number(c.amount),
      status: c.status,
      created_at: c.created_at,
    }));

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
    // `baseline_verwendet` und `delta` gehen mit zurück, damit im Dialog
    // sichtbar ist, GEGEN WAS gerechnet wurde — der stille Rechenweg war
    // der Grund, warum die Fehlberechnung dreimal unbemerkt blieb.
    return new Response(JSON.stringify({
      charges,
      total_amount,
      persisted: false,
      baseline_verwendet: base,
      neue_gaestezahl: new_guests,
      naechte: new_nights,
      delta,
      bereits_berechnet: bereitsBerechnet,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
