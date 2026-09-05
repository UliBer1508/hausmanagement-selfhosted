import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  TrendingUp, TrendingDown, Award, AlertTriangle, CheckCircle,
  Calendar, Clock, Lightbulb, AlertCircle, DollarSign, Package
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList
} from 'recharts';
import { format, addDays, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, translateItemType, getLabelsFromLinenDef } from '@/lib/linenOrderHelpers';
// Etappe 4: Gastfelder aus der guests-Relation (siehe guestHelpers.ts)
import { withGuestData } from '@/lib/guestHelpers';
import { useLaundryArticles } from '@/hooks/useLaundryArticles';
import { mengenFuerBuchung, artikelAufteilung, type SetZeilen } from '@/lib/linenPricing';

interface LinenOrderAnalyticsProps {
  house: any;
}

export const LinenOrderAnalytics = ({ house }: LinenOrderAnalyticsProps) => {
  const sixMonthsAgo = format(subMonths(new Date(), 6), 'yyyy-MM-dd');

  // Bestellungen mit Buchungen laden
  const { data: ordersWithBookings, isLoading: ordersLoading } = useQuery({
    queryKey: ['linen-orders-analytics', house.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select(`
          *,
          bookings!linen_orders_booking_id_fkey (
            id,
            guest_name,
            number_of_guests,
            check_in,
            check_out
          )
        `)
        .eq('house_id', house.id)
        .gte('delivery_date', sixMonthsAgo)
        .order('delivery_date', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!house.id
  });

  // Preise laden
  /*
   * Teuni-Artikel mit ihren aktuellen Preisen (umgestellt 05.09.2026).
   *
   * Vorher stand hier ai_linen_settings.prices — eine hausbezogene
   * Preisliste, die von Hand gepflegt und mit dem SET-SCHLUESSEL
   * nachgeschlagen wurde. Venediger nennt die Bettwaesche-Zeile
   * `bettwaesche`, die Liste kannte nur `bedding`: der groesste Posten
   * fiel still aus jeder Auswertung. Seit die Preismaske umgestellt ist,
   * wird diese Liste ausserdem gar nicht mehr gepflegt.
   *
   * Der Preis kommt jetzt vom Artikel, ueber die Artikelnummer an der
   * Set-Zeile. Die gemeinsame Logik dafuer steht in lib/linenPricing.
   */
  const { data: artikel = [] } = useLaundryArticles();

  // Zukünftige Buchungen
  const { data: upcomingBookings } = useQuery({
    queryKey: ['upcoming-bookings-forecast', house.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, guests!bookings_guest_id_fkey(*)')  // Etappe 4: Gastdaten aus der Relation
        .eq('house_id', house.id)
        .gte('check_out', format(new Date(), 'yyyy-MM-dd'))
        .lte('check_in', format(addDays(new Date(), 30), 'yyyy-MM-dd'))
        .in('status', ['confirmed', 'checked_in'])
        .order('check_in', { ascending: true });
      
      if (error) throw error;
      return withGuestData(data as any);
    }
  });

  // Wäscheset-Definitionen laden
  const { data: linenDefinitions } = useQuery({
    queryKey: ['linen-set-definitions', house.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_set_definitions')
        .select('*')
        .eq('house_id', house.id)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  });

  // AI-Optimierung laden (optional)
  const { data: aiOptimization } = useQuery({
    queryKey: ['ai-optimization-results', house.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_optimization_results')
        .select('*')
        .eq('house_id', house.id)
        .order('analysis_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    }
  });

  // Extract dynamic labels from linen definitions
  const customLabels = getLabelsFromLinenDef(linenDefinitions);

  /*
   * Set-Zeilen des Hauses und Preis je Set-Schluessel.
   *
   * `preisJeSchluessel` ersetzt das alte `prices`-Objekt an allen Stellen,
   * die frueher ai_linen_settings.prices nachschlugen. Der Schluessel ist
   * derselbe wie in linen_orders.items, der Preis kommt jetzt aber ueber
   * die Artikelnummer.
   *
   * ACHTUNG bei Paketartikeln: mehrere Set-Zeilen koennen auf MW4 zeigen.
   * Hier traegt jede davon den vollen Paketpreis — die Aufschluesselung
   * "Kosten nach Artikel" zeigt damit, WOMIT die Kosten entstehen, nicht
   * eine summierbare Zerlegung. Fuer Summen wird kostenFuerMengen()
   * benutzt, das die Paketregel beachtet.
   */
  const setZeilen = ((linenDefinitions?.custom_categories ?? {}) as SetZeilen);

  const preisJeSchluessel = useMemo(() => {
    const p: Record<string, number> = {};
    for (const [key, zeile] of Object.entries(setZeilen)) {
      const nr = zeile?.external_artikelnummer?.['default'];
      if (!nr) continue;
      let a = artikel.find((x) => x.artikelnummer.toUpperCase() === String(nr).toUpperCase());
      let n = 0;
      while (a?.nachfolger_id && n < 10) {
        const next = artikel.find((x) => x.id === a!.nachfolger_id);
        if (!next) break;
        a = next; n++;
      }
      if (a?.preis != null) p[key] = a.preis;
    }
    return p;
  }, [setZeilen, artikel]);

  // Kostenberechnungen
  const costsData = useMemo(() => {
    if (!ordersWithBookings) return null;

    // REALE Kosten: der bei der Bestellung festgeschriebene Wert (total_cost).
    // NICHT live aus items x prices rechnen — sonst schreibt jede spaetere
    // Preisaenderung die Vergangenheit um. Fallback auf die Live-Rechnung nur,
    // wenn total_cost bei einer Altbestellung fehlt (null), damit sie nicht
    // mit 0 in die Summe faellt.
    const liveCost = (items: any) => {
      if (!items || typeof items !== 'object') return 0;
      return Object.entries(items as Record<string, number>).reduce((total, [itemType, quantity]) => {
        return total + (quantity * (preisJeSchluessel[itemType] || 0));
      }, 0);
    };
    const realOrderCost = (order: any) =>
      typeof order.total_cost === 'number' ? order.total_cost : liveCost(order.items);

    const totalCost = ordersWithBookings.reduce((sum, order) =>
      sum + realOrderCost(order), 0);

    const orderCount = ordersWithBookings.length;
    const avgPerOrder = orderCount > 0 ? totalCost / orderCount : 0;

    // Monatliche Kosten — nach LIEFERdatum (delivery_date), nicht nach
    // Anlagedatum. created_at buendelt oft mehrere Bestellungen in denselben
    // Tag und verzerrt den Monatsschnitt.
    const monthlyData = ordersWithBookings.reduce((acc, order) => {
      const ref = order.delivery_date || order.created_at;
      const month = format(new Date(ref), 'yyyy-MM');
      const cost = realOrderCost(order);
      acc[month] = (acc[month] || 0) + cost;
      return acc;
    }, {} as Record<string, number>);

    const monthlyCosts = Object.entries(monthlyData)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, cost]) => ({
        month: format(new Date(month + '-01'), 'MMM yyyy', { locale: de }),
        cost: Math.round(cost)
      }));

    // Ueber den FESTEN Zeitraum von 6 Monaten mitteln, nicht ueber die Zahl
    // der Monate mit Bestellungen. Sonst ist "Ø pro Monat" bei nur einem
    // aktiven Monat identisch mit den Gesamtkosten.
    const avgPerMonth = totalCost / 6;

    // Kosten nach Artikel-Typ. Diese Aufschluesselung MUSS live aus
    // items x prices gerechnet werden, weil total_cost nur die Summe kennt,
    // nicht die Zerlegung nach Artikeln. Sie zeigt daher "womit die Kosten
    // heute entstuenden" — die Kennzahlen oben (Gesamt/Monat/Bestellung)
    // basieren dagegen auf den realen total_cost-Werten.
    /*
     * Kosten nach TEUNI-ARTIKEL (umgestellt 05.09.2026).
     *
     * Vorher wurde je Set-Schluessel gerechnet. Das ergab zwei Probleme:
     *
     *   Alte Bestellungen tragen Schluessel, die es im heutigen Set nicht
     *   mehr gibt (`bedding`, `large_towels`, `pillow_cases`,
     *   `spannbetttuch`, `small_towels`). Sie fanden keinen Preis und
     *   standen mit 0,00 EUR in der Liste — bei je 41 Stueck.
     *
     *   Und das Paket wurde fuenffach gezaehlt: alle fuenf Bettpositionen
     *   trugen den vollen Preis von MW4, die Summe der Balken lag damit
     *   ueber den Gesamtkosten.
     *
     * artikelAufteilung() loest beide auf: alte Schluessel ueber
     * `alte_schluessel` an der Set-Zeile, Paketartikel genau einmal.
     */
    const costByItemType = Object.values(
      ordersWithBookings.reduce((acc, order) => {
        if (!order.items || typeof order.items !== 'object') return acc;
        const { posten } = artikelAufteilung(
          order.items as Record<string, number>,
          setZeilen,
          artikel,
        );
        for (const p of posten) {
          if (!acc[p.artikelnummer]) {
            acc[p.artikelnummer] = { itemType: p.artikelnummer, label: p.bezeichnung, totalCost: 0 };
          }
          acc[p.artikelnummer].totalCost += p.betrag;
        }
        return acc;
      }, {} as Record<string, { itemType: string; label: string; totalCost: number }>)
    )
      .map((e) => ({ ...e, totalCost: Math.round(e.totalCost) }))
      .sort((a, b) => b.totalCost - a.totalCost);

    const mostExpensiveItem = costByItemType[0] || { label: 'N/A', totalCost: 0 };

    return {
      totalCost,
      orderCount,
      avgPerOrder,
      avgPerMonth,
      monthlyCosts,
      costByItemType,
      mostExpensiveItem
    };
  }, [ordersWithBookings, preisJeSchluessel, setZeilen, artikel, customLabels]);

  // Verbrauchsdaten - use dynamic labels
  const consumptionData = useMemo(() => {
    if (!ordersWithBookings || !linenDefinitions) return null;

    /*
     * Meistbestellte TEUNI-ARTIKEL statt Set-Schluessel.
     *
     * Vorher standen hier Bettwaesche, Badetuecher, Kopfkissen,
     * Handtuecher, Spannbetttuecher mit je 41 Stueck und je 0,00 EUR —
     * fuenf Zeilen fuer EIN Paket, und keine davon mit Preis, weil die
     * Schluessel im heutigen Set nicht mehr vorkommen.
     */
    const topItems = Object.values(
      ordersWithBookings.reduce((acc, order) => {
        if (!order.items || typeof order.items !== 'object') return acc;
        const { posten } = artikelAufteilung(
          order.items as Record<string, number>,
          setZeilen,
          artikel,
        );
        for (const p of posten) {
          if (!acc[p.artikelnummer]) {
            acc[p.artikelnummer] = {
              itemType: p.artikelnummer,
              label: p.bezeichnung,
              totalQuantity: 0,
              totalCost: 0,
            };
          }
          acc[p.artikelnummer].totalQuantity += p.menge;
          acc[p.artikelnummer].totalCost += p.betrag;
        }
        return acc;
      }, {} as Record<string, { itemType: string; label: string; totalQuantity: number; totalCost: number }>)
    )
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 5);

    // Verbrauch pro Gast
    const totalGuestsFromBookings = ordersWithBookings
      .filter(o => o.bookings)
      .reduce((sum, o) => sum + (o.bookings?.number_of_guests || 0), 0);

    // Verbrauch je Gast, ebenfalls nach Artikel — sonst zaehlt ein Paket
    // fuenffach und der Schnitt je Gast ist um das Fuenffache zu hoch.
    const consumptionPerGuest = Object.values(
      ordersWithBookings.reduce((acc, order) => {
        if (!order.items || typeof order.items !== 'object') return acc;
        const { posten } = artikelAufteilung(
          order.items as Record<string, number>,
          setZeilen,
          artikel,
        );
        for (const p of posten) {
          if (!acc[p.artikelnummer]) {
            acc[p.artikelnummer] = { itemType: p.artikelnummer, label: p.bezeichnung, menge: 0 };
          }
          acc[p.artikelnummer].menge += p.menge;
        }
        return acc;
      }, {} as Record<string, { itemType: string; label: string; menge: number }>)
    )
      .map((e) => ({
        itemType: e.itemType,
        label: e.label,
        avgPerGuest: totalGuestsFromBookings > 0 ? e.menge / totalGuestsFromBookings : 0,
      }))
      .sort((a, b) => b.avgPerGuest - a.avgPerGuest);

    return {
      topItems,
      consumptionPerGuest,
      totalBookings: ordersWithBookings.filter(o => o.bookings).length,
      totalGuests: totalGuestsFromBookings
    };
  }, [ordersWithBookings, linenDefinitions, setZeilen, artikel, customLabels]);

  // Prognose-Daten
  const forecastData = useMemo(() => {
    if (!upcomingBookings || !linenDefinitions) return null;

    /*
     * Bedarf einer Buchung aus dem Waescheset (umgestellt 05.09.2026).
     *
     * Vorher standen hier die alten Spalten bedding_per_guest usw. Die
     * setzt LinenSetRulesTab beim Speichern eines Waeschesets ALLE auf 0,
     * und `0 || 1` ergibt in JavaScript 1 — die Prognose meldete also je
     * Position ein Stueck pro Gast, unabhaengig vom tatsaechlichen Set.
     * Ausserdem waren die sieben Positionen fest verdrahtet; Venediger und
     * Wald fuehren heute je fuenf, teils unter anderen Schluesseln.
     *
     * mengenFuerBuchung() beachtet zusaetzlich `active` und die Saison —
     * ein Saunatuch im Sommerset faellt aus der Prognose, wenn es dort
     * nicht vorgesehen ist.
     */
    const calculateBookingDemand = (booking: any) =>
      mengenFuerBuchung(
        setZeilen,
        booking.number_of_guests || 0,
        booking.check_in ? new Date(booking.check_in) : undefined,
      );

    const forecastedDemand = Object.entries(
      upcomingBookings.reduce((acc, booking) => {
        const demand = calculateBookingDemand(booking);
        Object.entries(demand).forEach(([itemType, quantity]) => {
          acc[itemType] = (acc[itemType] || 0) + quantity;
        });
        return acc;
      }, {} as Record<string, number>)
    )
      .map(([itemType, quantity]) => ({
        itemType,
        label: translateItemType(itemType, customLabels),
        quantity
      }))
      .sort((a, b) => b.quantity - a.quantity);

    const totalGuestsNext30Days = upcomingBookings.reduce(
      (sum, b) => sum + b.number_of_guests, 0
    );

    const estimatedCost = forecastedDemand.reduce(
      (sum, item) => sum + item.quantity * (preisJeSchluessel[item.itemType] || 0), 0
    );

    return {
      upcomingBookings,
      forecastedDemand,
      totalGuestsNext30Days,
      estimatedCost,
      calculateBookingDemand
    };
  }, [upcomingBookings, linenDefinitions, preisJeSchluessel, customLabels]);

  if (ordersLoading) {
    return (
      <div className="text-center py-8">
        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
        <p className="text-muted-foreground">Lade Bestellungs-Analysen...</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="costs" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="costs">💰 Kosten</TabsTrigger>
        <TabsTrigger value="consumption">📊 Verbrauch</TabsTrigger>
        <TabsTrigger value="forecast">🔮 Prognose</TabsTrigger>
      </TabsList>

      {/* Tab 1: Kosten */}
      <TabsContent value="costs" className="space-y-4 mt-4">
        {costsData && (
          <>
            {/* Kosten-Übersicht */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Gesamtkosten</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(costsData.totalCost)}</p>
                  <p className="text-xs text-muted-foreground">{costsData.orderCount} Bestellungen</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Ø pro Monat</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(costsData.avgPerMonth)}</p>
                  <p className="text-xs text-muted-foreground">letzte 6 Monate</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Ø pro Bestellung</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(costsData.avgPerOrder)}</p>
                  <p className="text-xs text-muted-foreground">Durchschnitt</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Teuerster Artikel</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-bold">{costsData.mostExpensiveItem.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(costsData.mostExpensiveItem.totalCost)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Kosten-Verlauf */}
            {costsData.monthlyCosts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Kostenentwicklung (letzte 6 Monate)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={costsData.monthlyCosts}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        formatter={(value) => formatCurrency(value as number)}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="cost" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Kosten nach Wäschetyp */}
            {costsData.costByItemType.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Kosten nach Wäschetyp (Gesamt)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={costsData.costByItemType}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="label" 
                        angle={-45} 
                        textAnchor="end" 
                        height={100}
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <Tooltip 
                        formatter={(value) => formatCurrency(value as number)}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '0.5rem'
                        }}
                      />
                      <Bar dataKey="totalCost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </TabsContent>

      {/* Tab 2: Verbrauch */}
      <TabsContent value="consumption" className="space-y-4 mt-4">
        {consumptionData && (
          <>
            {/* Top 5 meistbestellte Artikel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Top 5 meistbestellte Artikel
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {consumptionData.topItems.map((item, index) => (
                  <div key={item.itemType} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge 
                        variant={index === 0 ? 'default' : 'secondary'} 
                        className="w-8 h-8 flex items-center justify-center"
                      >
                        {index + 1}
                      </Badge>
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{item.totalQuantity}x</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.totalCost)}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Verbrauch pro Gast */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Durchschnittlicher Verbrauch pro Gast</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Basierend auf {consumptionData.totalBookings} Buchungen mit {consumptionData.totalGuests} Gästen
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={consumptionData.consumptionPerGuest} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      type="number"
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      dataKey="label" 
                      type="category" 
                      width={150}
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '0.5rem'
                      }}
                    />
                    <Bar dataKey="avgPerGuest" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                      <LabelList 
                        dataKey="avgPerGuest" 
                        position="right" 
                        formatter={(val: number) => `${val.toFixed(1)}x`}
                        style={{ fill: 'hsl(var(--foreground))' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </TabsContent>

      {/* Tab 3: Prognose */}
      <TabsContent value="forecast" className="space-y-4 mt-4">
        {forecastData && (
          <>
            {/* Prognose-Übersicht */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Wäschebedarf in den nächsten 30 Tagen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <p className="text-2xl font-bold text-primary">
                        {forecastData.upcomingBookings.length}
                      </p>
                      <p className="text-xs text-muted-foreground">Buchungen</p>
                    </div>
                    <div className="text-center p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <p className="text-2xl font-bold text-primary">
                        {forecastData.totalGuestsNext30Days}
                      </p>
                      <p className="text-xs text-muted-foreground">Gäste</p>
                    </div>
                    <div className="text-center p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <p className="text-2xl font-bold text-primary">
                        {formatCurrency(forecastData.estimatedCost)}
                      </p>
                      <p className="text-xs text-muted-foreground">Geschätzte Kosten</p>
                    </div>
                  </div>

                  {/* Prognostizierter Bedarf */}
                  {forecastData.forecastedDemand.length > 0 && (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={forecastData.forecastedDemand}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="label" 
                          angle={-45} 
                          textAnchor="end" 
                          height={100}
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis 
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '0.5rem'
                          }}
                        />
                        <Bar dataKey="quantity" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Kommende Buchungen */}
            {forecastData.upcomingBookings.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Kommende Buchungen & Bedarf</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {forecastData.upcomingBookings.slice(0, 5).map(booking => {
                      const daysUntil = Math.ceil(
                        (new Date(booking.check_in).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                      );
                      const demand = forecastData.calculateBookingDemand(booking);
                      
                      return (
                        <div key={booking.id} className="flex items-start gap-3 p-3 border rounded-lg">
                          <div className="flex-shrink-0">
                            <Badge variant={daysUntil <= 7 ? 'destructive' : 'default'}>
                              in {daysUntil}d
                            </Badge>
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{booking.guest_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(booking.check_in), 'dd.MM.yyyy', { locale: de })} • {booking.number_of_guests} Gäste
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {Object.entries(demand)
                                .filter(([, quantity]) => quantity > 0)
                                .slice(0, 4)
                                .map(([itemType, quantity]) => (
                                  <Badge key={itemType} variant="secondary" className="text-xs">
                                    {translateItemType(itemType)}: {quantity}x
                                  </Badge>
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* KI-Insights (wenn vorhanden) */}
            {aiOptimization && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-primary" />
                    KI-gestützte Empfehlungen
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>💡 Letzte KI-Analyse</AlertTitle>
                    <AlertDescription>
                      Analyse vom {format(new Date(aiOptimization.analysis_date), 'dd.MM.yyyy', { locale: de })}
                      {aiOptimization.confidence_score && (
                        <span> • Konfidenz: {Math.round(aiOptimization.confidence_score)}%</span>
                      )}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {(!forecastData || forecastData.upcomingBookings.length === 0) && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Keine zukünftigen Buchungen</AlertTitle>
            <AlertDescription>
              Es sind keine Buchungen in den nächsten 30 Tagen vorhanden.
            </AlertDescription>
          </Alert>
        )}
      </TabsContent>
    </Tabs>
  );
};
