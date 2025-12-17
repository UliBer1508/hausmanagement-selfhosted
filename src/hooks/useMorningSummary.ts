import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";

export const useMorningSummary = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayStart = `${today}T00:00:00`;
  const todayEnd = `${today}T23:59:59`;

  // Nächste 7 Tage berechnen
  const nextWeekEnd = new Date();
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
  const nextWeekEndStr = format(nextWeekEnd, 'yyyy-MM-dd') + 'T23:59:59';
  
  // Gäste-Kontakt-Erinnerungen (5-10 Tage vor Check-in)
  const { data: guestContactReminders, isLoading: loadingGuestContact } = useQuery({
    queryKey: ['morning-guest-contact', today],
    queryFn: async () => {
      const fiveDaysFromNow = addDays(new Date(), 5);
      const tenDaysFromNow = addDays(new Date(), 10);

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          guest_name,
          guest_email,
          check_in,
          houses!bookings_house_id_fkey!inner(name, rental_type)
        `)
        .gte('check_in', fiveDaysFromNow.toISOString())
        .lte('check_in', tenDaysFromNow.toISOString())
        .eq('guest_contact_status', 'pending')
        .eq('status', 'confirmed')
        .eq('houses.rental_type', 'tourist')
        .order('check_in');

      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30,
  });

  // Kommende Buchungen (nächste 7 Tage)
  const { data: upcomingBookings, isLoading: loadingBookings } = useQuery({
    queryKey: ['morning-upcoming-bookings', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, houses!bookings_house_id_fkey(name)')
        .gte('check_in', todayStart)
        .lte('check_in', nextWeekEndStr)
        .eq('status', 'confirmed')
        .order('check_in')
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30,
  });

  // Geplante Reinigungen (heute + nächste 7 Tage)
  const { data: cleanings, isLoading: loadingCleanings } = useQuery({
    queryKey: ['morning-cleanings', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_tasks')
        .select('*, houses!service_tasks_house_id_fkey(name), bookings!service_tasks_booking_id_fkey(guest_name)')
        .eq('service_type', 'cleaning')
        .gte('scheduled_date', today)
        .lte('scheduled_date', format(nextWeekEnd, 'yyyy-MM-dd'))
        .in('status', ['scheduled', 'draft'])
        .order('scheduled_date')
        .order('scheduled_time');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30,
  });

  // Offene Wäschebestellungen + kommende Lieferungen
  const { data: linenOrders, isLoading: loadingLinen } = useQuery({
    queryKey: ['morning-linen-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select('*, houses!linen_orders_house_id_fkey(name), bookings!linen_orders_booking_id_fkey(guest_name, check_in)')
        .in('status', ['offen', 'pending', 'assigned'])
        .order('delivery_date');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30,
  });

  // Prüfen ob Daten vorhanden sind
  const hasAnyData = 
    (upcomingBookings && upcomingBookings.length > 0) ||
    (cleanings && cleanings.length > 0) ||
    (linenOrders && linenOrders.length > 0) ||
    (guestContactReminders && guestContactReminders.length > 0);

  // Formatierte Nachricht erstellen
  const formatSummaryMessage = (): string => {
    if (!upcomingBookings || !cleanings || !linenOrders) {
      return '';
    }

    let message = '🏠 **Guten Morgen! Deine anstehenden Aufgaben**\n\n';
    message += `📅 ${format(new Date(), 'EEEE, dd. MMMM yyyy', { locale: de })}\n\n`;
    
    // GÄSTE VOR ANREISE KONTAKTIEREN (HÖCHSTE PRIORITÄT)
    if (guestContactReminders && guestContactReminders.length > 0) {
      message += `📞 **${guestContactReminders.length} ${guestContactReminders.length === 1 ? 'Gast' : 'Gäste'} vor Anreise kontaktieren**\n`;
      guestContactReminders.forEach((b: any) => {
        const checkInDate = format(new Date(b.check_in), 'dd.MM.yyyy');
        const houseName = b.houses?.name || 'Unbekanntes Haus';
        const daysUntil = differenceInDays(new Date(b.check_in), new Date());
        const email = b.guest_email ? ` (${b.guest_email})` : '';
        message += `• ${b.guest_name}${email} → ${houseName} - Check-in in ${daysUntil} Tagen (${checkInDate})\n`;
      });
      message += '\n';
    }
    
    // OFFENE WÄSCHEBESTELLUNGEN
    const openOrders = linenOrders.filter(o => o.status === 'offen');
    if (openOrders.length > 0) {
      message += `🔔 **${openOrders.length} Wäschebestellung(en) zu bestätigen**\n`;
      openOrders.forEach(o => {
        const houseName = o.houses?.name || 'Unbekanntes Haus';
        const guestName = o.bookings?.guest_name || 'Kein Gast';
        const deliveryDate = o.delivery_date ? format(new Date(o.delivery_date), 'dd.MM.yyyy') : 'Kein Datum';
        message += `• ${houseName} für ${guestName} (Lieferung: ${deliveryDate})\n`;
      });
      message += '\n';
    }
    
    // KOMMENDE BUCHUNGEN (nächste 7 Tage)
    if (upcomingBookings.length > 0) {
      message += `📥 **Kommende Buchungen (${upcomingBookings.length})**\n`;
      upcomingBookings.forEach(b => {
        const checkInDate = format(new Date(b.check_in), 'dd.MM.yyyy');
        const checkInTime = format(new Date(b.check_in), 'HH:mm');
        const houseName = b.houses?.name || 'Unbekanntes Haus';
        const daysUntil = Math.ceil((new Date(b.check_in).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        const daysText = daysUntil === 0 ? 'Heute' : daysUntil === 1 ? 'Morgen' : `in ${daysUntil} Tagen`;
        message += `• ${checkInDate} ${checkInTime} - ${b.guest_name} (${houseName}) - ${daysText}\n`;
      });
      message += '\n';
    }
    
    // GEPLANTE REINIGUNGEN (heute + nächste 7 Tage)
    if (cleanings.length > 0) {
      const todayCleanings = cleanings.filter(c => c.scheduled_date === today);
      const futureCleanings = cleanings.filter(c => c.scheduled_date > today);
      
      if (todayCleanings.length > 0) {
        message += `🧹 **Reinigungen heute (${todayCleanings.length})**\n`;
        todayCleanings.forEach(c => {
          const time = c.scheduled_time || 'Zeit nicht festgelegt';
          const houseName = c.houses?.name || 'Unbekanntes Haus';
          const statusEmoji = c.status === 'draft' ? '📝' : '✅';
          message += `${statusEmoji} ${time} - ${houseName}\n`;
        });
        message += '\n';
      }
      
      if (futureCleanings.length > 0) {
        message += `🧹 **Kommende Reinigungen (${futureCleanings.length})**\n`;
        futureCleanings.slice(0, 5).forEach(c => {
          const date = format(new Date(c.scheduled_date), 'dd.MM.yyyy');
          const time = c.scheduled_time || 'Zeit nicht festgelegt';
          const houseName = c.houses?.name || 'Unbekanntes Haus';
          const statusEmoji = c.status === 'draft' ? '📝' : '✅';
          message += `${statusEmoji} ${date} ${time} - ${houseName}\n`;
        });
        message += '\n';
      }
    }
    
    // BESTÄTIGTE LIEFERUNGEN (pending, assigned)
    const confirmedDeliveries = linenOrders.filter(o => o.status !== 'offen');
    if (confirmedDeliveries.length > 0) {
      message += `🧺 **Bestätigte Wäsche-Lieferungen (${confirmedDeliveries.length})**\n`;
      confirmedDeliveries.slice(0, 5).forEach(o => {
        const houseName = o.houses?.name || 'Unbekanntes Haus';
        const deliveryDate = o.delivery_date ? format(new Date(o.delivery_date), 'dd.MM.yyyy') : 'Kein Datum';
        const statusText = o.status === 'pending' ? 'Ausstehend' : o.status === 'assigned' ? 'Zugewiesen' : 'Bestätigt';
        message += `• ${houseName} - ${deliveryDate} (${statusText})\n`;
      });
      message += '\n';
    }
    
    // LEERER ZUSTAND
    if (!hasAnyData) {
      message += '🎉 **Alles ruhig!**\nKeine anstehenden Aufgaben in den nächsten Tagen.\n\n';
    }
    
    message += '💡 Stelle mir gerne Fragen zu deinen Buchungen, Reinigungen oder Wäschebestellungen!';
    
    return message;
  };

  const summaryMessage = formatSummaryMessage();

  // LocalStorage-Check
  const shouldShow = (): boolean => {
    const lastShown = localStorage.getItem('chat-summary-shown');
    return lastShown !== today;
  };

  const markAsShown = (): void => {
    localStorage.setItem('chat-summary-shown', today);
  };

  const isLoading = loadingBookings || loadingCleanings || loadingLinen || loadingGuestContact;

  return {
    summaryMessage,
    isLoading,
    hasData: hasAnyData,
    shouldShow,
    markAsShown,
  };
};

// Hilfsfunktion für Wäsche-Übersetzung
const translateLinenItem = (item: string): string => {
  const labels: Record<string, string> = {
    bedding: 'Bettwäsche',
    large_towels: 'Badetücher',
    small_towels: 'Handtücher',
    sauna_towels: 'Saunatücher',
    bath_mats: 'Badematten',
    sink_towels: 'WB-Handtücher',
    kitchen_towels: 'Geschirrtücher',
    blankets: 'Decken',
    pillow_cases: 'Kissenbezüge',
    table_linens: 'Tischwäsche',
  };
  return labels[item] || item;
};
