import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// morning-summary — Serverseitige Tagesübersicht ("Max, was steht heute an?")
// ============================================================
//
// Diese Funktion ist die EINZIGE Quelle der Wahrheit für die Morgen-Übersicht.
// Die Sammel- und Formatier-Logik ist 1:1 aus dem Frontend-Hook
// src/hooks/useMorningSummary.ts portiert, damit die Übersicht identisch bleibt.
//
// Zwei Betriebsarten (über den Request-Body gesteuert):
//   - Abruf (Standard, deliver=false): gibt die Zusammenfassung zurück, sendet NICHTS.
//   - Proaktiv (deliver=true): erstellt die Übersicht UND stellt sie zu (E-Mail).
//
// SICHERHEIT:
//   - Standard ist Abruf. Senden nur bei explizitem { "deliver": true }.
//   - Proaktives Senden zusätzlich nur, wenn morning_summary_settings.enabled = true.
//   - Keine Gästedaten in Logs.

// ---- Status-Konstanten (aus src/lib/linenOrderHelpers.ts) ----
const LINEN_STATUS_OFFEN = 'offen';
const LINEN_STATUS_AUSSTEHEND = 'ausstehend';
const ACTIVE_LINEN_ORDER_STATUSES = [LINEN_STATUS_OFFEN, LINEN_STATUS_AUSSTEHEND];

const translateLinenOrderStatus = (status: string): string => {
  const translations: Record<string, string> = {
    offen: 'Offen',
    ausstehend: 'Ausstehend',
    delivered: 'Geliefert',
    cancelled: 'Storniert',
  };
  return translations[status] || status;
};

// ---- Rating-Reminder-Defaults (aus useSystemSettings) ----
const DEFAULT_RATING_REMINDER_SETTINGS = {
  is_enabled: true,
  min_days_after_checkout: 3,
  max_days_after_checkout: 14,
  require_platform: false,
  rental_type_filter: 'all' as string,
};

// ---- Datums-Helfer (Ersatz für date-fns, deutsche Formatierung) ----
const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const pad = (n: number) => String(n).padStart(2, '0');

// Entspricht format(date, 'yyyy-MM-dd')
const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Entspricht format(date, 'dd.MM.yyyy')
const formatDE = (d: Date): string =>
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

// Entspricht format(date, 'HH:mm')
const formatTime = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Entspricht format(date, 'EEEE, dd. MMMM yyyy', { locale: de })
const formatLongDE = (d: Date): string =>
  `${WEEKDAYS_DE[d.getDay()]}, ${pad(d.getDate())}. ${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`;

// Entspricht differenceInDays(a, b) — ganze Tage zwischen zwei Daten
const differenceInDays = (a: Date, b: Date): number =>
  Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));

const addDays = (d: Date, days: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
};

const subDays = (d: Date, days: number): Date => addDays(d, -days);

// ---- Marketing-Kriterien (aus useMorningSummary) ----
interface MarketingAction {
  id: string;
  name: string;
  target_criteria: {
    has_children?: boolean;
    min_nights?: number;
    nationality?: string;
    booking_amount_min?: number;
  };
}

interface ActionTracking {
  booking_id: string;
  action_id: string;
  action_applied: boolean;
}

function matchesCriteria(
  booking: any,
  criteria: MarketingAction['target_criteria'],
): boolean {
  if (criteria.has_children && (!booking.number_of_children || booking.number_of_children <= 0)) {
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Betriebsart aus Body lesen. Standard: nur Abruf, kein Senden.
    let deliver = false;
    let channel: 'email' | 'chat' | 'both' = 'email';
    try {
      const body = await req.json();
      if (body && body.deliver === true) deliver = true;
      if (body && (body.channel === 'email' || body.channel === 'chat' || body.channel === 'both')) {
        channel = body.channel;
      }
    } catch (_) {
      // kein Body -> deliver bleibt false
    }

    console.log(`☀️ [morning-summary] Start. deliver=${deliver}, channel=${channel}`);

    // Einstellungen laden (morning_summary_settings). Optional; Defaults greifen sonst.
    let settings: any = null;
    try {
      const { data: settingsRow } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'morning_summary_settings')
        .maybeSingle();
      settings = settingsRow?.value ?? null;
    } catch (_) {
      settings = null;
    }

    const includeCfg = settings?.include ?? {
      guest_contact: true,
      ratings: true,
      open_linen: true,
      upcoming_bookings: true,
      cleanings: true,
      confirmed_deliveries: true,
    };

    // ---- Zeitfenster berechnen (identisch zum Hook) ----
    const now = new Date();
    const today = isoDate(now);
    const todayStart = `${today}T00:00:00`;
    const nextWeekEnd = addDays(now, 7);
    const nextWeekEndStr = `${isoDate(nextWeekEnd)}T23:59:59`;

    // ---- Rating-Einstellungen (mit Defaults) ----
    let ratingSettings: any = null;
    try {
      const { data: rs } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'rating_reminder_settings')
        .maybeSingle();
      ratingSettings = rs?.value ?? null;
    } catch (_) {
      ratingSettings = null;
    }

    const ratingsEnabled =
      (ratingSettings?.is_enabled ?? DEFAULT_RATING_REMINDER_SETTINGS.is_enabled) &&
      (includeCfg.ratings !== false);
    const minDays = ratingSettings?.min_days_after_checkout ?? DEFAULT_RATING_REMINDER_SETTINGS.min_days_after_checkout;
    const maxDays = ratingSettings?.max_days_after_checkout ?? DEFAULT_RATING_REMINDER_SETTINGS.max_days_after_checkout;
    const requirePlatform = ratingSettings?.require_platform ?? DEFAULT_RATING_REMINDER_SETTINGS.require_platform;
    const rentalTypeFilter = ratingSettings?.rental_type_filter ?? DEFAULT_RATING_REMINDER_SETTINGS.rental_type_filter;

    // ============================================================
    // ABFRAGEN (1:1 aus useMorningSummary portiert)
    // ============================================================

    // 1) Gäste-Kontakt-Erinnerungen (5–10 Tage vor Check-in)
    let guestContactReminders: any[] = [];
    if (includeCfg.guest_contact !== false) {
      const fiveDaysFromNow = addDays(now, 5);
      const tenDaysFromNow = addDays(now, 10);
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, guest_name, guest_email, check_in, number_of_children,
          houses!bookings_house_id_fkey!inner(name, rental_type)
        `)
        .gte('check_in', fiveDaysFromNow.toISOString())
        .lte('check_in', tenDaysFromNow.toISOString())
        .eq('guest_contact_status', 'pending')
        .eq('status', 'confirmed')
        .eq('houses.rental_type', 'tourist')
        .order('check_in');
      if (error) throw error;
      guestContactReminders = data || [];
    }

    // Marketing-Aktionen laden
    const { data: marketingActionsData } = await supabase
      .from('marketing_actions')
      .select('id, name, target_criteria')
      .eq('status', 'active');
    const marketingActions = (marketingActionsData || []) as MarketingAction[];

    // Tracking für Gäste-Kontakt-Buchungen
    const bookingIds = guestContactReminders.map((b) => b.id);
    let actionTracking: ActionTracking[] = [];
    if (bookingIds.length > 0) {
      const { data } = await supabase
        .from('booking_action_tracking')
        .select('booking_id, action_id, action_applied')
        .in('booking_id', bookingIds);
      actionTracking = (data || []) as ActionTracking[];
    }

    // 2) Bewertungs-Erinnerungen
    const minCheckoutDate = subDays(now, maxDays);
    const maxCheckoutDate = subDays(now, minDays);
    let ratingReminders: any[] = [];
    if (ratingsEnabled) {
      let query = supabase
        .from('bookings')
        .select(`
          id, guest_name, check_out, platform, number_of_children, external_rating,
          houses!bookings_house_id_fkey!inner(name, rental_type)
        `)
        .eq('status', 'completed')
        .gte('check_out', minCheckoutDate.toISOString())
        .lte('check_out', maxCheckoutDate.toISOString())
        .is('external_rating', null);
      if (rentalTypeFilter !== 'all') {
        query = query.eq('houses.rental_type', rentalTypeFilter);
      }
      if (requirePlatform) {
        query = query.not('platform', 'is', null);
      }
      const { data, error } = await query
        .order('check_out', { ascending: false })
        .limit(10);
      if (error) throw error;
      ratingReminders = data || [];
    }

    // Tracking für Bewertungs-Buchungen
    const ratingBookingIds = ratingReminders.map((b) => b.id);
    let ratingActionTracking: ActionTracking[] = [];
    if (ratingBookingIds.length > 0) {
      const { data } = await supabase
        .from('booking_action_tracking')
        .select('booking_id, action_id, action_applied')
        .in('booking_id', ratingBookingIds);
      ratingActionTracking = (data || []) as ActionTracking[];
    }

    // 3+4) Kommende Buchungen (nächste 7 Tage)
    let upcomingBookings: any[] = [];
    {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, houses!bookings_house_id_fkey(name)')
        .gte('check_in', todayStart)
        .lte('check_in', nextWeekEndStr)
        .eq('status', 'confirmed')
        .order('check_in')
        .limit(10);
      if (error) throw error;
      upcomingBookings = data || [];
    }

    // 5) Geplante Reinigungen (heute + nächste 7 Tage)
    let cleanings: any[] = [];
    {
      const { data, error } = await supabase
        .from('service_tasks')
        .select('*, houses!service_tasks_house_id_fkey(name), bookings!service_tasks_booking_id_fkey(guest_name)')
        .eq('service_type', 'cleaning')
        .gte('scheduled_date', today)
        .lte('scheduled_date', isoDate(nextWeekEnd))
        .in('status', ['scheduled', 'draft'])
        .order('scheduled_date')
        .order('scheduled_time');
      if (error) throw error;
      cleanings = data || [];
    }

    // 6) Offene Wäschebestellungen + kommende Lieferungen
    let linenOrders: any[] = [];
    {
      const { data, error } = await supabase
        .from('linen_orders')
        .select('*, houses!linen_orders_house_id_fkey(name), bookings!linen_orders_booking_id_fkey(guest_name, check_in)')
        .in('status', ACTIVE_LINEN_ORDER_STATUSES)
        .order('delivery_date');
      if (error) throw error;
      linenOrders = data || [];
    }

    // ---- ÜBERFÄLLIGE WORKFLOWS (vom overdue-watch markiert) ----
    // Vorgänge, bei denen ein Dienstleister nicht innerhalb der Frist geantwortet hat.
    // Der Wächter `overdue-watch` setzt sie auf status='ueberfaellig'.
    let overdueActions: any[] = [];
    if (includeCfg.overdue !== false) {
      const { data: od } = await supabase
        .from('max_actions')
        .select('id, action_type, guest_name, waiting_for, due_at, last_step')
        .eq('status', 'ueberfaellig')
        .order('due_at', { ascending: true })
        .limit(10);
      overdueActions = od ?? [];
    }

    // ---- SYSTEM-BEFUNDE (von max-ablaeufe-pruefen) ----
    // Die tägliche Wahrheitsprüfung schreibt geprueft_status in max_ablaeufe.
    // 'fehler' heißt: Ein Ablauf verweist auf einen Baustein (Tool, Edge Function,
    // DB-Trigger), den es NICHT (mehr) gibt. Das ist ein Systemfehler, kein
    // Tagesgeschäft — er gehört ganz nach oben, noch vor die Überfälligen.
    let systemBefunde: any[] = [];
    if (includeCfg.system !== false) {
      const { data: sb } = await supabase
        .from('max_ablaeufe')
        .select('aktion, aktion_label, variante, schritt_nr, geprueft_befund, geprueft_am')
        .eq('geprueft_status', 'fehler')
        .order('aktion')
        .limit(10);
      systemBefunde = sb ?? [];
    }

    // ---- hasAnyData (identisch zum Hook) ----
    const hasAnyData =
      upcomingBookings.length > 0 ||
      cleanings.length > 0 ||
      linenOrders.length > 0 ||
      guestContactReminders.length > 0 ||
      overdueActions.length > 0 ||
      systemBefunde.length > 0 ||
      (ratingsEnabled && ratingReminders.length > 0);

    // ---- Marketing-Helfer (identisch zum Hook) ----
    const getMarketingActionsForBooking = (booking: any) =>
      marketingActions
        .filter((action) => matchesCriteria(booking, action.target_criteria || {}))
        .map((action) => {
          const tracking = actionTracking.find(
            (t) => t.booking_id === booking.id && t.action_id === action.id,
          );
          return { action, isApplied: tracking?.action_applied || false };
        });

    const getRatingMarketingActionsForBooking = (booking: any) =>
      marketingActions
        .filter((action) => matchesCriteria(booking, action.target_criteria || {}))
        .map((action) => {
          const tracking = ratingActionTracking.find(
            (t) => t.booking_id === booking.id && t.action_id === action.id,
          );
          return { action, isApplied: tracking?.action_applied || false };
        });

    // ============================================================
    // FORMATIERUNG (1:1 aus formatSummaryMessage portiert)
    // ============================================================
    let message = '🏠 **Guten Morgen! Deine anstehenden Aufgaben**\n\n';
    message += `📅 ${formatLongDE(now)}\n\n`;

    // ÜBERFÄLLIG (höchste Priorität — jemand hat nicht geantwortet)
    // SYSTEMFEHLER zuerst — noch vor dem Tagesgeschäft.
    // Ein Ablauf verweist auf einen Baustein, den es nicht (mehr) gibt.
    // Das bedeutet: Max arbeitet womöglich mit einer Anweisung ins Leere.
    if (systemBefunde.length > 0) {
      message += `🔧 **${systemBefunde.length} Systemfehler in den Abläufen**\n`;
      systemBefunde.forEach((b: any) => {
        const name = b.aktion_label || b.aktion;
        const wo = b.variante && b.variante !== 'standard'
          ? `${name} (${b.variante}), Schritt ${b.schritt_nr}`
          : `${name}, Schritt ${b.schritt_nr}`;
        message += `• **${wo}** – ${b.geprueft_befund || 'Baustein fehlt'}\n`;
      });
      message += `_Prüfe das im Fenster „Max: Abläufe (Kontrolle)"._\n\n`;
    }

    if (overdueActions.length > 0) {
      message += `⚠️ **${overdueActions.length} überfällige(r) Vorgang/Vorgänge**\n`;
      overdueActions.forEach((a: any) => {
        const wer = a.waiting_for === 'amela' ? 'Amela'
          : a.waiting_for === 'teuni' ? 'Teuni'
          : (a.waiting_for || 'Dienstleister');
        const seit = a.due_at ? formatDE(new Date(a.due_at)) : 'unbekannt';
        const gast = a.guest_name || 'Buchung';
        message += `• **${wer} hat nicht geantwortet** – ${gast} (fällig war ${seit})\n`;
      });
      message += '\n';
    }

    // GÄSTE VOR ANREISE KONTAKTIEREN
    if (guestContactReminders.length > 0) {
      message += `📞 **${guestContactReminders.length} ${guestContactReminders.length === 1 ? 'Gast' : 'Gäste'} vor Anreise kontaktieren**\n`;
      guestContactReminders.forEach((b: any) => {
        const checkInDate = formatDE(new Date(b.check_in));
        const houseName = b.houses?.name || 'Unbekanntes Haus';
        const daysUntil = differenceInDays(new Date(b.check_in), now);
        const email = b.guest_email ? ` (${b.guest_email})` : '';
        const isFamily = (b.number_of_children || 0) > 0;
        const familyTag = isFamily ? ` 👨‍👩‍👧‍👦 Familie mit ${b.number_of_children} Kind(ern)` : '';
        message += `• **${b.guest_name}**${email} → ${houseName} - Check-in in ${daysUntil} Tagen (${checkInDate})${familyTag}\n`;
        getMarketingActionsForBooking(b).forEach(({ action, isApplied }) => {
          const statusIcon = isApplied ? '✅' : '⏳';
          const statusText = isApplied ? 'Angewendet' : 'Noch nicht angewendet';
          message += `  ⭐ Marketing-Aktion: "${action.name}" - ${statusIcon} ${statusText}\n`;
        });
      });
      message += '\n';
    }

    // BEWERTUNGEN NACHTRAGEN
    if (ratingsEnabled && ratingReminders.length > 0) {
      const marketingRatingReminders = ratingReminders.filter((b: any) =>
        getRatingMarketingActionsForBooking(b).some((a) => a.isApplied),
      );
      const otherRatingReminders = ratingReminders.filter((b: any) =>
        !getRatingMarketingActionsForBooking(b).some((a) => a.isApplied),
      );

      message += `⭐ **Bewertungen nachtragen (${ratingReminders.length})**\n`;

      if (marketingRatingReminders.length > 0) {
        message += `\n🎯 **Marketing-Priorität:**\n`;
        marketingRatingReminders.forEach((b: any) => {
          const checkOutDate = formatDE(new Date(b.check_out));
          const houseName = b.houses?.name || 'Unbekanntes Haus';
          const daysSince = differenceInDays(now, new Date(b.check_out));
          const platform = b.platform || 'Unbekannt';
          message += `• **${b.guest_name}** (${platform}) - ${houseName}\n`;
          message += `  Checkout: ${checkOutDate} (vor ${daysSince} Tagen)\n`;
          getRatingMarketingActionsForBooking(b).filter((a) => a.isApplied).forEach(({ action }) => {
            message += `  ⚠️ Marketing-Aktion "${action.name}" - Bewertung für Auswertung benötigt!\n`;
          });
        });
      }

      if (otherRatingReminders.length > 0) {
        message += `\n📝 **Weitere ausstehende (${otherRatingReminders.length}):**\n`;
        otherRatingReminders.slice(0, 3).forEach((b: any) => {
          const checkOutDate = formatDE(new Date(b.check_out));
          const daysSince = differenceInDays(now, new Date(b.check_out));
          const platform = b.platform || 'Unbekannt';
          message += `• ${b.guest_name} (${platform}) - Checkout vor ${daysSince} Tagen (${checkOutDate})\n`;
        });
        if (otherRatingReminders.length > 3) {
          message += `  ... und ${otherRatingReminders.length - 3} weitere\n`;
        }
      }
      message += '\n';
    }

    // OFFENE WÄSCHEBESTELLUNGEN
    const openOrders = includeCfg.open_linen !== false
      ? linenOrders.filter((o) => o.status === LINEN_STATUS_OFFEN)
      : [];
    if (openOrders.length > 0) {
      message += `🔔 **${openOrders.length} Wäschebestellung(en) zu bestätigen**\n`;
      openOrders.forEach((o) => {
        const houseName = o.houses?.name || 'Unbekanntes Haus';
        const guestName = o.bookings?.guest_name || 'Kein Gast';
        const deliveryDate = o.delivery_date ? formatDE(new Date(o.delivery_date)) : 'Kein Datum';
        message += `• ${houseName} für ${guestName} (Lieferung: ${deliveryDate})\n`;
      });
      message += '\n';
    }

    // KOMMENDE BUCHUNGEN
    if (includeCfg.upcoming_bookings !== false && upcomingBookings.length > 0) {
      message += `📥 **Kommende Buchungen (${upcomingBookings.length})**\n`;
      upcomingBookings.forEach((b) => {
        const checkInDate = formatDE(new Date(b.check_in));
        const checkInTime = formatTime(new Date(b.check_in));
        const houseName = b.houses?.name || 'Unbekanntes Haus';
        const daysUntil = Math.ceil((new Date(b.check_in).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const daysText = daysUntil === 0 ? 'Heute' : daysUntil === 1 ? 'Morgen' : `in ${daysUntil} Tagen`;
        message += `• ${checkInDate} ${checkInTime} - ${b.guest_name} (${houseName}) - ${daysText}\n`;
      });
      message += '\n';
    }

    // GEPLANTE REINIGUNGEN
    if (includeCfg.cleanings !== false && cleanings.length > 0) {
      const todayCleanings = cleanings.filter((c) => c.scheduled_date === today);
      const futureCleanings = cleanings.filter((c) => c.scheduled_date > today);

      if (todayCleanings.length > 0) {
        message += `🧹 **Reinigungen heute (${todayCleanings.length})**\n`;
        todayCleanings.forEach((c) => {
          const time = c.scheduled_time || 'Zeit nicht festgelegt';
          const houseName = c.houses?.name || 'Unbekanntes Haus';
          const statusEmoji = c.status === 'draft' ? '📝' : '✅';
          message += `${statusEmoji} ${time} - ${houseName}\n`;
        });
        message += '\n';
      }

      if (futureCleanings.length > 0) {
        message += `🧹 **Kommende Reinigungen (${futureCleanings.length})**\n`;
        futureCleanings.slice(0, 5).forEach((c) => {
          const date = formatDE(new Date(c.scheduled_date));
          const time = c.scheduled_time || 'Zeit nicht festgelegt';
          const houseName = c.houses?.name || 'Unbekanntes Haus';
          const statusEmoji = c.status === 'draft' ? '📝' : '✅';
          message += `${statusEmoji} ${date} ${time} - ${houseName}\n`;
        });
        message += '\n';
      }
    }

    // BESTÄTIGTE LIEFERUNGEN
    const confirmedDeliveries = includeCfg.confirmed_deliveries !== false
      ? linenOrders.filter((o) => o.status === LINEN_STATUS_AUSSTEHEND)
      : [];
    if (confirmedDeliveries.length > 0) {
      message += `🧺 **Bestätigte Wäsche-Lieferungen (${confirmedDeliveries.length})**\n`;
      confirmedDeliveries.slice(0, 5).forEach((o) => {
        const houseName = o.houses?.name || 'Unbekanntes Haus';
        const deliveryDate = o.delivery_date ? formatDE(new Date(o.delivery_date)) : 'Kein Datum';
        const statusText = translateLinenOrderStatus(o.status);
        message += `• ${houseName} - ${deliveryDate} (${statusText})\n`;
      });
      message += '\n';
    }

    // LEERER ZUSTAND
    if (!hasAnyData) {
      message += '🎉 **Alles ruhig!**\nKeine anstehenden Aufgaben in den nächsten Tagen.\n\n';
    }

    message += '💡 Stelle mir gerne Fragen zu deinen Buchungen, Reinigungen oder Wäschebestellungen!';

    // ============================================================
    // ZUSTELLUNG (nur bei deliver=true UND enabled=true)
    // ============================================================
    let delivered = false;
    let deliveryNote = 'Abruf-Modus: nichts gesendet.';

    if (deliver) {
      const enabled = settings?.enabled === true;
      if (!enabled) {
        deliveryNote = 'deliver=true, aber morning_summary_settings.enabled ist nicht true → nichts gesendet.';
        console.log(`⏸️ [morning-summary] ${deliveryNote}`);
      } else if (channel === 'email' || channel === 'both') {
        const emailTo = settings?.email_to;
        if (!emailTo) {
          deliveryNote = 'enabled=true, aber keine email_to konfiguriert → nichts gesendet.';
        } else {
          try {
            const { error: mailErr } = await supabase.functions.invoke('send-guest-email', {
              body: {
                recipients: [{ email: emailTo, guest_name: 'Uli' }],
                subjectTemplate: 'Guten Morgen – deine Tagesübersicht',
                bodyTemplate: message,
              },
            });
            if (mailErr) throw mailErr;
            delivered = true;
            deliveryNote = `E-Mail an ${emailTo} gesendet.`;
            console.log(`✉️ [morning-summary] ${deliveryNote}`);
          } catch (e) {
            deliveryNote = `E-Mail-Versand fehlgeschlagen: ${String(e)}`;
            console.error(`❌ [morning-summary] ${deliveryNote}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary_markdown: message,
        hasData: hasAnyData,
        sections: {
          system: systemBefunde.length,      // Systemfehler in den Abläufen
          overdue: overdueActions.length,
          guest_contact: guestContactReminders.length,
          ratings: ratingReminders.length,
          open_linen: openOrders.length,
          upcoming_bookings: upcomingBookings.length,
          cleanings: cleanings.length,
          confirmed_deliveries: confirmedDeliveries.length,
        },
        deliver,
        delivered,
        deliveryNote,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('❌ [morning-summary] Fehler:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
