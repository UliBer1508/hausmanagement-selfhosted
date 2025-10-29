import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export const useMorningSummary = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayStart = `${today}T00:00:00`;
  const todayEnd = `${today}T23:59:59`;

  // Check-ins heute
  const { data: checkIns, isLoading: loadingCheckIns } = useQuery({
    queryKey: ['morning-check-ins', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, houses(name)')
        .gte('check_in', todayStart)
        .lte('check_in', todayEnd)
        .neq('status', 'cancelled')
        .order('check_in');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30, // 30 Minuten Cache
  });

  // Check-outs heute
  const { data: checkOuts, isLoading: loadingCheckOuts } = useQuery({
    queryKey: ['morning-check-outs', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, houses(name)')
        .gte('check_out', todayStart)
        .lte('check_out', todayEnd)
        .neq('status', 'cancelled')
        .order('check_out');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30,
  });

  // Reinigungen heute
  const { data: cleanings, isLoading: loadingCleanings } = useQuery({
    queryKey: ['morning-cleanings', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_tasks')
        .select('*, houses(name), bookings(guest_name)')
        .eq('service_type', 'cleaning')
        .eq('scheduled_date', today)
        .in('status', ['scheduled', 'in_progress'])
        .order('scheduled_time');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30,
  });

  // Wäschebestellungen (ausstehend, in_bearbeitung, unterwegs)
  const { data: linenOrders, isLoading: loadingLinen } = useQuery({
    queryKey: ['morning-linen-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select('*, houses(name)')
        .in('status', ['ausstehend', 'in_bearbeitung', 'unterwegs'])
        .order('delivery_date');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30,
  });

  // Häuser mit kritischen Beständen (< 5 Stück)
  const { data: houses, isLoading: loadingHouses } = useQuery({
    queryKey: ['morning-critical-houses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('houses')
        .select('id, name, linen_stock');
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 30,
  });

  // Kritische Häuser filtern und übersetzen
  const criticalHouses = houses?.filter(h => {
    const stock = h.linen_stock || {};
    return Object.values(stock).some((count: any) => count < 5);
  }).map(h => ({
    id: h.id,
    name: h.name,
    critical_items: Object.entries(h.linen_stock || {})
      .filter(([_, count]) => (count as number) < 5)
      .map(([item, count]) => ({ 
        item: translateLinenItem(item),
        count 
      }))
  }));

  // Wäsche-Lieferungen heute
  const todayDeliveries = linenOrders?.filter(o => o.delivery_date === today) || [];

  // Prüfen ob Daten vorhanden sind
  const hasAnyData = 
    (checkIns && checkIns.length > 0) ||
    (checkOuts && checkOuts.length > 0) ||
    (cleanings && cleanings.length > 0) ||
    (todayDeliveries && todayDeliveries.length > 0) ||
    (criticalHouses && criticalHouses.length > 0);

  // Formatierte Nachricht erstellen
  const formatSummaryMessage = (): string => {
    if (!checkIns || !checkOuts || !cleanings || !linenOrders || !houses) {
      return '';
    }

    let message = '🏠 **Guten Morgen! Dein Überblick für heute**\n\n';
    message += `📅 ${format(new Date(), 'EEEE, dd. MMMM yyyy', { locale: de })}\n\n`;
    
    // Check-ins
    if (checkIns.length > 0) {
      message += `📥 **Check-ins heute (${checkIns.length})**\n`;
      checkIns.forEach(b => {
        const time = format(new Date(b.check_in), 'HH:mm');
        const houseName = b.houses?.name || 'Unbekanntes Haus';
        message += `• ${time} Uhr - ${b.guest_name} (${houseName}, ${b.number_of_guests} Gäste)\n`;
      });
      message += '\n';
    }
    
    // Check-outs
    if (checkOuts.length > 0) {
      message += `📤 **Check-outs heute (${checkOuts.length})**\n`;
      checkOuts.forEach(b => {
        const time = format(new Date(b.check_out), 'HH:mm');
        const houseName = b.houses?.name || 'Unbekanntes Haus';
        message += `• ${time} Uhr - ${b.guest_name} (${houseName})\n`;
      });
      message += '\n';
    }
    
    // Reinigungen
    if (cleanings.length > 0) {
      message += `🧹 **Reinigungen heute (${cleanings.length})**\n`;
      cleanings.forEach(c => {
        const time = c.scheduled_time || 'Zeit nicht festgelegt';
        const houseName = c.houses?.name || 'Unbekanntes Haus';
        const guestName = c.bookings?.guest_name || 'Keine Buchung';
        message += `• ${time} - ${houseName} (${guestName})\n`;
      });
      message += '\n';
    }
    
    // Wäsche-Lieferungen heute
    if (todayDeliveries.length > 0) {
      message += `🧺 **Wäsche-Lieferungen heute (${todayDeliveries.length})**\n`;
      todayDeliveries.forEach(o => {
        const houseName = o.houses?.name || 'Unbekanntes Haus';
        message += `• ${houseName} - ${o.total_items} Teile (${o.status})\n`;
      });
      message += '\n';
    }
    
    // Kritische Bestände
    if (criticalHouses && criticalHouses.length > 0) {
      message += `⚠️ **Kritische Wäsche-Bestände**\n`;
      criticalHouses.forEach(h => {
        const items = h.critical_items.map(i => `${i.item}: ${i.count}`).join(', ');
        message += `• ${h.name}: ${items}\n`;
      });
      message += '\n';
    }
    
    // Leerer Zustand
    if (!hasAnyData) {
      message += '🎉 **Alles ruhig heute!**\nKeine dringenden Aufgaben.\n\n';
    }
    
    message += '💡 Stelle mir gerne Fragen zu deinen Buchungen, Reinigungen oder Häusern!';
    
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

  const isLoading = loadingCheckIns || loadingCheckOuts || loadingCleanings || loadingLinen || loadingHouses;

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
    large_towels: 'Große Handtücher',
    small_towels: 'Kleine Handtücher',
    sauna_towels: 'Saunatücher',
    bath_mats: 'Badematten',
    sink_towels: 'WB-Handtücher',
    kitchen_towels: 'Küchenhandtücher',
    blankets: 'Decken',
    pillow_cases: 'Kissenbezüge',
    table_linens: 'Tischwäsche',
  };
  return labels[item] || item;
};
