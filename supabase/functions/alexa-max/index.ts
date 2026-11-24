// alexa-max – Alexa-Skill „Max“ für die Hausverwaltung (Supabase Edge Function, 24.11.2026)
//
// „Alexa, frag Max, wer diese Woche anreist.“
//
// Vorbild: Skill „Meine Heizung“ (Repo heizung-muenchen, alexa-heizung). Feste Fragen,
// Antwort direkt aus der Datenbank, KEINE KI im Ablauf – damit bleibt jede Antwort weit
// unter dem 8-Sekunden-Limit von Alexa. Konzept: docs/Konzept-Alexa-Skill-Max.md
//
// NUR LESEND: nur select, kein insert/update/delete, kein functions.invoke.
// Gastnamen immer über guests (guest_id), nie aus den Kopiespalten in bookings.
//
// Geheimnisse (Supabase → Edge Functions → Secrets):
//   ALEXA_SKILL_ID   Skill-ID aus der Alexa Developer Console (amzn1.ask.skill.…) – Pflicht
//   ALEXA_USER_IDS   optional: erlaubte Alexa-Benutzer, durch Komma getrennt
//                    (stehen nach „Alexa, öffne Max“ in den Logs als „Alexa-Benutzer: …“)
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.
//
// Bereitstellen OHNE JWT-Prüfung (Alexa schickt keinen Supabase-Token; config.toml):
//   supabase functions deploy alexa-max --no-verify-jwt --project-ref usblrulkcgucxtkhugck

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { checkCertUrl, checkSignature, checkTimestamp } from './verify.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const SKILL_ID = (Deno.env.get('ALEXA_SKILL_ID') ?? '').trim();
const USER_IDS = (Deno.env.get('ALEXA_USER_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const TZ = 'Europe/Vienna';
const WOCHE_TAGE = 7; // „diese Woche“ = heute plus sechs Tage (wie Standard der Morgen-Übersicht)

// ----------------------------------------------------------------- Datum & Sprache
const today = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: TZ }); // YYYY-MM-DD
const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
// Ortszeit → UTC-ISO, z. B. ('2026-11-24', '00:00')
function localToIso(date: string, time = '00:00'): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const asLocal = new Date(new Date(guess).toLocaleString('en-US', { timeZone: TZ })).getTime();
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(guess - (asLocal - asUtc)).toISOString();
}
// Wochentag + Datum; „heute“/„morgen“, wenn passend. Akzeptiert ISO-Zeitpunkt oder YYYY-MM-DD.
function tag(v: string): string {
  const ymd = v.length === 10 ? v : today(new Date(v));
  const t = today();
  if (ymd === t) return 'heute';
  if (ymd === addDays(t, 1)) return 'morgen';
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
const amTag = (v: string) => { const t = tag(v); return t === 'heute' || t === 'morgen' ? t : `am ${t}`; };
function uhr(time: string | null | undefined): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return m ? ` um ${h} Uhr ${m}` : ` um ${h} Uhr`;
}
const gast = (b: any) => b?.guests?.name?.trim() || 'ein Gast ohne Namen';
const haus = (row: any) => row?.houses?.name?.trim() || 'unbekanntes Haus';
const gaeste = (n: number | null | undefined) => (n ? `, ${n === 1 ? 'ein Gast' : `${n} Gäste`}` : '');
const liste = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs.at(-1)}`);
const anzahl = (n: number, eins: string, mehr: string) => (n === 1 ? `eine ${eins}` : `${n} ${mehr}`);

// ----------------------------------------------------------------- Haus aus dem Slot
type House = { id: string; name: string; rental_type: string };
let houseCache: { at: number; rows: House[] } | null = null;
async function houses(): Promise<House[]> {
  if (houseCache && Date.now() - houseCache.at < 5 * 60_000) return houseCache.rows;
  const { data, error } = await db.from('houses').select('id, name, rental_type');
  if (error) throw error;
  houseCache = { at: Date.now(), rows: (data ?? []) as House[] };
  return houseCache.rows;
}
const simple = (s: string) => s.toLowerCase().replace(/[^a-zäöüß ]/g, ' ').replace(/\s+/g, ' ').trim();

// Genanntes Haus finden („wald chalet“, „wald“, „venediger“). null = kein Haus genannt.
async function houseFromSlot(slot: any): Promise<House | 'unbekannt' | null> {
  const er = slot?.resolutions?.resolutionsPerAuthority?.find((a: any) => a.status?.code === 'ER_SUCCESS_MATCH');
  const said = simple(er?.values?.[0]?.value?.name ?? slot?.value ?? '');
  if (!said) return null;
  const rows = await houses();
  const hit = rows.find((h) => simple(h.name) === said)
    ?? rows.find((h) => simple(h.name).split(' ').some((w) => w.length >= 4 && said.includes(w)));
  return hit ?? 'unbekannt';
}
// Häuser, um die es geht: genanntes Haus, sonst alle touristischen.
async function scope(slot: any): Promise<{ ids: string[]; label: string; single?: House } | { error: string }> {
  const h = await houseFromSlot(slot);
  if (h === 'unbekannt') return { error: 'Das Haus kenne ich nicht. Sag zum Beispiel: im Wald Chalet.' };
  if (h) return { ids: [h.id], label: h.name.trim(), single: h };
  const tourist = (await houses()).filter((x) => x.rental_type === 'tourist');
  return { ids: tourist.map((x) => x.id), label: liste(tourist.map((x) => x.name.trim())) };
}

// ----------------------------------------------------------------- Abfragen (nur lesend)
const BOOKING = 'id, check_in, check_out, number_of_guests, house_id, houses!bookings_house_id_fkey(name), guests!bookings_guest_id_fkey(name)';

async function naechsteAnreise(ids: string[]) {
  const { data, error } = await db.from('bookings').select(BOOKING)
    .in('house_id', ids).neq('status', 'cancelled').gte('check_in', new Date().toISOString())
    .order('check_in', { ascending: true }).limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}
const naechsteSatz = (b: any, mitHaus = true) =>
  `Die nächste Anreise ist ${amTag(b.check_in)}: ${gast(b)}${mitHaus ? `, ${haus(b)}` : ''}${gaeste(b.number_of_guests)}.`;

// 1 – wer reist diese Woche an
async function anreisen(slots: any): Promise<Reply> {
  const s = await scope(slots.haus);
  if ('error' in s) return { text: s.error };
  const t = today();
  const { data, error } = await db.from('bookings').select(BOOKING)
    .in('house_id', s.ids).neq('status', 'cancelled')
    .gte('check_in', localToIso(t)).lt('check_in', localToIso(addDays(t, WOCHE_TAGE)))
    .order('check_in', { ascending: true });
  if (error) throw error;
  if (!data?.length) {
    const n = await naechsteAnreise(s.ids);
    return { text: `In den nächsten sieben Tagen reist niemand an${s.single ? ` im ${s.label}` : ''}. ${n ? naechsteSatz(n, !s.single) : 'Es ist auch keine spätere Anreise eingetragen.'}` };
  }
  const teile = data.map((b: any) => `${amTag(b.check_in)} ${gast(b)}${s.single ? '' : `, ${haus(b)}`}${gaeste(b.number_of_guests)}`);
  return { text: `In den nächsten sieben Tagen ${data.length === 1 ? 'reist eine Buchung' : `reisen ${data.length} Buchungen`} an: ${teile.join('; ')}.` };
}

// 1b – wann kommen die nächsten Gäste (ohne Zeitgrenze)
async function naechste(slots: any): Promise<Reply> {
  const s = await scope(slots.haus);
  if ('error' in s) return { text: s.error };
  const n = await naechsteAnreise(s.ids);
  return { text: n ? naechsteSatz(n, !s.single) : `Es ist keine Anreise eingetragen${s.single ? ` im ${s.label}` : ''}.` };
}

// 2 – wer ist gerade im Haus
async function imHaus(slots: any): Promise<Reply> {
  const s = await scope(slots.haus);
  if ('error' in s) return { text: s.error };
  const nowIso = new Date().toISOString();
  const { data, error } = await db.from('bookings').select(BOOKING)
    .in('house_id', s.ids).neq('status', 'cancelled').lte('check_in', nowIso).gt('check_out', nowIso);
  if (error) throw error;
  const rows = await houses();
  const saetze: string[] = [];
  for (const id of s.ids) {
    const name = rows.find((h) => h.id === id)?.name.trim() ?? 'Haus';
    const b = (data ?? []).find((x: any) => x.house_id === id);
    if (b) saetze.push(`Im ${name} ist gerade ${gast(b)}${gaeste(b.number_of_guests)}, Abreise ${tag(b.check_out)}.`);
    else {
      const n = await naechsteAnreise([id]);
      saetze.push(`Das ${name} ist gerade leer.${n ? ` ${naechsteSatz(n, false)}` : ''}`);
    }
  }
  return { text: saetze.join(' ') || 'Es ist kein Ferienhaus eingetragen.' };
}

// 3 – wann ist die nächste Reinigung
async function reinigung(slots: any): Promise<Reply> {
  const s = await scope(slots.haus);
  if ('error' in s) return { text: s.error };
  const { data, error } = await db.from('service_tasks')
    .select('scheduled_date, scheduled_time, status, house_id, houses!service_tasks_house_id_fkey(name)')
    .eq('service_type', 'cleaning').in('status', ['scheduled', 'draft']).in('house_id', s.ids)
    .gte('scheduled_date', today())
    .order('scheduled_date', { ascending: true }).order('scheduled_time', { ascending: true, nullsFirst: false }).limit(1);
  if (error) throw error;
  const r: any = data?.[0];
  if (!r) return { text: `Es ist keine Reinigung geplant${s.single ? ` im ${s.label}` : ''}.` };
  const entwurf = r.status === 'draft' ? ' Die ist aber erst ein Entwurf, noch nicht beauftragt.' : '';
  return { text: `Die nächste Reinigung ist ${amTag(r.scheduled_date)}${uhr(r.scheduled_time)}${s.single ? '' : ` im ${haus(r)}`}.${entwurf}` };
}

// 4 – ist die Wäsche bestätigt
// offen = noch nicht bestätigt (Uli prüft in der Wäschekarte), ausstehend = bestätigt und an Teuni,
// external_bestellnummer gesetzt = bei Teuni angekommen.
async function waesche(slots: any): Promise<Reply> {
  const s = await scope(slots.haus);
  if ('error' in s) return { text: s.error };
  const { data, error } = await db.from('linen_orders')
    .select('delivery_date, delivery_time, status, external_bestellnummer, house_id, houses!linen_orders_house_id_fkey(name), bookings!linen_orders_booking_id_fkey(guests!bookings_guest_id_fkey(name))')
    .in('status', ['offen', 'ausstehend']).in('house_id', s.ids).gte('delivery_date', today())
    .order('delivery_date', { ascending: true }).limit(50);
  if (error) throw error;
  if (!data?.length) return { text: `Es steht keine Wäschelieferung an${s.single ? ` im ${s.label}` : ''}.` };
  // die nächsten drei vorlesen, den Rest nur zählen
  const naechste3 = data.slice(0, 3);
  const rest = data.slice(3);
  const restOffen = rest.filter((o: any) => o.status === 'offen').length;
  const teile = naechste3.map((o: any) => {
    const stand = o.status === 'offen'
      ? 'noch nicht bestätigt'
      : o.external_bestellnummer ? 'bestätigt und bei Teuni angekommen' : 'bestätigt und an Teuni gegangen';
    const fuer = o.bookings?.guests?.name ? ` für ${o.bookings.guests.name.trim()}` : '';
    return `${amTag(o.delivery_date)}${s.single ? '' : `, ${haus(o)}`}${fuer}: ${stand}`;
  });
  const danach = rest.length
    ? ` Danach ${rest.length === 1 ? 'eine weitere' : `${rest.length} weitere`}${restOffen ? `, davon ${restOffen} noch nicht bestätigt` : ', alle bestätigt'}.`
    : '';
  const offen = data.some((o: any) => o.status === 'offen');
  const hinweis = offen ? ' Offene Bestellungen bitte in der Wäschekarte prüfen.' : '';
  const kopf = data.length === 1 ? 'Eine Wäschelieferung steht an' : `Die nächsten ${naechste3.length} Wäschelieferungen`;
  return { text: `${kopf}: ${teile.join('; ')}.${danach}${hinweis}` };
}

// 5 – gibt es offene Anfragen
async function anfragen(): Promise<Reply> {
  const { data, error } = await db.from('booking_inquiries')
    .select('created_at, check_in, guest_name, houses!booking_inquiries_house_id_fkey(name)')
    .eq('status', 'pending').order('created_at', { ascending: true });
  if (error) throw error;
  if (!data?.length) return { text: 'Es gibt keine offenen Anfragen.' };
  const a: any = data[0];
  const wer = a.guest_name?.trim() ? ` von ${a.guest_name.trim()}` : '';
  const wann = a.check_in ? ` für ${amTag(a.check_in).replace(/^am /, 'den ')}` : '';
  return { text: `Es gibt ${anzahl(data.length, 'offene Anfrage', 'offene Anfragen')}. ${data.length === 1 ? 'Sie' : 'Die älteste'} ist${wer}${wann}, ${haus(a)}, eingegangen ${amTag(a.created_at)}.` };
}

// 6 – was steht heute an
async function heute(slots: any): Promise<Reply> {
  const s = await scope(slots.haus);
  if ('error' in s) return { text: s.error };
  const t = today();
  const von = localToIso(t), bis = localToIso(addDays(t, 1));
  const [an, ab, rein, wae] = await Promise.all([
    db.from('bookings').select(BOOKING).in('house_id', s.ids).neq('status', 'cancelled').gte('check_in', von).lt('check_in', bis),
    db.from('bookings').select(BOOKING).in('house_id', s.ids).neq('status', 'cancelled').gte('check_out', von).lt('check_out', bis),
    db.from('service_tasks').select('scheduled_time, status, houses!service_tasks_house_id_fkey(name)')
      .eq('service_type', 'cleaning').in('status', ['scheduled', 'draft']).in('house_id', s.ids).eq('scheduled_date', t),
    db.from('linen_orders').select('delivery_time, status, houses!linen_orders_house_id_fkey(name)')
      .in('status', ['offen', 'ausstehend']).in('house_id', s.ids).eq('delivery_date', t),
  ]);
  for (const r of [an, ab, rein, wae]) if (r.error) throw r.error;
  const mitHaus = (row: any) => (s.single ? '' : ` im ${haus(row)}`);
  const teile = [
    ...(ab.data ?? []).map((b: any) => `Abreise von ${gast(b)}${mitHaus(b)}`),
    ...(rein.data ?? []).map((r: any) => `Reinigung${uhr(r.scheduled_time)}${mitHaus(r)}${r.status === 'draft' ? ', noch Entwurf' : ''}`),
    ...(wae.data ?? []).map((o: any) => `Wäschelieferung${uhr(o.delivery_time)}${mitHaus(o)}${o.status === 'offen' ? ', noch nicht bestätigt' : ''}`),
    ...(an.data ?? []).map((b: any) => `Anreise von ${gast(b)}${mitHaus(b)}${gaeste(b.number_of_guests)}`),
  ];
  if (teile.length) return { text: `Heute steht an: ${teile.join('; ')}.` };
  const n = await naechsteAnreise(s.ids);
  return { text: `Heute steht nichts an. ${n ? naechsteSatz(n, !s.single) : ''}`.trim() };
}

const HELP = 'Du kannst mich fragen: Wer reist diese Woche an? Wann kommen die nächsten Gäste? Wer ist gerade im Wald Chalet? '
  + 'Wann ist die nächste Reinigung? Ist die Wäsche bestätigt? Gibt es offene Anfragen? Oder: Was steht heute an?';

// ----------------------------------------------------------------- Antwort
type Reply = { text: string; end?: boolean };
function respond({ text, end = true }: Reply) {
  return Response.json({
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      card: { type: 'Simple', title: 'Max', content: text },
      ...(end ? {} : { reprompt: { outputSpeech: { type: 'PlainText', text: 'Was möchtest du wissen?' } } }),
      shouldEndSession: end,
    },
  });
}

// ----------------------------------------------------------------- Prüfung & Ablauf
let certCache: { url: string; pem: string; at: number } | null = null;
async function certChain(url: string): Promise<string> {
  if (certCache && certCache.url === url && Date.now() - certCache.at < 60 * 60_000) return certCache.pem;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Zertifikat nicht ladbar (${res.status})`);
  const pem = await res.text();
  certCache = { url, pem, at: Date.now() };
  return pem;
}

async function check(req: Request, raw: string, body: any): Promise<string | null> {
  if (!SKILL_ID) return 'ALEXA_SKILL_ID ist nicht gesetzt';
  const appId = body?.session?.application?.applicationId ?? body?.context?.System?.application?.applicationId;
  if (appId !== SKILL_ID) return `falsche Skill-ID ${appId}`;
  const tsErr = checkTimestamp(body?.request?.timestamp);
  if (tsErr) return tsErr;
  const user = body?.session?.user?.userId ?? body?.context?.System?.user?.userId;
  if (USER_IDS.length && !USER_IDS.includes(user)) return `unbekannter Benutzer ${user}`;
  const certUrl = req.headers.get('signaturecertchainurl') ?? '';
  const urlErr = checkCertUrl(certUrl);
  if (urlErr) return urlErr;
  return checkSignature(await certChain(certUrl), req.headers.get('signature-256') ?? '', raw);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Max – Alexa-Endpunkt der Hausverwaltung', { status: 200 });
  const raw = await req.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { return new Response('bad request', { status: 400 }); }

  let denied: string | null;
  try { denied = await check(req, raw, body); } catch (e) { denied = String(e); }
  if (denied) {
    console.warn('[alexa-max] abgelehnt:', denied);
    return new Response('bad request', { status: 400 });
  }

  const r = body.request;
  try {
    if (r.type === 'LaunchRequest') {
      // ID für ALEXA_USER_IDS – steht dann in den Function-Logs
      console.log('[alexa-max] Alexa-Benutzer:', body.session?.user?.userId);
      return respond({ text: `Hallo, hier ist Max. ${HELP}`, end: false });
    }
    if (r.type === 'SessionEndedRequest') return Response.json({ version: '1.0', response: {} });
    if (r.type !== 'IntentRequest') return respond({ text: 'Das habe ich nicht verstanden.' });

    const slots = r.intent?.slots ?? {};
    const started = Date.now();
    const out = await (async (): Promise<Reply> => {
      switch (r.intent?.name) {
        case 'AnreisenIntent': return anreisen(slots);
        case 'NaechsteAnreiseIntent': return naechste(slots);
        case 'ImHausIntent': return imHaus(slots);
        case 'ReinigungIntent': return reinigung(slots);
        case 'WaescheIntent': return waesche(slots);
        case 'AnfragenIntent': return anfragen();
        case 'HeuteIntent': return heute(slots);
        case 'AMAZON.HelpIntent': return { text: HELP, end: false };
        case 'AMAZON.CancelIntent':
        case 'AMAZON.StopIntent': return { text: 'Okay.' };
        default: return { text: `Das kann ich noch nicht. ${HELP}`, end: false };
      }
    })();
    console.log(`[alexa-max] ${r.intent?.name} ${Date.now() - started} ms`);
    return respond(out);
  } catch (e) {
    console.error('[alexa-max]', e);
    return respond({ text: 'Da ist etwas schiefgegangen. Ich komme gerade nicht an die Daten der Hausverwaltung.' });
  }
});
