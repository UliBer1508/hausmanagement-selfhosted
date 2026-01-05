import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { differenceInDays, parseISO } from "date-fns";
import { LINEN_ORDER_STATUSES } from "@/lib/linenOrderHelpers";

interface UrgentOrder {
  id: string;
  delivery_date: string;
  created_at: string;
  houses: { name: string } | null;
}

const LinenApprovalAlertBanner = () => {
  const { data: urgentOrders } = useQuery({
    queryKey: ['urgent-approval-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('linen_orders')
        .select('id, delivery_date, created_at, houses(name)')
        .eq('status', LINEN_ORDER_STATUSES.OFFEN)
        .order('delivery_date', { ascending: true });
      
      if (error) throw error;
      
      const now = new Date();
      
      // Filter: Bestellungen die dringend sind (Lieferung in <5 Tagen oder erstellt vor >3 Tagen)
      return (data as UrgentOrder[])?.filter(order => {
        const daysUntilDelivery = differenceInDays(parseISO(order.delivery_date), now);
        const daysSinceCreation = differenceInDays(now, parseISO(order.created_at));
        return daysUntilDelivery <= 5 || daysSinceCreation >= 3;
      }) || [];
    },
    refetchInterval: 60000, // Alle 60 Sekunden aktualisieren
  });

  if (!urgentOrders?.length) return null;

  const criticalCount = urgentOrders.filter(order => {
    const daysUntilDelivery = differenceInDays(parseISO(order.delivery_date), new Date());
    return daysUntilDelivery <= 3;
  }).length;

  return (
    <Alert variant={criticalCount > 0 ? "destructive" : "default"} className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span>
          <strong>{urgentOrders.length} Wäsche-Bestellung(en)</strong> warten auf Genehmigung!
          {criticalCount > 0 && (
            <span className="ml-1 text-destructive font-medium">
              ({criticalCount} kritisch - Lieferung in ≤3 Tagen)
            </span>
          )}
        </span>
        <Link 
          to="/haeuser" 
          className="ml-4 underline hover:no-underline font-medium"
        >
          Jetzt prüfen →
        </Link>
      </AlertDescription>
    </Alert>
  );
};

export default LinenApprovalAlertBanner;
